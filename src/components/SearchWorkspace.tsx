import { useEffect, useState, type FormEvent } from 'react';
import {
  Bookmark,
  BookmarkCheck,
  Download,
  Loader2,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { computeDateRangeFromPreset } from '../shared/arxiv';
import { triggerPaperPdfDownload } from '../shared/download';
import {
  ARXIV_CATEGORIES,
  type ArxivBrowseMode,
  type ArxivBrowseParams,
  type ArxivBrowseSection,
  type ArxivPaper,
  type ArxivSearchField,
  type ArxivSearchResult,
  type ArxivSortBy,
  type SavedPaper,
} from '../shared/types';
import { AuthorLinkList } from './AuthorLinkList';
import { AuthorProfileBanner } from './AuthorProfileBanner';
import { PaperReaderPanel } from './PaperReaderPanel';

type UnifiedFeedScope = 'search' | ArxivBrowseMode;

interface SearchWorkspaceProps {
  searchResult: ArxivSearchResult | null;
  loading: boolean;
  error: string | null;
  savedIds: Set<string>;
  selectedPaper: ArxivPaper | SavedPaper | null;
  onSelectPaper: (paper: ArxivPaper | null) => void;
  onRunSearch: (params: {
    query: string;
    field: ArxivSearchField;
    categories: string[];
    dateFrom: string;
    dateTo: string;
    sortBy: ArxivSortBy;
    maxResults: number;
  }) => Promise<void>;
  onRunBrowse: (params: ArxivBrowseParams) => Promise<void>;
  onSavePaper: (paper: ArxivPaper) => Promise<void>;
  onSyncZotero: (paper: ArxivPaper) => Promise<void>;
  onSearchAuthorInInspire?: (authorName: string, inspireRecid?: string) => void;
  pendingAuthorQuery?: string | null;
  onClearPendingAuthorQuery?: () => void;
}

const FEATURED_CATEGORIES = [
  'hep-th',
  'hep-ph',
  'gr-qc',
  'quant-ph',
  'math-ph',
  'astro-ph',
  'cond-mat',
  'cs.AI',
  'cs.LG',
  'cs.CL',
];

const FEED_SCOPES: Array<{
  id: UnifiedFeedScope;
  label: string;
  description: string;
}> = [
  { id: 'search', label: 'All arXiv', description: 'Full archive search with date & field filters' },
  { id: 'new', label: 'New Mailing', description: 'Most recent daily mailing (with abstracts)' },
  { id: 'recent', label: 'Recent (5d)', description: 'Last 5 daily mailings' },
  { id: 'current', label: 'This Month', description: "Current month's archive listings" },
];

export function SearchWorkspace({
  searchResult,
  loading,
  error,
  savedIds,
  selectedPaper,
  onSelectPaper,
  onRunSearch,
  onRunBrowse,
  onSavePaper,
  onSyncZotero,
  onSearchAuthorInInspire,
  pendingAuthorQuery,
  onClearPendingAuthorQuery,
}: SearchWorkspaceProps) {
  const [feedScope, setFeedScope] = useState<UnifiedFeedScope>('search');
  const [browseSection, setBrowseSection] = useState<ArxivBrowseSection>('all');
  const [query, setQuery] = useState('');
  const [field, setField] = useState<ArxivSearchField>('all');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['hep-th']);
  const [customCategory, setCustomCategory] = useState('');
  const [datePreset, setDatePreset] = useState<'any' | '7d' | '30d' | '1y' | 'custom'>('any');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<ArxivSortBy>('submittedDate');
  const [maxResults, setMaxResults] = useState(15);
  const [activeAuthorBanner, setActiveAuthorBanner] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    if (pendingAuthorQuery) {
      setFeedScope('search');
      setQuery(pendingAuthorQuery);
      setField('au');
      setActiveAuthorBanner(pendingAuthorQuery);
      void onRunSearch({
        query: pendingAuthorQuery,
        field: 'au',
        categories: [],
        dateFrom: '',
        dateTo: '',
        sortBy: 'submittedDate',
        maxResults,
      });
      onClearPendingAuthorQuery?.();
    }
  }, [pendingAuthorQuery, onClearPendingAuthorQuery, onRunSearch, maxResults]);

  const isMailingScope = feedScope !== 'search';
  const activeBrowseCategory = selectedCategories[0] || 'hep-th';

  const triggerUnifiedQuery = async (overrides?: {
    scope?: UnifiedFeedScope;
    section?: ArxivBrowseSection;
    categories?: string[];
    queryText?: string;
  }) => {
    const scope = overrides?.scope ?? feedScope;
    const section = overrides?.section ?? browseSection;
    const cats = overrides?.categories ?? selectedCategories;
    const qText = overrides?.queryText ?? query;

    if (scope !== 'search') {
      const cat = cats[0] || 'hep-th';
      await onRunBrowse({
        category: cat,
        mode: scope,
        section,
        filterText: qText,
        maxResults,
      });
      return;
    }

    await onRunSearch({
      query: qText,
      field,
      categories: cats,
      dateFrom,
      dateTo,
      sortBy,
      maxResults,
    });
  };

  const toggleCategory = (code: string) => {
    if (isMailingScope) {
      const nextCats = [code];
      setSelectedCategories(nextCats);
      void triggerUnifiedQuery({ categories: nextCats });
      return;
    }
    setSelectedCategories((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const selectCategoryFromPicker = (code: string) => {
    const clean = code.trim();
    if (!clean) return;
    if (isMailingScope) {
      const nextCats = [clean];
      setSelectedCategories(nextCats);
      setCustomCategory('');
      void triggerUnifiedQuery({ categories: nextCats });
      return;
    }
    if (!selectedCategories.includes(clean)) {
      setSelectedCategories((prev) => [...prev, clean]);
    }
    setCustomCategory('');
  };

  const handleFeedScopeChange = (nextScope: UnifiedFeedScope) => {
    setFeedScope(nextScope);
    if (nextScope !== 'search') {
      const cat = selectedCategories[0] || 'hep-th';
      const nextCats = [cat];
      setSelectedCategories(nextCats);
      void triggerUnifiedQuery({ scope: nextScope, categories: nextCats });
    } else {
      void triggerUnifiedQuery({ scope: 'search' });
    }
  };

  const handlePresetClick = (preset: 'any' | '7d' | '30d' | '1y') => {
    setDatePreset(preset);
    const range = computeDateRangeFromPreset(preset);
    setDateFrom(range.dateFrom);
    setDateTo(range.dateTo);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (field !== 'au' || !query.trim()) {
      setActiveAuthorBanner(null);
    } else if (field === 'au' && query.trim()) {
      setActiveAuthorBanner(query.trim());
    }
    await triggerUnifiedQuery();
  };

  const handleReset = () => {
    setFeedScope('search');
    setBrowseSection('all');
    setQuery('');
    setField('all');
    setSelectedCategories(['hep-th']);
    setDatePreset('any');
    setDateFrom('');
    setDateTo('');
    setSortBy('submittedDate');
    setMaxResults(15);
    setActiveAuthorBanner(null);
  };

  const handleSearchAuthorHere = (authorName: string) => {
    setFeedScope('search');
    setQuery(authorName);
    setField('au');
    setActiveAuthorBanner(authorName);
    void onRunSearch({
      query: authorName,
      field: 'au',
      categories: [],
      dateFrom: '',
      dateTo: '',
      sortBy: 'submittedDate',
      maxResults,
    });
  };

  const handleCardDownload = async (paper: ArxivPaper) => {
    setDownloadingId(paper.id);
    try {
      await triggerPaperPdfDownload(paper);
    } catch {
      // Errors also surface on inspect/reader if upstream rejects
    } finally {
      setDownloadingId((curr) => (curr === paper.id ? null : curr));
    }
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
      {/* Phone Quick Search & Scope Bar (hidden on lg+) */}
      <div className="space-y-2.5 rounded-xl border border-black/[0.08] bg-white p-3.5 lg:hidden">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="text"
              aria-label="Quick search arXiv"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                isMailingScope ? 'Filter mailing papers...' : 'Search arXiv keywords, author, ID...'
              }
              className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:bg-white focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="min-h-[40px] shrink-0 rounded-lg bg-blue-700 px-3.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
          >
            {loading ? '...' : 'Go'}
          </button>
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((v) => !v)}
            aria-expanded={mobileFiltersOpen}
            aria-label="Toggle arXiv search filters"
            className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors ${
              mobileFiltersOpen
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Filters</span>
          </button>
        </form>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {FEED_SCOPES.map((item) => {
            const active = feedScope === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => handleFeedScopeChange(item.id)}
                className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {item.label}
              </button>
            );
          })}
          <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-500">
            {selectedCategories.join(', ') || 'all'}
          </span>
        </div>
      </div>

      {/* Left Unified arXiv Query & Mailing Column */}
      <aside
        className={`${
          mobileFiltersOpen ? 'block' : 'hidden'
        } lg:block w-full shrink-0 rounded-xl border border-black/[0.08] bg-white p-5 lg:w-80`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h1 className="text-sm font-semibold text-slate-900">arXiv Search &amp; Mailings</h1>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            <span>Reset</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-5">
          {/* Unified Feed / Mailing Scope Selector */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-700">Feed Scope</span>
            <div
              role="group"
              aria-label="arXiv feed scope"
              className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1"
            >
              {FEED_SCOPES.map((item) => {
                const active = feedScope === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    title={item.description}
                    aria-pressed={active}
                    onClick={() => handleFeedScopeChange(item.id)}
                    className={`rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${
                      active
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500">
              {FEED_SCOPES.find((f) => f.id === feedScope)?.description}
            </p>

            {feedScope === 'new' && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
                <span className="block text-[11px] font-medium text-slate-600">
                  Mailing Section
                </span>
                <div className="mt-1.5 grid grid-cols-2 gap-1">
                  {(
                    [
                      { id: 'all', label: 'All entries' },
                      { id: 'new', label: 'New' },
                      { id: 'cross', label: 'Cross-lists' },
                      { id: 'replacement', label: 'Replacements' },
                    ] as const
                  ).map((sec) => (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => {
                        setBrowseSection(sec.id);
                        void triggerUnifiedQuery({ section: sec.id });
                      }}
                      className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                        browseSection === sec.id
                          ? 'border-blue-700 bg-blue-50 text-blue-800'
                          : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {sec.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Keyword & Target Field */}
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <label htmlFor="search-keyword" className="block text-xs font-medium text-slate-700">
              {isMailingScope ? 'Filter mailing (optional)' : 'Keywords, author, or arXiv ID'}
            </label>
            <input
              id="search-keyword"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                isMailingScope
                  ? 'Filter titles, authors, abstracts...'
                  : 'e.g. holographic entropy, 2401.12345'
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
            />
            {!isMailingScope && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="search-field" className="block text-[11px] text-slate-500">
                    Target Field
                  </label>
                  <select
                    id="search-field"
                    value={field}
                    onChange={(e) => setField(e.target.value as ArxivSearchField)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-700 focus:outline-none"
                  >
                    <option value="all">All fields</option>
                    <option value="ti">Title</option>
                    <option value="au">Author</option>
                    <option value="abs">Abstract</option>
                    <option value="id">arXiv ID</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="search-sort" className="block text-[11px] text-slate-500">
                    Sort Order
                  </label>
                  <select
                    id="search-sort"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as ArxivSortBy)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-700 focus:outline-none"
                  >
                    <option value="submittedDate">Submitted Date</option>
                    <option value="lastUpdatedDate">Last Updated</option>
                    <option value="relevance">Relevance</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* arXiv Category Filter */}
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700">
                {isMailingScope ? 'Mailing Category' : 'arXiv Categories'}
              </span>
              {!isMailingScope && selectedCategories.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedCategories([])}
                  className="text-[11px] font-medium text-blue-700 hover:underline"
                >
                  Clear ({selectedCategories.length})
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5" role="group" aria-label="arXiv category filters">
              {FEATURED_CATEGORIES.map((code) => {
                const active = selectedCategories.includes(code);
                const meta = ARXIV_CATEGORIES.find((c) => c.code === code);
                return (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={active}
                    title={meta?.label || code}
                    onClick={() => toggleCategory(code)}
                    className={`rounded-md border px-2 py-1 font-mono text-[11px] font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'border-blue-700 bg-blue-50 text-blue-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                    }`}
                  >
                    {code}
                  </button>
                );
              })}
              {selectedCategories
                .filter((c) => !FEATURED_CATEGORIES.includes(c))
                .map((extra) => (
                  <button
                    key={extra}
                    type="button"
                    aria-pressed={true}
                    onClick={() => toggleCategory(extra)}
                    className="rounded-md border border-blue-700 bg-blue-50 px-2 py-1 font-mono text-[11px] font-medium text-blue-800 whitespace-nowrap"
                  >
                    {extra} {!isMailingScope ? '×' : ''}
                  </button>
                ))}
            </div>

            <div className="flex min-w-0 items-center gap-1.5 pt-1">
              <label htmlFor="custom-category-select" className="sr-only">
                More arXiv categories
              </label>
              <select
                id="custom-category-select"
                value=""
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) selectCategoryFromPicker(val);
                }}
                className="w-0 min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-700 focus:outline-none"
              >
                <option value="">More categories...</option>
                {ARXIV_CATEGORIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                aria-label="Custom category code"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    selectCategoryFromPicker(customCategory);
                  }
                }}
                placeholder="code"
                className="w-16 shrink-0 rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
              />
            </div>
          </div>

          {/* Date Range Filter (All arXiv Search scope only) */}
          {!isMailingScope && (
            <div className="space-y-2 border-t border-slate-100 pt-4">
              <span className="block text-xs font-medium text-slate-700">Submission Date</span>
              <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1">
                {(
                  [
                    { id: 'any', label: 'Any' },
                    { id: '7d', label: '7d' },
                    { id: '30d', label: '30d' },
                    { id: '1y', label: '1y' },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handlePresetClick(preset.id)}
                    className={`rounded-md py-1 text-xs font-medium transition-colors ${
                      datePreset === preset.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="date-from" className="block text-[11px] text-slate-500">
                    From
                  </label>
                  <input
                    id="date-from"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => {
                      setDatePreset('custom');
                      setDateFrom(e.target.value);
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-[11px] text-slate-800 tabular-nums focus:border-blue-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="date-to" className="block text-[11px] text-slate-500">
                    To
                  </label>
                  <input
                    id="date-to"
                    type="date"
                    value={dateTo}
                    onChange={(e) => {
                      setDatePreset('custom');
                      setDateTo(e.target.value);
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-[11px] text-slate-800 tabular-nums focus:border-blue-700 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <label htmlFor="max-results" className="text-xs text-slate-600">
              Max results
            </label>
            <select
              id="max-results"
              value={maxResults}
              onChange={(e) => setMaxResults(Number(e.target.value))}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 tabular-nums focus:border-blue-700 focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={40}>40</option>
              <option value={75}>75</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Search className="h-4 w-4" aria-hidden="true" />
            )}
            <span>
              {loading
                ? 'Querying arxiv.org...'
                : isMailingScope
                  ? `Load /${activeBrowseCategory}/${feedScope}`
                  : 'Search arXiv'}
            </span>
          </button>
        </form>
      </aside>

      {/* Center Results Column */}
      <section aria-label="arXiv search results" className="min-w-0 flex-1 rounded-xl border border-black/[0.08] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {searchResult?.browseMeta
                ? `Mailing: /list/${searchResult.browseMeta.category}/${searchResult.browseMeta.mode}`
                : 'Results'}
            </h2>
            {searchResult && (
              <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                Showing {searchResult.papers.length} of{' '}
                {searchResult.totalResults.toLocaleString()} indexed entries
                {searchResult.browseMeta?.mailingLabel
                  ? ` · ${searchResult.browseMeta.mailingLabel}`
                  : ''}
              </p>
            )}
          </div>
          {selectedCategories.length > 0 && (
            <span className="font-mono text-xs text-slate-500">
              Scope: {selectedCategories.join(', ')}
            </span>
          )}
        </div>

        <AuthorProfileBanner
          authorName={activeAuthorBanner}
          activeTab="arxiv"
          onSwitchToInspire={onSearchAuthorInInspire}
          onDismiss={() => setActiveAuthorBanner(null)}
        />

        {error && (
          <div role="alert" className="m-5 rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
            <p className="font-semibold">Direct arXiv query failed</p>
            <p className="mt-1">{error}</p>
          </div>
        )}

        {loading && (
          <div className="divide-y divide-slate-100 p-5" aria-busy="true">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="space-y-2 py-4 first:pt-0">
                <div className="h-3 w-48 animate-pulse rounded bg-slate-200" />
                <div className="h-5 w-4/5 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
              </div>
            ))}
          </div>
        )}

        {!loading && !error && searchResult && searchResult.papers.length === 0 && (
          <div className="p-10 text-center">
            <p className="text-sm font-semibold text-slate-800">No matching papers on arXiv</p>
            <p className="mt-1 text-xs text-slate-500">
              Try widening the date range, switching Feed Scope to Recent/All arXiv, or choosing another category.
            </p>
          </div>
        )}

        {!loading && searchResult && searchResult.papers.length > 0 && (
          <ul className="divide-y divide-slate-200">
            {searchResult.papers.map((paper) => {
              const isSaved = savedIds.has(paper.id);
              const isSelected = selectedPaper?.id === paper.id;
              const isDownloading = downloadingId === paper.id;
              return (
                <li
                  key={paper.id}
                  className={`px-5 py-4 transition-colors ${
                    isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-xs text-slate-500 tabular-nums">
                        <span className="font-semibold text-blue-700">
                          {paper.primaryCategory}
                        </span>
                        {paper.listingSection && (
                          <span>
                            ·{' '}
                            {paper.listingSection === 'new'
                              ? 'New'
                              : paper.listingSection === 'cross'
                                ? 'Cross-list'
                                : 'Replacement'}
                          </span>
                        )}
                        {paper.categories.length > 1 && (
                          <span>
                            · {paper.categories.filter((c) => c !== paper.primaryCategory).slice(0, 2).join(' · ')}
                          </span>
                        )}
                        <span>· {paper.published.slice(0, 10)}</span>
                        <span>· arXiv:{paper.id}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => onSelectPaper(paper)}
                        className="mt-1.5 text-left font-serif text-base font-semibold leading-snug text-slate-900 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                      >
                        {paper.title}
                      </button>

                      <AuthorLinkList
                        authors={paper.authors}
                        authorDetails={paper.authorDetails}
                        maxVisible={5}
                        preferSource="arxiv"
                        onSearchAuthorInArxiv={handleSearchAuthorHere}
                        onSearchAuthorInInspire={onSearchAuthorInInspire}
                        className="mt-1"
                      />

                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600">
                        {paper.abstract}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <button
                        type="button"
                        onClick={() => onSavePaper(paper)}
                        aria-label={
                          isSaved
                            ? `Saved ${paper.title} in library`
                            : `Save ${paper.title} to library`
                        }
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                          isSaved
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {isSaved ? (
                          <BookmarkCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        <span>{isSaved ? 'Saved' : 'Save'}</span>
                      </button>

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => void handleCardDownload(paper)}
                          disabled={isDownloading}
                          aria-label={`Download PDF for ${paper.title}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-blue-600 disabled:opacity-60 whitespace-nowrap"
                        >
                          {isDownloading ? (
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                          ) : (
                            <Download className="h-3 w-3" aria-hidden="true" />
                          )}
                          <span>{isDownloading ? 'Saving...' : 'PDF'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectPaper(paper)}
                          className="text-xs font-medium text-blue-600 hover:underline whitespace-nowrap"
                        >
                          Inspect
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Right Paper Reader Column */}
      <PaperReaderPanel
        paper={selectedPaper}
        isSaved={selectedPaper ? savedIds.has(selectedPaper.id) : false}
        onClose={() => onSelectPaper(null)}
        onSavePaper={onSavePaper}
        onSyncZotero={onSyncZotero}
        onSearchAuthorInArxiv={handleSearchAuthorHere}
        onSearchAuthorInInspire={onSearchAuthorInInspire}
      />
    </div>
  );
}
