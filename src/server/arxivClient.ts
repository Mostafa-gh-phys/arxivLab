import type { Response } from 'express';
import {
  buildArxivQueryUrl,
  buildSafePdfDownloadFilename,
  normalizeArxivId,
  parseArxivAtomFeed,
} from '../shared/arxiv';
import {
  buildArxivBrowseUrl,
  normalizeArxivCategoryCode,
  parseArxivBrowseHtml,
} from '../shared/arxivBrowse';
import type {
  ArxivBrowseParams,
  ArxivPaper,
  ArxivSearchParams,
  ArxivSearchResult,
  SavedPaper,
} from '../shared/types';
import {
  dnsAwareRequest,
  dnsAwareStreamRequest,
  getDnsServersForTarget,
} from './dnsHttp';
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

const USER_AGENT = 'arXivLab-Workstation/2.0 (https://arxiv.org)';

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
  const category = normalizeArxivCategoryCode(params.category);
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

  if (res.status === 404) {
    throw new Error(
      `arXiv archive category "${category}" was not found. Use an official arXiv code such as hep-th, cs.AI, or math.AG.`
    );
  }
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
  const missingAbstractIds = papers.filter((p) => !p.abstract).map((p) => p.id).slice(0, 40);
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
        timeoutMs: 12000,
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

function normalizePdfTarget(rawId: string): {
  id: string;
  isInspire: boolean;
} {
  const trimmed = rawId.trim();
  const isInspire = /^inspire:\d+$/i.test(trimmed);
  const id = isInspire ? trimmed.toLowerCase() : normalizeArxivId(trimmed);
  if (!id) {
    throw new Error('Valid paper ID is required.');
  }
  return { id, isInspire };
}

async function resolvePdfCandidates(
  id: string,
  isInspire: boolean,
  savedMatch: SavedPaper | undefined,
  dnsServers: string[]
): Promise<string[]> {
  const candidates: string[] = [];
  if (isInspire) {
    if (
      savedMatch?.pdfUrl &&
      /^https?:\/\//i.test(savedMatch.pdfUrl) &&
      !/inspirehep\.net\/literature\/\d+$/i.test(savedMatch.pdfUrl)
    ) {
      candidates.push(savedMatch.pdfUrl);
    }
    const recid = id.replace(/^inspire:/, '');
    try {
      const metaRes = await dnsAwareRequest(
        `https://inspirehep.net/api/literature/${encodeURIComponent(recid)}`,
        {
          method: 'GET',
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
          timeoutMs: 10000,
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
          candidates.push(`https://arxiv.org/pdf/${eprint}`);
        }
        for (const doc of json.metadata?.documents || []) {
          if (doc.url && !candidates.includes(doc.url)) {
            candidates.push(doc.url);
          }
        }
      }
    } catch {
      // Fall through
    }
  } else {
    // Canonical direct PDF URL without `.pdf` avoids arXiv's 301 redirect hop
    candidates.push(`https://arxiv.org/pdf/${id}`, `https://export.arxiv.org/pdf/${id}`);
  }
  return candidates;
}

async function persistDownloadedPdf(
  id: string,
  buffer: Buffer,
  savedMatch: SavedPaper | undefined
): Promise<void> {
  await writeCachedPdf(id, buffer);
  if (savedMatch) {
    await upsertSavedPaper({
      ...savedMatch,
      pdfCached: true,
      pdfSizeBytes: buffer.byteLength,
    });
  }
}

