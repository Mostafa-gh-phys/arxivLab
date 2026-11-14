import { useEffect, useState, type FormEvent } from 'react';
import {
  Bookmark,
  BookmarkCheck,
  Download,
  Loader2,
  RotateCcw,
  Search,
} from 'lucide-react';
import { computeDateRangeFromPreset } from '../shared/arxiv';
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
import { PaperReaderPanel } from './PaperReaderPanel';

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
  onSearchAuthorInInspire?: (authorName: string) => void;
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
  const [queryMode, setQueryMode] = useState<'search' | 'browse'>('search');
  const [browseMode, setBrowseMode] = useState<ArxivBrowseMode>('new');
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

  useEffect(() => {
    if (pendingAuthorQuery) {
      setQueryMode('search');
      setQuery(pendingAuthorQuery);
      setField('au');
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

  const activeBrowseCategory = selectedCategories[0] || 'hep-th';

  const triggerBrowse = async (
    nextBrowseMode: ArxivBrowseMode = browseMode,
    nextSection: ArxivBrowseSection = browseSection,
    nextCategory: string = activeBrowseCategory
  ) => {
    await onRunBrowse({
      category: nextCategory,
      mode: nextBrowseMode,
      section: nextSection,
      filterText: query,
      maxResults,
    });
  };

  const toggleCategory = (code: string) => {
    if (queryMode === 'browse') {
      setSelectedCategories([code]);
      void triggerBrowse(browseMode, browseSection, code);
      return;
    }
    setSelectedCategories((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleAddCustomCategory = () => {
    const trimmed = customCategory.trim();
    if (!trimmed) return;
    if (queryMode === 'browse') {
      setSelectedCategories([trimmed]);
      setCustomCategory('');
      void triggerBrowse(browseMode, browseSection, trimmed);
      return;
    }
    if (!selectedCategories.includes(trimmed)) {
      setSelectedCategories((prev) => [...prev, trimmed]);
    }
    setCustomCategory('');
  };

  const handlePresetClick = (preset: 'any' | '7d' | '30d' | '1y') => {
    setDatePreset(preset);
    const range = computeDateRangeFromPreset(preset);
    setDateFrom(range.dateFrom);
    setDateTo(range.dateTo);
  };

  const handleModeSwitch = (nextMode: 'search' | 'browse') => {
    setQueryMode(nextMode);
    if (nextMode === 'browse') {
      const cat = selectedCategories[0] || 'hep-th';
      if (selectedCategories.length === 0) {
        setSelectedCategories([cat]);
      }
      void onRunBrowse({
        category: cat,
        mode: browseMode,
        section: browseSection,
        filterText: query,
        maxResults,
      });
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (queryMode === 'browse') {
      await triggerBrowse();
      return;
    }
    await onRunSearch({
      query,
      field,
      categories: selectedCategories,
      dateFrom,
      dateTo,
      sortBy,
      maxResults,
    });
  };

  const handleReset = () => {
    setQueryMode('search');
    setBrowseMode('new');
    setBrowseSection('all');
    setQuery('');
    setField('all');
    setSelectedCategories(['hep-th']);
    setDatePreset('any');
    setDateFrom('');
    setDateTo('');
    setSortBy('submittedDate');
    setMaxResults(15);
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* Left Query & Filter Column */}
      <aside className="w-full shrink-0 rounded-xl border border-black/[0.08] bg-white p-5 lg:w-80">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h1 className="text-sm font-semibold text-slate-900">arXiv.org Query</h1>
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
          {/* Mode Switch: API Search vs Direct Mailing Browse */}
          <div
            role="group"
            aria-label="arXiv query mode"
            className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1"
          >
            <button
              type="button"
              onClick={() => handleModeSwitch('search')}
              aria-pressed={queryMode === 'search'}
              className={`rounded-md py-1.5 text-xs font-medium transition-colors ${
                queryMode === 'search'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch('browse')}
              aria-pressed={queryMode === 'browse'}
              className={`rounded-md py-1.5 text-xs font-medium transition-colors ${
                queryMode === 'browse'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Browse Mailings
            </button>
          </div>

          {queryMode === 'browse' && (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <div>
                <span className="block text-xs font-medium text-slate-700">
                  arXiv Browse Listing
                </span>
                <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-lg bg-slate-200/70 p-1">
                  {(
                    [
                      { id: 'new', label: 'New', hint: 'Most recent mailing with abstracts' },
                      { id: 'recent', label: 'Recent', hint: 'Last 5 mailings' },
                      { id: 'current', label: 'Current', hint: "Current month's listings" },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      title={item.hint}
                      onClick={() => {
                        setBrowseMode(item.id);
                        void triggerBrowse(item.id, browseSection, activeBrowseCategory);
                      }}
                      className={`rounded-md py-1 text-xs font-medium transition-colors ${
                        browseMode === item.id
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  {browseMode === 'new' && 'Most recent mailing (with abstracts)'}
                  {browseMode === 'recent' && 'Last 5 daily mailings'}
                  {browseMode === 'current' && "Current month's archive listings"}
                </p>
              </div>

              {browseMode === 'new' && (
                <div>
                  <span className="block text-[11px] font-medium text-slate-600">
                    Mailing Section
                  </span>
                  <div className="mt-1 grid grid-cols-2 gap-1">
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
                          void triggerBrowse(browseMode, sec.id, activeBrowseCategory);
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
          )}

          {/* Keyword & Target Field */}
          <div className="space-y-2">
            <label htmlFor="search-keyword" className="block text-xs font-medium text-slate-700">
              {queryMode === 'browse' ? 'Filter listing (optional)' : 'Keywords or arXiv ID'}
            </label>
            <input
              id="search-keyword"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                queryMode === 'browse'
                  ? 'Filter by title, author, or ID...'
                  : 'e.g. holographic entropy, 2401.12345'
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
            />
            {queryMode === 'search' && (
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
                {queryMode === 'browse' ? 'Archive Category' : 'arXiv Categories'}
              </span>
              {queryMode === 'search' && selectedCategories.length > 0 && (
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
                    {extra} ×
                  </button>
                ))}
            </div>

            <div className="flex min-w-0 items-center gap-1.5 pt-1">
              <label htmlFor="custom-category-select" className="sr-only">
                More arXiv categories
              </label>
              <select
                id="custom-category-select"
                value={customCategory}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    if (queryMode === 'browse') {
                      setSelectedCategories([val]);
                      void triggerBrowse(browseMode, browseSection, val);
                    } else if (!selectedCategories.includes(val)) {
                      setSelectedCategories((prev) => [...prev, val]);
                    }
                  }
                  setCustomCategory('');
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
                    handleAddCustomCategory();
                  }
                }}
                placeholder="code"
                className="w-16 shrink-0 rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
              />
            </div>
          </div>

          {/* Date Range Filter (Search mode only) */}
          {queryMode === 'search' && (
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
                : queryMode === 'browse'
                  ? `Browse /${activeBrowseCategory}/${browseMode}`
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
                ? `Browse: /list/${searchResult.browseMeta.category}/${searchResult.browseMeta.mode}`
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
              Try widening the date range, removing restrictive keywords, or switching categories.
            </p>
          </div>
        )}

        {!loading && searchResult && searchResult.papers.length > 0 && (
          <ul className="divide-y divide-slate-200">
            {searchResult.papers.map((paper) => {
              const isSaved = savedIds.has(paper.id);
              const isSelected = selectedPaper?.id === paper.id;
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
                        onSearchAuthorInArxiv={(authorName) => {
                          setQueryMode('search');
                          setQuery(authorName);
                          setField('au');
                          void onRunSearch({
                            query: authorName,
                            field: 'au',
                            categories: [],
                            dateFrom: '',
                            dateTo: '',
                            sortBy: 'submittedDate',
                            maxResults,
                          });
                        }}
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
                        <a
                          href={`/api/arxiv/download?id=${encodeURIComponent(paper.id)}&save=1`}
                          download
                          aria-label={`Download PDF for ${paper.title}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-blue-600 whitespace-nowrap"
                        >
                          <Download className="h-3 w-3" aria-hidden="true" />
                          <span>PDF</span>
                        </a>
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
        onSearchAuthorInArxiv={(authorName) => {
          setQueryMode('search');
          setQuery(authorName);
          setField('au');
          void onRunSearch({
            query: authorName,
            field: 'au',
            categories: [],
            dateFrom: '',
            dateTo: '',
            sortBy: 'submittedDate',
            maxResults,
          });
        }}
        onSearchAuthorInInspire={onSearchAuthorInInspire}
      />
    </div>
  );
}
