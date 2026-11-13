import { XMLParser } from 'fast-xml-parser';
import type { ArxivPaper, ArxivSearchParams, ArxivSearchResult } from './types';

const ARXIV_API_BASE = 'https://export.arxiv.org/api/query';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  parseAttributeValue: false,
});

export function normalizeArxivId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  // Match URLs like https://arxiv.org/abs/2401.12345v2 or https://arxiv.org/pdf/hep-th/9711200v1
  const urlMatch = trimmed.match(/arxiv\.org\/(?:abs|pdf|html)\/([^\s?#]+?)(?:\.pdf)?$/i);
  const raw = urlMatch ? urlMatch[1] : trimmed.replace(/^arXiv:/i, '');
  // Strip trailing version like v1, v2
  return raw.replace(/v\d+$/i, '');
}

export function formatArxivDateBound(dateStr: string, boundary: 'start' | 'end'): string | null {
  const clean = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return null;
  const compact = clean.replace(/-/g, '');
  return boundary === 'start' ? `${compact}0000` : `${compact}2359`;
}

export function computeDateRangeFromPreset(
  preset: 'any' | '7d' | '30d' | '1y',
  referenceDate: Date = new Date()
): { dateFrom: string; dateTo: string } {
  if (preset === 'any') {
    return { dateFrom: '', dateTo: '' };
  }
  const to = referenceDate.toISOString().slice(0, 10);
  const fromDate = new Date(referenceDate.getTime());
  if (preset === '7d') {
    fromDate.setUTCDate(fromDate.getUTCDate() - 7);
  } else if (preset === '30d') {
    fromDate.setUTCDate(fromDate.getUTCDate() - 30);
  } else if (preset === '1y') {
    fromDate.setUTCFullYear(fromDate.getUTCFullYear() - 1);
  }
  return {
    dateFrom: fromDate.toISOString().slice(0, 10),
    dateTo: to,
  };
}

export function buildArxivQueryUrl(params: ArxivSearchParams): string {
  const url = new URL(ARXIV_API_BASE);
  const clauses: string[] = [];

  const queryText = (params.query || '').trim();
  const field = params.field || 'all';

  if (field === 'id' && queryText) {
    const id = normalizeArxivId(queryText);
    url.searchParams.set('id_list', id);
    url.searchParams.set('max_results', String(params.maxResults ?? 10));
    return url.toString();
  }

  if (queryText) {
    // Check if query looks like a direct arXiv ID when field is 'all'
    if (
      field === 'all' &&
      /^(\d{4}\.\d{4,5}(v\d+)?|[a-z-]+\/\d{7}(v\d+)?|https?:\/\/arxiv\.org\/)/i.test(queryText)
    ) {
      url.searchParams.set('id_list', normalizeArxivId(queryText));
      url.searchParams.set('max_results', '1');
      return url.toString();
    }

    const prefix = field === 'all' ? 'all' : field;
    const tokens = queryText
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (tokens.length === 1) {
      clauses.push(`${prefix}:${tokens[0]}`);
    } else if (tokens.length > 1) {
      clauses.push(`(${tokens.map((t) => `${prefix}:${t}`).join(' AND ')})`);
    }
  }

  const categories = (params.categories || []).map((c) => c.trim()).filter(Boolean);
  if (categories.length === 1) {
    clauses.push(`cat:${categories[0]}`);
  } else if (categories.length > 1) {
    clauses.push(`(${categories.map((c) => `cat:${c}`).join(' OR ')})`);
  }

  const fromBound = params.dateFrom ? formatArxivDateBound(params.dateFrom, 'start') : null;
  const toBound = params.dateTo ? formatArxivDateBound(params.dateTo, 'end') : null;
  if (fromBound || toBound) {
    const startStr = fromBound ?? '199101010000';
    const endStr = toBound ?? '209912312359';
    clauses.push(`submittedDate:[${startStr} TO ${endStr}]`);
  }

  // Fallback if user runs a completely blank search: return recent hep-th or general feed
  const searchQuery = clauses.length > 0 ? clauses.join(' AND ') : 'cat:hep-th';

  url.searchParams.set('search_query', searchQuery);
  url.searchParams.set('start', String(Math.max(0, params.start ?? 0)));
  url.searchParams.set('max_results', String(Math.min(50, Math.max(1, params.maxResults ?? 15))));
  url.searchParams.set('sortBy', params.sortBy || 'submittedDate');
  url.searchParams.set('sortOrder', params.sortOrder || 'descending');

  return url.toString();
}

function asArray<T>(val: T | T[] | undefined | null): T[] {
  if (val === undefined || val === null) return [];
  return Array.isArray(val) ? val : [val];
}

function cleanWhitespace(text: unknown): string {
  if (typeof text !== 'string') return '';
  return text.replace(/\s+/g, ' ').trim();
}

function extractText(node: unknown): string {
  if (typeof node === 'string') return cleanWhitespace(node);
  if (typeof node === 'number') return String(node);
  if (node && typeof node === 'object' && '#text' in node) {
    return cleanWhitespace((node as Record<string, unknown>)['#text']);
  }
  return '';
}

export function parseArxivAtomFeed(xml: string, queryUrl = ''): ArxivSearchResult {
  const parsed = xmlParser.parse(xml);
  const feed = parsed?.feed;
  if (!feed) {
    return {
      papers: [],
      totalResults: 0,
      startIndex: 0,
      itemsPerPage: 0,
      queryUrl,
      fetchedAt: new Date().toISOString(),
    };
  }

  const totalResults = Number(extractText(feed['opensearch:totalResults']) || 0);
  const startIndex = Number(extractText(feed['opensearch:startIndex']) || 0);
  const itemsPerPage = Number(extractText(feed['opensearch:itemsPerPage']) || 0);

  const rawEntries = asArray(feed.entry);
  const papers: ArxivPaper[] = [];

  for (const entry of rawEntries) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const rawIdUrl = extractText(e.id);
    if (!rawIdUrl) continue;

    // Extract versioned ID from http://arxiv.org/abs/2401.12345v1
    const idMatch = rawIdUrl.match(/arxiv\.org\/abs\/(.+)$/i);
    const versionedId = idMatch ? idMatch[1] : rawIdUrl;
    const id = normalizeArxivId(versionedId);

    const title = extractText(e.title);
    if (!title || title.toLowerCase() === 'error') continue;

    const abstract = extractText(e.summary);
    const authors = asArray(e.author)
      .map((a) => {
        if (typeof a === 'string') return cleanWhitespace(a);
        if (a && typeof a === 'object') {
          return extractText((a as Record<string, unknown>).name);
        }
        return '';
      })
      .filter(Boolean);

    const categoryNodes = asArray(e.category);
    const categories = categoryNodes
      .map((c) => {
        if (c && typeof c === 'object') {
          return String((c as Record<string, unknown>)['@_term'] || '').trim();
        }
        return '';
      })
      .filter(Boolean);

    const primaryCatNode = e['arxiv:primary_category'] as Record<string, unknown> | undefined;
    const primaryCategory =
      (primaryCatNode && String(primaryCatNode['@_term'] || '').trim()) ||
      categories[0] ||
      'unclassified';

    const links = asArray(e.link);
    let pdfUrl = `https://arxiv.org/pdf/${id}`;
    let absUrl = `https://arxiv.org/abs/${id}`;
    for (const link of links) {
      if (!link || typeof link !== 'object') continue;
      const l = link as Record<string, unknown>;
      const href = String(l['@_href'] || '').trim();
      const titleAttr = String(l['@_title'] || '').trim().toLowerCase();
      const rel = String(l['@_rel'] || '').trim().toLowerCase();
      if (titleAttr === 'pdf' && href) {
        pdfUrl = href.replace(/^http:/, 'https:');
      } else if (rel === 'alternate' && href) {
        absUrl = href.replace(/^http:/, 'https:');
      }
    }

    const doi = extractText(e['arxiv:doi']) || undefined;
    const journalRef = extractText(e['arxiv:journal_ref']) || undefined;
    const comment = extractText(e['arxiv:comment']) || undefined;

    papers.push({
      id,
      versionedId,
      title,
      authors,
      abstract,
      primaryCategory,
      categories: categories.length > 0 ? categories : [primaryCategory],
      published: extractText(e.published),
      updated: extractText(e.updated),
      pdfUrl,
      absUrl,
      htmlUrl: `https://arxiv.org/html/${versionedId}`,
      doi,
      journalRef,
      comment,
    });
  }

  return {
    papers,
    totalResults: Number.isFinite(totalResults) ? totalResults : papers.length,
    startIndex: Number.isFinite(startIndex) ? startIndex : 0,
    itemsPerPage: Number.isFinite(itemsPerPage) ? itemsPerPage : papers.length,
    queryUrl,
    fetchedAt: new Date().toISOString(),
  };
}
