import type {
  ArxivPaper,
  AuthorDetail,
  InspireJob,
  InspireJobsParams,
  InspireJobsResult,
  InspireLiteratureParams,
  InspireLiteratureResult,
} from './types';

export const INSPIRE_DOCUMENT_TYPES = [
  { value: '', label: 'All document types' },
  { value: 'article', label: 'Article / Paper' },
  { value: 'review', label: 'Review' },
  { value: 'lectures', label: 'Lectures / Notes' },
  { value: 'thesis', label: 'Thesis / Dissertation' },
  { value: 'conference paper', label: 'Conference Paper' },
  { value: 'proceedings', label: 'Proceedings' },
  { value: 'book', label: 'Book' },
  { value: 'book chapter', label: 'Book Chapter' },
  { value: 'note', label: 'Note' },
  { value: 'report', label: 'Report' },
  { value: 'introductory', label: 'Introductory' },
] as const;

export const INSPIRE_SUBJECTS = [
  'Theory-HEP',
  'Phenomenology-HEP',
  'Experiment-HEP',
  'Lattice',
  'Gravitation and Cosmology',
  'Astrophysics',
  'Math and Math Physics',
  'Quantum Physics',
  'General Physics',
  'Nuclear Theory',
  'Nuclear Experiment',
  'Instrumentation',
  'Accelerators',
  'Computing',
] as const;

export const INSPIRE_JOB_RANKS = [
  { value: '', label: 'All ranks' },
  { value: 'POSTDOC', label: 'Postdoc' },
  { value: 'PHD', label: 'PhD Student' },
  { value: 'JUNIOR', label: 'Junior / Tenure-track' },
  { value: 'SENIOR', label: 'Senior / Faculty' },
  { value: 'STAFF', label: 'Staff Scientist' },
  { value: 'MASTER', label: 'Master' },
  { value: 'VISITOR', label: 'Visitor' },
] as const;

export const INSPIRE_JOB_REGIONS = [
  'Europe',
  'North America',
  'Asia',
  'Australasia',
  'South America',
  'Middle East',
  'Africa',
] as const;

export const INSPIRE_JOB_CATEGORIES = [
  'hep-th',
  'hep-ph',
  'hep-ex',
  'hep-lat',
  'gr-qc',
  'astro-ph',
  'quant-ph',
  'nucl-th',
  'nucl-ex',
  'physics.ins-det',
  'physics.acc-ph',
] as const;

const INSPIRE_TO_LIBRARY_TAG: Record<string, string> = {
  lectures: 'lecture',
  lecture: 'lecture',
  thesis: 'dissertation',
  dissertation: 'dissertation',
  review: 'review',
  'conference paper': 'conference-paper',
  proceedings: 'proceedings',
  'book chapter': 'book-chapter',
  book: 'book',
  note: 'note',
  report: 'report',
  'activity report': 'report',
  introductory: 'introductory',
  article: 'article',
};

export function mapInspireDocumentTypesToTags(
  documentTypes?: string[],
  fallbackComment?: string
): string[] {
  const tags: string[] = [];
  for (const raw of documentTypes || []) {
    const key = raw.trim().toLowerCase();
    if (!key || key === 'published') continue;
    const mapped = INSPIRE_TO_LIBRARY_TAG[key] || key.replace(/\s+/g, '-');
    if (!tags.includes(mapped)) {
      tags.push(mapped);
    }
  }

  // Fallback heuristics from arXiv comment when INSPIRE entry is unavailable
  if (tags.length === 0 && fallbackComment) {
    const lower = fallbackComment.toLowerCase();
    if (/\b(phd|doctoral|master|diploma)?\s*thesis\b|\bdissertation\b/.test(lower)) {
      tags.push('dissertation');
    } else if (/\blecture\s*notes?\b|\blectures?\b|\btasi\b|\bles houches\b/.test(lower)) {
      tags.push('lecture');
    } else if (/\breview\b/.test(lower)) {
      tags.push('review');
    } else if (/\bproceeding|\bconference\b|\btalk\b|\bworkshop\b/.test(lower)) {
      tags.push('conference-paper');
    }
  }

  return tags;
}

