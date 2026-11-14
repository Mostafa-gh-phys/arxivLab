export interface AuthorDetail {
  name: string;
  inspireRecid?: string;
  affiliation?: string;
}

export interface ArxivPaper {
  id: string; // Canonical arXiv ID (e.g. "2401.12345") or INSPIRE key (e.g. "inspire:3227929")
  versionedId: string; // e.g. "2401.12345v2" or "inspire:3227929"
  title: string;
  authors: string[];
  abstract: string;
  primaryCategory: string;
  categories: string[];
  published: string; // ISO date string
  updated: string; // ISO date string
  pdfUrl: string;
  absUrl: string;
  htmlUrl: string;
  doi?: string;
  journalRef?: string;
  comment?: string;
  listingSection?: 'new' | 'cross' | 'replacement';
  source?: 'arxiv' | 'inspirehep';
  inspireId?: string;
  inspireUrl?: string;
  documentTypes?: string[];
  citationCount?: number;
  texkey?: string;
  authorDetails?: AuthorDetail[];
}

export interface SavedPaper extends ArxivPaper {
  savedAt: string;
  tags: string[];
  notes: string;
  zoteroItemKey?: string;
  zoteroSyncedAt?: string;
  fullTextCached?: boolean;
  fullTextExcerpt?: string;
  pdfCached?: boolean;
  pdfSizeBytes?: number;
}

export type ArxivSearchField = 'all' | 'ti' | 'au' | 'abs' | 'id';
export type ArxivSortBy = 'submittedDate' | 'lastUpdatedDate' | 'relevance';
export type ArxivSortOrder = 'descending' | 'ascending';

export interface ArxivSearchParams {
  query: string;
  field?: ArxivSearchField;
  categories?: string[];
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  sortBy?: ArxivSortBy;
  sortOrder?: ArxivSortOrder;
  start?: number;
  maxResults?: number;
}

export type ArxivBrowseMode = 'new' | 'recent' | 'current';
export type ArxivBrowseSection = 'all' | 'new' | 'cross' | 'replacement';

export interface ArxivBrowseParams {
  category: string;
  mode: ArxivBrowseMode;
  section?: ArxivBrowseSection;
  filterText?: string;
  maxResults?: number;
}

