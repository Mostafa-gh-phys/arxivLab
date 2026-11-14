import { buildArxivQueryUrl, normalizeArxivId, parseArxivAtomFeed } from '../shared/arxiv';
import { buildArxivBrowseUrl, parseArxivBrowseHtml } from '../shared/arxivBrowse';
import type {
  ArxivBrowseParams,
  ArxivPaper,
  ArxivSearchParams,
  ArxivSearchResult,
} from '../shared/types';
import { dnsAwareRequest, getDnsServersForTarget } from './dnsHttp';
import {
  readCachedFullText,
  readCachedPdf,
  readConfig,
  readLibrary,
  safePdfFileName,
  upsertSavedPaper,
  writeCachedFullText,
  writeCachedPdf,
} from './storage';

const USER_AGENT = 'arXivLab-Workstation/1.0 (https://arxiv.org)';

export async function searchArxiv(params: ArxivSearchParams): Promise<ArxivSearchResult> {
  const queryUrl = buildArxivQueryUrl(params);
  const cfg = await readConfig();
  const dnsServers = getDnsServersForTarget(cfg.network, 'arxiv');

  const res = await dnsAwareRequest(queryUrl, {
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/atom+xml, application/xml, text/xml',
    },
    timeoutMs: 15000,
    dnsServers,
  });

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`arXiv API responded with HTTP ${res.status} ${res.statusText}`);
  }

  return parseArxivAtomFeed(res.text(), queryUrl);
}

export async function browseArxiv(params: ArxivBrowseParams): Promise<ArxivSearchResult> {
  const category = (params.category || 'hep-th').trim() || 'hep-th';
  const mode = params.mode || 'new';
  const section = params.section || 'all';
  const maxResults = Math.min(100, Math.max(5, params.maxResults ?? 25));
  const filterText = (params.filterText || '').trim().toLowerCase();

  const requestShow = filterText || section !== 'all' ? Math.max(100, maxResults) : maxResults;
  const queryUrl = buildArxivBrowseUrl(category, mode, requestShow);

  const cfg = await readConfig();
  const dnsServers = getDnsServersForTarget(cfg.network, 'arxiv');

  const res = await dnsAwareRequest(queryUrl, {
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
    },
    timeoutMs: 18000,
    dnsServers,
  });

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`arXiv browse listing responded with HTTP ${res.status} ${res.statusText}`);
  }

  const parsed = parseArxivBrowseHtml(res.text(), {
    category,
    mode,
    queryUrl,
  });

  let filtered = parsed.papers;
  if (mode === 'new' && section !== 'all') {
    filtered = filtered.filter((p) => p.listingSection === section);
  }
  if (filterText) {
    filtered = filtered.filter(
      (p) =>
        p.title.toLowerCase().includes(filterText) ||
        p.authors.some((a) => a.toLowerCase().includes(filterText)) ||
        p.abstract.toLowerCase().includes(filterText) ||
        p.id.toLowerCase().includes(filterText)
    );
  }

  let papers = filtered.slice(0, maxResults);

  // For /recent and /current listings (which omit abstracts inline), batch-enrich abstracts via Atom API
  const missingAbstractIds = papers.filter((p) => !p.abstract).map((p) => p.id);
  if (missingAbstractIds.length > 0) {
    try {
      const apiUrl = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(
        missingAbstractIds.join(',')
      )}&max_results=${missingAbstractIds.length}`;
      const apiRes = await dnsAwareRequest(apiUrl, {
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/atom+xml, application/xml, text/xml',
        },
        timeoutMs: 15000,
        dnsServers,
      });
      if (apiRes.status >= 200 && apiRes.status < 300) {
        const enriched = parseArxivAtomFeed(apiRes.text(), apiUrl);
        const byId = new Map(enriched.papers.map((ep) => [ep.id, ep]));
        papers = papers.map((p) => {
          const match = byId.get(p.id);
          if (!match) return p;
          return {
            ...match,
            listingSection: p.listingSection,
          };
        });
      }
    } catch {
      // Keep parsed HTML entries cleanly even if enrichment fails
    }
  }

  return {
    ...parsed,
    papers,
    itemsPerPage: papers.length,
  };
}

export async function fetchPaperById(rawId: string): Promise<ArxivPaper | null> {
  const id = normalizeArxivId(rawId);
  if (!id) return null;

  const saved = await readLibrary();
  const localMatch = saved.find((p) => p.id === id);

  try {
    const result = await searchArxiv({
      query: id,
      field: 'id',
      maxResults: 1,
    });
    if (result.papers.length > 0) {
      return result.papers[0];
    }
  } catch {
    if (localMatch) return localMatch;
    throw new Error(`Unable to fetch arXiv:${id}.`);
  }

  return localMatch || null;
}

function htmlToReadableText(html: string): string {
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<annotation[\s\S]*?<\/annotation>/gi, ' ');

  cleaned = cleaned
    .replace(/<\/(h1|h2|h3|h4|p|section|div|li|tr)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  cleaned = cleaned
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  return cleaned
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n\n')
    .slice(0, 35000);
}

export async function fetchPaperReadableContent(
  paper: ArxivPaper,
  cacheToDisk = true
): Promise<{
  source: 'cached' | 'arxiv-html' | 'abstract-only';
  text: string;
}> {
  const cached = await readCachedFullText(paper.id);
  if (cached) {
    return { source: 'cached', text: cached };
  }

  const cfg = await readConfig();
  const dnsServers = getDnsServersForTarget(cfg.network, 'arxiv');
  const htmlCandidates = [paper.htmlUrl, `https://arxiv.org/html/${paper.id}`];

  for (const url of htmlCandidates) {
    try {
      const res = await dnsAwareRequest(url, {
        headers: { 'User-Agent': USER_AGENT },
        timeoutMs: 12000,
        dnsServers,
      });
      if (res.status >= 200 && res.status < 300) {
        const rawHtml = res.text();
        if (rawHtml && rawHtml.length > 500 && !rawHtml.includes('No HTML for')) {
          const readable = htmlToReadableText(rawHtml);
          if (readable.length > 200) {
            if (cacheToDisk) {
              await writeCachedFullText(paper.id, readable);
            }
            return { source: 'arxiv-html', text: readable };
          }
        }
      }
    } catch {
      // Try next candidate
    }
  }

  const fallbackText = [
    `Title: ${paper.title}`,
    `Authors: ${paper.authors.join(', ')}`,
    `arXiv ID: ${paper.versionedId}`,
    `Categories: ${paper.categories.join(', ')}`,
    `Published: ${paper.published}`,
    paper.journalRef ? `Journal Reference: ${paper.journalRef}` : '',
    paper.doi ? `DOI: ${paper.doi}` : '',
    '',
    'Abstract:',
    paper.abstract,
    '',
    `Note: HTML full-text is not published on arXiv for ${paper.id}; PDF is available at ${paper.pdfUrl}.`,
  ]
    .filter(Boolean)
    .join('\n');

  return { source: 'abstract-only', text: fallbackText };
}