export function buildInspireAuthorClause(rawAuthor: string): string {
  const clean = rawAuthor.replace(/"/g, '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';

  // Support explicit numeric INSPIRE author recid passed as "recid:999108" or "authors.recid:999108"
  const recidMatch = clean.match(/^(?:authors?\.)?recid[:\s]+(\d+)$/i);
  if (recidMatch) {
    return `authors.recid:${recidMatch[1]}`;
  }

  // Convert "Last, First Middle" -> "First Middle Last" first so both orderings normalize uniformly
  let normalized = clean;
  if (clean.includes(',')) {
    const [last, ...rest] = clean.split(',');
    const firstPart = rest.join(' ').trim();
    normalized = firstPart ? `${firstPart} ${last.trim()}` : last.trim();
  }

  // Strip dots from middle initials and drop single-letter initials when 2+ longer tokens remain.
  // Importantly, keep unquoted `a First Last`: INSPIRE SPIRES matches both "Last, First" and "First Last",
  // whereas quoted `a "Lin, Ethan"` or `a "Juan M. Maldacena"` misses records and can return 0 hits.
  const tokens = normalized
    .split(/\s+/)
    .map((t) => t.replace(/\.$/, '').trim())
    .filter(Boolean);

  if (tokens.length <= 1) {
    return `a ${tokens[0] || normalized}`;
  }

  const meaningful = tokens.filter((t, idx) => idx === tokens.length - 1 || t.length > 1);
  if (meaningful.length >= 2) {
    return `a ${meaningful.join(' ')}`;
  }
  return `a ${tokens.join(' ')}`;
}

export function buildInspireLiteratureUrl(params: InspireLiteratureParams): string {
  const url = new URL('https://inspirehep.net/api/literature');
  const clauses: string[] = [];
  const rawQuery = (params.query || '').trim();

  if (rawQuery) {
    // Allow direct INSPIRE syntax (e.g. "a maldacena", "t holography", "eprint ...", "recid ...")
    const hasExplicitOperator = /^(?:find\s+|a\s+|t\s+|author:|authors\.recid:|title:|eprint:|arxiv:|cn:|citcount:|date:)/i.test(
      rawQuery
    );
    if (hasExplicitOperator || !params.field || params.field === 'all') {
      clauses.push(rawQuery);
    } else if (params.field === 'title') {
      clauses.push(`t "${rawQuery.replace(/"/g, '')}"`);
    } else if (params.field === 'author') {
      const clause = buildInspireAuthorClause(rawQuery);
      if (clause) clauses.push(clause);
    } else if (params.field === 'abstract') {
      clauses.push(`abs "${rawQuery.replace(/"/g, '')}"`);
    } else if (params.field === 'eprint') {
      clauses.push(`eprint ${rawQuery.replace(/^arXiv:/i, '')}`);
    } else if (params.field === 'collaboration') {
      clauses.push(`cn "${rawQuery.replace(/"/g, '')}"`);
    }
  }

  if (params.documentType?.trim()) {
    url.searchParams.set('doc_type', params.documentType.trim());
  }

  if (params.subject?.trim()) {
    url.searchParams.set('subject', params.subject.trim());
  }

  const fromY = (params.yearFrom || '').trim();
  const toY = (params.yearTo || '').trim();
  if (/^\d{4}$/.test(fromY) && /^\d{4}$/.test(toY)) {
    clauses.push(`de ${fromY}->${toY}`);
  } else if (/^\d{4}$/.test(fromY)) {
    clauses.push(`de >= ${fromY}`);
  } else if (/^\d{4}$/.test(toY)) {
    clauses.push(`de <= ${toY}`);
  }

  if (typeof params.minCitations === 'number' && params.minCitations > 0) {
    clauses.push(`cited ${params.minCitations}->9999999`);
  }

  const finalQ = clauses.length > 0 ? clauses.join(' and ') : 'de >= 2024';
  url.searchParams.set('q', finalQ);

  const sortBy = params.sortBy || 'mostrecent';
  if (sortBy !== 'bestmatch') {
    url.searchParams.set('sort', sortBy);
  }
  url.searchParams.set('size', String(Math.min(50, Math.max(1, params.size ?? 15))));

  return url.toString();
}

export function buildInspireJobsUrl(params: InspireJobsParams): string {
  const url = new URL('https://inspirehep.net/api/jobs');
  const q = (params.query || '').trim();
  if (q) {
    url.searchParams.set('q', q);
  }
  if (params.status && params.status !== 'all') {
    url.searchParams.set('status', params.status);
  }
  if (params.rank?.trim()) {
    url.searchParams.set('rank', params.rank.trim());
  }
  if (params.region?.trim()) {
    url.searchParams.set('region', params.region.trim());
  }
  if (params.category?.trim()) {
    url.searchParams.set('field_of_interest', params.category.trim());
  }
  url.searchParams.set('size', String(Math.min(50, Math.max(1, params.size ?? 15))));
  return url.toString();
}

function formatInspireAuthorName(fullName: string): string {
  const clean = fullName.trim();
  if (!clean.includes(',')) return clean;
  const [last, ...rest] = clean.split(',');
  const first = rest.join(' ').trim();
  return first ? `${first} ${last.trim()}` : clean;
}

function stripHtmlToParagraphs(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&nbsp;/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

export function parseInspireLiteratureResponse(
  payload: Record<string, unknown>,
  queryUrl = ''
): InspireLiteratureResult {
  const hitsObj = (payload.hits || {}) as {
    total?: number | { value?: number };
    hits?: Array<Record<string, unknown>>;
  };
  const totalResults =
    typeof hitsObj.total === 'number'
      ? hitsObj.total
      : Number(hitsObj.total?.value || 0);

  const rawHits = Array.isArray(hitsObj.hits) ? hitsObj.hits : [];
  const papers: ArxivPaper[] = [];

  for (const hit of rawHits) {
    const inspireId = String(hit.id || '').trim();
    const meta = (hit.metadata || {}) as Record<string, unknown>;
    if (!inspireId || !meta) continue;

    const titles = Array.isArray(meta.titles)
      ? (meta.titles as Array<{ title?: string }>)
      : [];
    const title = (titles[0]?.title || '').replace(/\s+/g, ' ').trim();
    if (!title) continue;

    const rawAuthors = Array.isArray(meta.authors)
      ? (meta.authors as Array<{
          full_name?: string;
          recid?: number | string;
          record?: { $ref?: string };
          affiliations?: Array<{ value?: string }>;
        }>)
      : [];

    const authorDetails: AuthorDetail[] = rawAuthors
      .map((a) => {
        const displayName = formatInspireAuthorName(a.full_name || '');
        const recidFromRef = a.record?.$ref?.match(/\/authors\/(\d+)/)?.[1];
        const inspireRecid = a.recid ? String(a.recid) : recidFromRef;
        const affiliation = a.affiliations?.[0]?.value;
        return {
          name: displayName,
          inspireRecid,
          affiliation,
        };
      })
      .filter((a) => Boolean(a.name));

    const authors = authorDetails.map((a) => a.name);

    const eprints = Array.isArray(meta.arxiv_eprints)
      ? (meta.arxiv_eprints as Array<{ value?: string; categories?: string[] }>)
      : [];
    const arxivId = eprints[0]?.value?.trim();
    const eprintCats = Array.isArray(eprints[0]?.categories) ? eprints[0].categories : [];

    const inspireCats = Array.isArray(meta.inspire_categories)
      ? (meta.inspire_categories as Array<{ term?: string }>)
          .map((c) => c.term || '')
          .filter(Boolean)
      : [];

    const primaryArxivCats = Array.isArray(meta.primary_arxiv_category)
      ? (meta.primary_arxiv_category as string[])
      : [];

    const categories = Array.from(
      new Set([...primaryArxivCats, ...eprintCats, ...inspireCats])
    ).filter(Boolean);
    const primaryCategory = categories[0] || 'HEP';

    const abstracts = Array.isArray(meta.abstracts)
      ? (meta.abstracts as Array<{ value?: string }>)
      : [];
    const abstract = (abstracts[0]?.value || '').replace(/\s+/g, ' ').trim();

    const documentTypes = Array.isArray(meta.document_type)
      ? (meta.document_type as string[]).map((d) => String(d).trim()).filter(Boolean)
      : [];

    const dois = Array.isArray(meta.dois)
      ? (meta.dois as Array<{ value?: string }>)
      : [];
    const doi = dois[0]?.value?.trim();

    const pubInfo = Array.isArray(meta.publication_info)
      ? (meta.publication_info as Array<{
          journal_title?: string;
          journal_volume?: string;
          page_start?: string;
          year?: number;
        }>)
      : [];
    const firstPub = pubInfo[0];
    const journalRef = firstPub?.journal_title
      ? [
          firstPub.journal_title,
          firstPub.journal_volume,
          firstPub.year ? `(${firstPub.year})` : '',
          firstPub.page_start,
        ]
          .filter(Boolean)
          .join(' ')
      : undefined;

    const docs = Array.isArray(meta.documents)
      ? (meta.documents as Array<{ url?: string; fulltext?: boolean }>)
      : [];
    const directDocUrl = docs.find((d) => d.url)?.url;

    const earliestDate = String(meta.earliest_date || meta.preprint_date || hit.created || '');
    const publishedIso = earliestDate ? earliestDate : new Date().toISOString();
    const updatedIso = String(hit.updated || publishedIso);

    const id = arxivId || `inspire:${inspireId}`;
    const versionedId = arxivId ? `${arxivId}v1` : `inspire:${inspireId}`;
    const inspireUrl = `https://inspirehep.net/literature/${inspireId}`;
    const pdfUrl = arxivId
      ? `https://arxiv.org/pdf/${arxivId}`
      : directDocUrl || inspireUrl;
    const absUrl = arxivId ? `https://arxiv.org/abs/${arxivId}` : inspireUrl;
    const htmlUrl = arxivId ? `https://arxiv.org/html/${versionedId}` : inspireUrl;

    const texkeys = Array.isArray(meta.texkeys) ? (meta.texkeys as string[]) : [];

    papers.push({
      id,
      versionedId,
      title,
      authors,
      abstract,
      primaryCategory,
      categories: categories.length > 0 ? categories : [primaryCategory],
      published: publishedIso,
      updated: updatedIso,
      pdfUrl,
      absUrl,
      htmlUrl,
      doi,
      journalRef,
      source: 'inspirehep',
      inspireId,
      inspireUrl,
      documentTypes,
      citationCount:
        typeof meta.citation_count === 'number' ? meta.citation_count : undefined,
      texkey: texkeys[0],
      authorDetails,
    });
  }

  return {
    papers,
    totalResults,
    queryUrl,
    fetchedAt: new Date().toISOString(),
  };
}

export function parseInspireJobsResponse(
  payload: Record<string, unknown>,
  queryUrl = ''
): InspireJobsResult {
  const hitsObj = (payload.hits || {}) as {
    total?: number | { value?: number };
    hits?: Array<Record<string, unknown>>;
  };
  const totalResults =
    typeof hitsObj.total === 'number'
      ? hitsObj.total
      : Number(hitsObj.total?.value || 0);

  const rawHits = Array.isArray(hitsObj.hits) ? hitsObj.hits : [];
  const jobs: InspireJob[] = [];

  for (const hit of rawHits) {
    const id = String(hit.id || '').trim();
    const meta = (hit.metadata || {}) as Record<string, unknown>;
    if (!id || !meta) continue;

    const position = String(meta.position || 'Research Position').trim();
    const institutions = Array.isArray(meta.institutions)
      ? (meta.institutions as Array<{ value?: string }>)
          .map((i) => i.value || '')
          .filter(Boolean)
      : [];
    const ranks = Array.isArray(meta.ranks) ? (meta.ranks as string[]).filter(Boolean) : [];
    const regions = Array.isArray(meta.regions) ? (meta.regions as string[]).filter(Boolean) : [];
    const categories = Array.isArray(meta.arxiv_categories)
      ? (meta.arxiv_categories as string[]).filter(Boolean)
      : [];
    const urls = Array.isArray(meta.urls)
      ? (meta.urls as Array<{ value?: string }>).map((u) => u.value || '').filter(Boolean)
      : [];
    const contacts = Array.isArray(meta.contact_details)
      ? (meta.contact_details as Array<{ name?: string; email?: string }>)
      : [];

    jobs.push({
      id,
      position,
      institutions,
      ranks,
      regions,
      status: String(meta.status || 'open'),
      deadlineDate: typeof meta.deadline_date === 'string' ? meta.deadline_date : undefined,
      categories,
      descriptionText: stripHtmlToParagraphs(String(meta.description || '')),
      urls,
      contacts,
      inspireUrl: `https://inspirehep.net/jobs/${id}`,
      updated: typeof hit.updated === 'string' ? hit.updated : undefined,
    });
  }

  return {
    jobs,
    totalResults,
    queryUrl,
    fetchedAt: new Date().toISOString(),
  };
}

export function doesInspireAuthorMatchName(
  queryName: string,
  meta: Record<string, unknown>
): boolean {
  const normalizeTokens = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

  const qTokens = normalizeTokens(queryName);
  if (qTokens.length === 0) return false;

  const nameObj = (meta.name || {}) as {
    value?: string;
    preferred_name?: string;
    name_variants?: string[];
  };
  const candidates = [
    nameObj.value,
    nameObj.preferred_name,
    ...(Array.isArray(nameObj.name_variants) ? nameObj.name_variants : []),
  ].filter((c): c is string => typeof c === 'string' && c.trim().length > 0);

  if (candidates.length === 0) return false;

  // Surname is last token for "First Last" or first token for "Last, First"
  const qSurname = queryName.includes(',')
    ? normalizeTokens(queryName.split(',')[0])[0] || qTokens[0]
    : qTokens[qTokens.length - 1];
  const qFirstInitial = queryName.includes(',')
    ? (normalizeTokens(queryName.split(',')[1] || '')[0] || '')[0]
    : qTokens.length > 1
    ? qTokens[0][0]
    : '';

  return candidates.some((candidate) => {
    const cTokens = normalizeTokens(candidate);
    if (!cTokens.includes(qSurname)) return false;
    if (!qFirstInitial) return true;
    return cTokens.some((tok) => tok !== qSurname && tok.startsWith(qFirstInitial));
  });
}

export function buildAuthorExternalUrls(name: string, inspireRecid?: string) {
  const cleanName = name.trim();
  const encoded = encodeURIComponent(cleanName);
  return {
    arxivUrl: `https://arxiv.org/search/?query=${encodeURIComponent(`"${cleanName}"`)}&searchtype=author`,
    inspireUrl: inspireRecid
      ? `https://inspirehep.net/authors/${inspireRecid}`
      : `https://inspirehep.net/authors?q=${encoded}`,
    googleScholarUrl: `https://scholar.google.com/scholar?q=${encodeURIComponent(`author:"${cleanName}"`)}`,
  };
}