export interface ArxivSearchResult {
  papers: ArxivPaper[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  queryUrl: string;
  fetchedAt: string;
  browseMeta?: {
    mode: ArxivBrowseMode;
    category: string;
    mailingLabel?: string;
  };
}

export type InspireSearchField = 'all' | 'title' | 'author' | 'abstract' | 'eprint' | 'collaboration';
export type InspireSortBy = 'mostrecent' | 'mostcited' | 'bestmatch';

export interface InspireLiteratureParams {
  query: string;
  field?: InspireSearchField;
  documentType?: string;
  subject?: string;
  yearFrom?: string;
  yearTo?: string;
  minCitations?: number;
  sortBy?: InspireSortBy;
  size?: number;
}

export interface InspireLiteratureResult {
  papers: ArxivPaper[];
  totalResults: number;
  queryUrl: string;
  fetchedAt: string;
}

export type InspireJobStatus = 'open' | 'closed' | 'all';

export interface InspireJobsParams {
  query: string;
  status?: InspireJobStatus;
  rank?: string;
  region?: string;
  category?: string;
  size?: number;
}

export interface InspireJob {
  id: string;
  position: string;
  institutions: string[];
  ranks: string[];
  regions: string[];
  status: string;
  deadlineDate?: string;
  categories: string[];
  descriptionText: string;
  urls: string[];
  contacts: Array<{ name?: string; email?: string }>;
  inspireUrl: string;
  updated?: string;
}

export interface InspireJobsResult {
  jobs: InspireJob[];
  totalResults: number;
  queryUrl: string;
  fetchedAt: string;
}

export interface AuthorResolution {
  name: string;
  arxivUrl: string;
  arxivPaperCount: number;
  arxivSamplePapers: Array<{ id: string; title: string; published: string }>;
  inspireUrl: string | null;
  inspireRecid?: string;
  inspireAffiliation?: string;
  inspireOrcid?: string;
  inspireCategories?: string[];
  googleScholarUrl: string;
  hasDirectPage: boolean;
}

export type ZoteroConnectionMode = 'web_api' | 'local_desktop';

export interface ZoteroCollection {
  key: string;
  name: string;
  parentCollection?: string | false;
  numItems?: number;
}

export interface ZoteroConfig {
  mode: ZoteroConnectionMode;
  userId: string;
  apiKey: string; // Masked when returned to client unless just saved
  hasApiKey?: boolean;
  defaultCollectionKey: string;
  localEndpoint: string; // Default: http://127.0.0.1:23119
  autoSyncOnSave: boolean;
}

export type McpTransportMode = 'local_stdio' | 'online_http';
export type McpPermissionMode = 'read_save' | 'read_only';

export interface McpConfig {
  transportMode: McpTransportMode;
  permissionMode: McpPermissionMode;
  requireBearerToken: boolean;
  bearerToken: string;
  allowZoteroPushFromAgent: boolean;
  cacheFullTextOnAgentRead: boolean;
}

export interface McpActivityEntry {
  id: string;
  timestamp: string;
  transport: 'http' | 'sse' | 'stdio' | 'sandbox';
  method: string;
  toolName?: string;
  status: 'ok' | 'denied' | 'error';
  summary: string;
  durationMs: number;
}

export interface ArxivCategoryOption {
  code: string;
  label: string;
  group: string;
}

export const ARXIV_CATEGORIES: ArxivCategoryOption[] = [
  // High Energy & Theoretical Physics
  { code: 'hep-th', label: 'High Energy Physics - Theory', group: 'Physics' },
  { code: 'hep-ph', label: 'High Energy Physics - Phenomenology', group: 'Physics' },
  { code: 'hep-lat', label: 'High Energy Physics - Lattice', group: 'Physics' },
  { code: 'hep-ex', label: 'High Energy Physics - Experiment', group: 'Physics' },
  { code: 'gr-qc', label: 'General Relativity & Quantum Cosmology', group: 'Physics' },
  { code: 'quant-ph', label: 'Quantum Physics', group: 'Physics' },
  { code: 'math-ph', label: 'Mathematical Physics', group: 'Physics' },
  { code: 'astro-ph', label: 'Astrophysics', group: 'Physics' },
  { code: 'cond-mat', label: 'Condensed Matter', group: 'Physics' },
  { code: 'nucl-th', label: 'Nuclear Theory', group: 'Physics' },
  { code: 'physics.comp-ph', label: 'Computational Physics', group: 'Physics' },
  // Computer Science
  { code: 'cs.AI', label: 'Artificial Intelligence', group: 'Computer Science' },
  { code: 'cs.LG', label: 'Machine Learning', group: 'Computer Science' },
  { code: 'cs.CL', label: 'Computation & Language', group: 'Computer Science' },
  { code: 'cs.CV', label: 'Computer Vision', group: 'Computer Science' },
  { code: 'cs.CR', label: 'Cryptography & Security', group: 'Computer Science' },
  { code: 'cs.DC', label: 'Distributed Computing', group: 'Computer Science' },
  { code: 'cs.OS', label: 'Operating Systems', group: 'Computer Science' },
  // Mathematics & Statistics
  { code: 'math.AG', label: 'Algebraic Geometry', group: 'Mathematics' },
  { code: 'math.DG', label: 'Differential Geometry', group: 'Mathematics' },
  { code: 'math.QA', label: 'Quantum Algebra', group: 'Mathematics' },
  { code: 'math.OC', label: 'Optimization & Control', group: 'Mathematics' },
  { code: 'stat.ML', label: 'Machine Learning (Statistics)', group: 'Statistics' },
  // Quantitative Biology & Finance
  { code: 'q-bio.BM', label: 'Biomolecules', group: 'Quantitative Biology' },
  { code: 'q-bio.NC', label: 'Neurons & Cognition', group: 'Quantitative Biology' },
  { code: 'q-fin.CP', label: 'Computational Finance', group: 'Quantitative Finance' },
];