export async function downloadPaperPdf(
  rawId: string,
  saveToDisk = true
): Promise<{
  paperId: string;
  fileName: string;
  buffer: Buffer;
  sizeBytes: number;
  cached: boolean;
}> {
  const trimmed = rawId.trim();
  const isInspire = /^inspire:\d+$/i.test(trimmed);
  const id = isInspire ? trimmed.toLowerCase() : normalizeArxivId(trimmed);
  if (!id) {
    throw new Error('Valid paper ID is required.');
  }

  const existingBuffer = await readCachedPdf(id);
  if (existingBuffer && existingBuffer.byteLength > 100) {
    return {
      paperId: id,
      fileName: safePdfFileName(id),
      buffer: existingBuffer,
      sizeBytes: existingBuffer.byteLength,
      cached: true,
    };
  }

  const cfg = await readConfig();
  const dnsServers = getDnsServersForTarget(cfg.network, 'arxiv');
  const saved = await readLibrary();
  const savedMatch = saved.find((p) => p.id === id);

  const candidates: string[] = [];
  if (isInspire) {
    if (savedMatch?.pdfUrl && /^https?:\/\//i.test(savedMatch.pdfUrl)) {
      candidates.push(savedMatch.pdfUrl);
    }
    const recid = id.replace(/^inspire:/, '');
    try {
      const metaRes = await dnsAwareRequest(
        `https://inspirehep.net/api/literature/${encodeURIComponent(recid)}`,
        {
          method: 'GET',
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
          timeoutMs: 12000,
          dnsServers,
        }
      );
      if (metaRes.status >= 200 && metaRes.status < 300) {
        const json = metaRes.json<{
          metadata?: {
            arxiv_eprints?: Array<{ value?: string }>;
            documents?: Array<{ url?: string }>;
          };
        }>();
        const eprint = json.metadata?.arxiv_eprints?.[0]?.value;
        if (eprint) {
          candidates.push(`https://arxiv.org/pdf/${eprint}.pdf`);
        }
        for (const doc of json.metadata?.documents || []) {
          if (doc.url && !candidates.includes(doc.url)) {
            candidates.push(doc.url);
          }
        }
      }
    } catch {
      // Fall through to saved candidates
    }
  } else {
    candidates.push(`https://arxiv.org/pdf/${id}.pdf`, `https://arxiv.org/pdf/${id}`);
  }

  let downloaded: Buffer | null = null;
  let lastError = 'PDF download failed';

  for (const url of candidates) {
    try {
      const res = await dnsAwareRequest(url, {
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/pdf,*/*',
        },
        timeoutMs: 30000,
        dnsServers,
      });

      if (res.status >= 200 && res.status < 300) {
        const headerStr = res.bodyBuffer.subarray(0, 8).toString('ascii');
        const contentType = String(res.headers['content-type'] || '').toLowerCase();
        if (headerStr.startsWith('%PDF') || contentType.includes('application/pdf')) {
          downloaded = res.bodyBuffer;
          break;
        }
        lastError = `arXiv returned non-PDF content (${contentType || 'unknown'})`;
      } else {
        lastError = `arXiv PDF endpoint returned HTTP ${res.status}`;
      }
    } catch (err: unknown) {
      lastError = (err as Error).message;
    }
  }

  if (!downloaded) {
    throw new Error(lastError);
  }

  if (saveToDisk) {
    await writeCachedPdf(id, downloaded);
    const saved = await readLibrary();
    const match = saved.find((p) => p.id === id);
    if (match) {
      await upsertSavedPaper({
        ...match,
        pdfCached: true,
        pdfSizeBytes: downloaded.byteLength,
      });
    }
  }

  return {
    paperId: id,
    fileName: safePdfFileName(id),
    buffer: downloaded,
    sizeBytes: downloaded.byteLength,
    cached: false,
  };
}