export async function streamPaperPdfToResponse(
  rawId: string,
  expressRes: Response,
  options: {
    saveToDisk: boolean;
    inlineView: boolean;
    titleHint?: string;
  }
): Promise<void> {
  const { id, isInspire } = normalizePdfTarget(rawId);
  const saved = await readLibrary();
  const savedMatch = saved.find((p) => p.id === id);
  const downloadName = buildSafePdfDownloadFilename(id, options.titleHint || savedMatch?.title);

  const existingBuffer = await readCachedPdf(id);
  if (existingBuffer && existingBuffer.byteLength > 100 && existingBuffer.subarray(0, 4).toString('ascii') === '%PDF') {
    expressRes.setHeader('Content-Type', 'application/pdf');
    expressRes.setHeader('Content-Length', String(existingBuffer.byteLength));
    expressRes.setHeader('Cache-Control', 'no-store');
    expressRes.setHeader(
      'Content-Disposition',
      `${options.inlineView ? 'inline' : 'attachment'}; filename="${downloadName}"`
    );
    expressRes.send(existingBuffer);
    return;
  }

  const cfg = await readConfig();
  const dnsServers = getDnsServersForTarget(cfg.network, 'arxiv');
  const candidates = await resolvePdfCandidates(id, isInspire, savedMatch, dnsServers);

  if (candidates.length === 0) {
    throw new Error(`No downloadable PDF link is attached to ${id}.`);
  }

  let lastError = 'PDF download failed';

  for (const url of candidates) {
    try {
      const upstream = await dnsAwareStreamRequest(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/pdf,*/*',
        },
        timeoutMs: 30000,
        dnsServers,
      });

      if (upstream.status < 200 || upstream.status >= 300) {
        upstream.stream.resume();
        lastError = `PDF endpoint returned HTTP ${upstream.status}`;
        continue;
      }

      const contentType = String(upstream.headers['content-type'] || '').toLowerCase();
      const firstChunk = await new Promise<Buffer | null>((resolve, reject) => {
        const onData = (chunk: Buffer | string) => {
          cleanup();
          resolve(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        };
        const onEnd = () => {
          cleanup();
          resolve(null);
        };
        const onError = (err: Error) => {
          cleanup();
          reject(err);
        };
        const cleanup = () => {
          upstream.stream.off('data', onData);
          upstream.stream.off('end', onEnd);
          upstream.stream.off('error', onError);
        };
        upstream.stream.on('data', onData);
        upstream.stream.on('end', onEnd);
        upstream.stream.on('error', onError);
      });

      if (!firstChunk || firstChunk.byteLength === 0) {
        lastError = 'Upstream returned an empty response';
        continue;
      }

      const isPdfMagic = firstChunk.subarray(0, 5).toString('ascii') === '%PDF-';
      if (!isPdfMagic && !contentType.includes('application/pdf')) {
        upstream.stream.destroy();
        lastError = `Endpoint returned non-PDF content (${contentType || 'unknown'})`;
        continue;
      }

      expressRes.setHeader('Content-Type', 'application/pdf');
      if (upstream.headers['content-length']) {
        expressRes.setHeader('Content-Length', String(upstream.headers['content-length']));
      }
      expressRes.setHeader('Cache-Control', 'no-store');
      expressRes.setHeader(
        'Content-Disposition',
        `${options.inlineView ? 'inline' : 'attachment'}; filename="${downloadName}"`
      );

      const collected: Buffer[] = options.saveToDisk ? [firstChunk] : [];
      expressRes.write(firstChunk);

      await new Promise<void>((resolve, reject) => {
        upstream.stream.on('data', (chunk: Buffer | string) => {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          if (options.saveToDisk) {
            collected.push(buf);
          }
          expressRes.write(buf);
        });
        upstream.stream.on('end', () => {
          expressRes.end();
          resolve();
        });
        upstream.stream.on('error', (err) => {
          if (!expressRes.writableEnded) {
            expressRes.end();
          }
          reject(err);
        });
        expressRes.on('close', () => {
          if (!upstream.stream.destroyed) {
            upstream.stream.destroy();
          }
        });
      });

      if (options.saveToDisk && collected.length > 0) {
        const fullBuf = Buffer.concat(collected);
        if (fullBuf.byteLength > 100) {
          void persistDownloadedPdf(id, fullBuf, savedMatch).catch(() => {});
        }
      }
      return;
    } catch (err: unknown) {
      lastError = (err as Error).message;
    }
  }

  throw new Error(lastError);
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
  const { id, isInspire } = normalizePdfTarget(rawId);

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

  const candidates = await resolvePdfCandidates(id, isInspire, savedMatch, dnsServers);
  if (candidates.length === 0) {
    throw new Error(`No downloadable PDF link is attached to ${id}.`);
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
    await persistDownloadedPdf(id, downloaded, savedMatch);
  }

  return {
    paperId: id,
    fileName: safePdfFileName(id),
    buffer: downloaded,
    sizeBytes: downloaded.byteLength,
    cached: false,
  };
}
