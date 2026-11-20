import { useEffect, useState, type FormEvent } from 'react';
import {
  Bookmark,
  BookmarkCheck,
  Briefcase,
  Download,
  ExternalLink,
  Loader2,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { triggerPaperPdfDownload } from '../shared/download';
import {
  INSPIRE_DOCUMENT_TYPES,
  INSPIRE_JOB_CATEGORIES,
  INSPIRE_JOB_RANKS,
  INSPIRE_JOB_REGIONS,
  INSPIRE_SUBJECTS,
  mapInspireDocumentTypesToTags,
} from '../shared/inspire';
import type {
  ArxivPaper,
  InspireJob,
  InspireJobsParams,
  InspireJobsResult,
  InspireJobStatus,
  InspireLiteratureParams,
  InspireLiteratureResult,
  InspireSearchField,
  InspireSortBy,
  SavedPaper,
} from '../shared/types';
import { AuthorLinkList } from './AuthorLinkList';
import { AuthorProfileBanner } from './AuthorProfileBanner';
import { PaperReaderPanel } from './PaperReaderPanel';

interface InspireWorkspaceProps {
  literatureResult: InspireLiteratureResult | null;
  jobsResult: InspireJobsResult | null;
  loading: boolean;
  error: string | null;
  savedIds: Set<string>;
  selectedPaper: ArxivPaper | SavedPaper | null;
  onSelectPaper: (paper: ArxivPaper | null) => void;
  onRunLiteratureSearch: (params: InspireLiteratureParams) => Promise<void>;
  onRunJobsSearch: (params: InspireJobsParams) => Promise<void>;
  onSavePaper: (paper: ArxivPaper) => Promise<void>;
  onSyncZotero: (paper: ArxivPaper) => Promise<void>;
  onSearchAuthorInArxiv?: (authorName: string) => void;
  pendingAuthorQuery?: { name: string; inspireRecid?: string } | null;
  onClearPendingAuthorQuery?: () => void;
}

export function InspireWorkspace({
  literatureResult,
  jobsResult,
  loading,
  error,
  savedIds,
  selectedPaper,
  onSelectPaper,
  onRunLiteratureSearch,
  onRunJobsSearch,
  onSavePaper,
  onSyncZotero,
  onSearchAuthorInArxiv,
  pendingAuthorQuery,
  onClearPendingAuthorQuery,
}: InspireWorkspaceProps) {
  const [sectionMode, setSectionMode] = useState<'literature' | 'jobs'>('literature');

  // Literature search state
  const [query, setQuery] = useState('');
  const [field, setField] = useState<InspireSearchField>('all');
  const [documentType, setDocumentType] = useState('');
  const [subject, setSubject] = useState('');
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [minCitations, setMinCitations] = useState(0);
  const [sortBy, setSortBy] = useState<InspireSortBy>('mostrecent');
  const [size, setSize] = useState(15);

  // Jobs search state
  const [jobQuery, setJobQuery] = useState('');
  const [jobStatus, setJobStatus] = useState<InspireJobStatus>('open');
  const [jobRank, setJobRank] = useState('');
  const [jobRegion, setJobRegion] = useState('');
  const [jobCategory, setJobCategory] = useState('');
  const [selectedJob, setSelectedJob] = useState<InspireJob | null>(null);
  const [activeAuthorBanner, setActiveAuthorBanner] = useState<{
    name: string;
    inspireRecid?: string;
  } | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    if (pendingAuthorQuery) {
      const displayName = pendingAuthorQuery.name;
      const queryValue = pendingAuthorQuery.inspireRecid
        ? `authors.recid:${pendingAuthorQuery.inspireRecid}`
        : displayName;
      setSectionMode('literature');
      setQuery(displayName);
      setField('author');
      setActiveAuthorBanner(pendingAuthorQuery);
      void onRunLiteratureSearch({
        query: queryValue,
        field: 'author',
        documentType: '',
        subject: '',
        yearFrom: '',
        yearTo: '',
        minCitations: undefined,
        sortBy: 'mostrecent',
        size,
      });
      onClearPendingAuthorQuery?.();
    }
  }, [pendingAuthorQuery, onClearPendingAuthorQuery, onRunLiteratureSearch, size]);

  useEffect(() => {
    if (sectionMode === 'jobs' && jobsResult?.jobs.length && !selectedJob) {
      if (window.innerWidth >= 1280) {
        setSelectedJob(jobsResult.jobs[0]);
      }
    }
  }, [sectionMode, jobsResult, selectedJob]);

  const handleModeSwitch = (next: 'literature' | 'jobs') => {
    setSectionMode(next);
    if (next === 'jobs' && !jobsResult) {
      void onRunJobsSearch({
        query: jobQuery,
        status: jobStatus,
        rank: jobRank,
        region: jobRegion,
        category: jobCategory,
        size,
      });
    } else if (next === 'literature' && !literatureResult) {
      void onRunLiteratureSearch({
        query,
        field,
        documentType,
        subject,
        yearFrom,
        yearTo,
        minCitations: minCitations > 0 ? minCitations : undefined,
        sortBy,
        size,
      });
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (sectionMode === 'jobs') {
      await onRunJobsSearch({
        query: jobQuery,
        status: jobStatus,
        rank: jobRank,
        region: jobRegion,
        category: jobCategory,
        size,
      });
      return;
    }
    await onRunLiteratureSearch({
      query,
      field,
      documentType,
      subject,
      yearFrom,
      yearTo,
      minCitations: minCitations > 0 ? minCitations : undefined,
      sortBy,
      size,
    });
  };

  const handleReset = () => {
    if (sectionMode === 'jobs') {
      setJobQuery('');
      setJobStatus('open');
      setJobRank('');
      setJobRegion('');
      setJobCategory('');
      setSize(15);
      return;
    }
    setQuery('');
    setField('all');
    setDocumentType('');
    setSubject('');
    setYearFrom('');
    setYearTo('');
    setMinCitations(0);
    setSortBy('mostrecent');
    setSize(15);
  };

  const handleSearchAuthorHere = (authorName: string, inspireRecid?: string) => {
    setSectionMode('literature');
    setQuery(authorName);
    setField('author');
    setActiveAuthorBanner({ name: authorName, inspireRecid });
    void onRunLiteratureSearch({
      query: inspireRecid ? `authors.recid:${inspireRecid}` : authorName,
      field: 'author',
      documentType,
      subject,
      yearFrom,
      yearTo,
      minCitations: minCitations > 0 ? minCitations : undefined,
      sortBy,
      size,
    });
  };

  const handleCardDownload = async (paper: ArxivPaper) => {
    setDownloadingId(paper.id);
    try {
      await triggerPaperPdfDownload(paper);
    } catch {
      // Fall through cleanly
    } finally {
      setDownloadingId((curr) => (curr === paper.id ? null : curr));
    }
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
      {/* Phone Quick Search & Dataset Toggle (hidden on lg+) */}
      <div className="space-y-2.5 rounded-xl border border-black/[0.08] bg-white p-3.5 lg:hidden">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => handleModeSwitch('literature')}
            aria-pressed={sectionMode === 'literature'}
            className={`min-h-[34px] rounded-md text-xs font-medium transition-colors ${
              sectionMode === 'literature'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600'
            }`}
          >
            Literature
          </button>
          <button
            type="button"
            onClick={() => handleModeSwitch('jobs')}
            aria-pressed={sectionMode === 'jobs'}
            className={`min-h-[34px] rounded-md text-xs font-medium transition-colors ${
              sectionMode === 'jobs'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600'
            }`}
          >
            Jobs
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="text"
              aria-label="Quick search INSPIRE-HEP"
              value={sectionMode === 'jobs' ? jobQuery : query}
              onChange={(e) =>
                sectionMode === 'jobs' ? setJobQuery(e.target.value) : setQuery(e.target.value)
              }
              placeholder={
                sectionMode === 'jobs'
                  ? 'Search postdoc, faculty, PhD jobs...'
                  : 'Keywords, author, INSPIRE syntax...'
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
            aria-label="Toggle INSPIRE filters"
            className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium ${
              mobileFiltersOpen
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Filters</span>
          </button>
        </form>
      </div>

      {/* Left INSPIRE-HEP Query Column */}
      <aside
        className={`${
          mobileFiltersOpen ? 'block' : 'hidden'
        } lg:block w-full shrink-0 rounded-xl border border-black/[0.08] bg-white p-5 lg:w-80`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h1 className="text-sm font-semibold text-slate-900">INSPIRE-HEP Query</h1>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            <span>Reset</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div
            role="group"
            aria-label="INSPIRE-HEP dataset"
            className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1"
          >
            <button
              type="button"
              onClick={() => handleModeSwitch('literature')}
              aria-pressed={sectionMode === 'literature'}
              className={`rounded-md py-1.5 text-xs font-medium transition-colors ${
                sectionMode === 'literature'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Literature
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch('jobs')}
              aria-pressed={sectionMode === 'jobs'}
              className={`rounded-md py-1.5 text-xs font-medium transition-colors ${
                sectionMode === 'jobs'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Jobs
            </button>
          </div>

          {sectionMode === 'literature' ? (
            <>
              <div className="space-y-2">
                <label htmlFor="inspire-query" className="block text-xs font-medium text-slate-700">
                  Keywords or INSPIRE syntax
                </label>
                <input
                  id="inspire-query"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. holographic entropy, a Witten"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="inspire-field" className="block text-[11px] text-slate-500">
                      Target Field
                    </label>
                    <select
                      id="inspire-field"
                      value={field}
                      onChange={(e) => setField(e.target.value as InspireSearchField)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-700 focus:outline-none"
                    >
                      <option value="all">All fields</option>
                      <option value="title">Title (t)</option>
                      <option value="author">Author (a)</option>
                      <option value="abstract">Abstract</option>
                      <option value="eprint">ePrint / arXiv</option>
                      <option value="collaboration">Collaboration</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="inspire-sort" className="block text-[11px] text-slate-500">
                      Sort Order
                    </label>
                    <select
                      id="inspire-sort"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as InspireSortBy)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-700 focus:outline-none"
                    >
                      <option value="mostrecent">Most Recent</option>
                      <option value="mostcited">Most Cited</option>
                      <option value="bestmatch">Best Match</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-3 border-t border-slate-100 pt-3.5">
                <div>
                  <label htmlFor="inspire-doctype" className="block text-xs font-medium text-slate-700">
                    Document Type
                  </label>
                  <select
                    id="inspire-doctype"
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-700 focus:outline-none"
                  >
                    {INSPIRE_DOCUMENT_TYPES.map((dt) => (
                      <option key={dt.value} value={dt.value}>
                        {dt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="inspire-subject" className="block text-xs font-medium text-slate-700">
                    Subject Category
                  </label>
                  <select
                    id="inspire-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-700 focus:outline-none"
                  >
                    <option value="">All subjects</option>
                    {INSPIRE_SUBJECTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="inspire-year-from" className="block text-[11px] text-slate-500">
                      From year
                    </label>
                    <input
                      id="inspire-year-from"
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={yearFrom}
                      onChange={(e) => setYearFrom(e.target.value)}
                      placeholder="2020"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs text-slate-800 tabular-nums focus:border-blue-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="inspire-year-to" className="block text-[11px] text-slate-500">
                      To year
                    </label>
                    <input
                      id="inspire-year-to"
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={yearTo}
                      onChange={(e) => setYearTo(e.target.value)}
                      placeholder="2026"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs text-slate-800 tabular-nums focus:border-blue-700 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label htmlFor="inspire-min-cites" className="text-xs text-slate-600">
                    Min citations
                  </label>
                  <select
                    id="inspire-min-cites"
                    value={minCitations}
                    onChange={(e) => setMinCitations(Number(e.target.value))}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 tabular-nums focus:border-blue-700 focus:outline-none"
                  >
                    <option value={0}>Any</option>
                    <option value={10}>10+</option>
                    <option value={50}>50+</option>
                    <option value={100}>100+</option>
                    <option value={500}>500+</option>
                  </select>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-3.5">
              <div>
                <label htmlFor="inspire-job-query" className="block text-xs font-medium text-slate-700">
                  Keywords or institution
                </label>
                <input
                  id="inspire-job-query"
                  type="text"
                  value={jobQuery}
                  onChange={(e) => setJobQuery(e.target.value)}
                  placeholder="e.g. CERN, quantum gravity, postdoc"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="inspire-job-status" className="block text-[11px] text-slate-500">
                    Status
                  </label>
                  <select
                    id="inspire-job-status"
                    value={jobStatus}
                    onChange={(e) => setJobStatus(e.target.value as InspireJobStatus)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-700 focus:outline-none"
                  >
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                    <option value="all">All</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="inspire-job-rank" className="block text-[11px] text-slate-500">
                    Rank
                  </label>
                  <select
                    id="inspire-job-rank"
                    value={jobRank}
                    onChange={(e) => setJobRank(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-700 focus:outline-none"
                  >
                    {INSPIRE_JOB_RANKS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="inspire-job-region" className="block text-xs font-medium text-slate-700">
                  Region
                </label>
                <select
                  id="inspire-job-region"
                  value={jobRegion}
                  onChange={(e) => setJobRegion(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-700 focus:outline-none"
                >
                  <option value="">All regions</option>
                  {INSPIRE_JOB_REGIONS.map((region) => (
                    <option key={region} value={region}>
                      {region}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="inspire-job-cat" className="block text-xs font-medium text-slate-700">
                  Field of Interest
                </label>
                <select
                  id="inspire-job-cat"
                  value={jobCategory}
                  onChange={(e) => setJobCategory(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 focus:border-blue-700 focus:outline-none"
                >
                  <option value="">All fields</option>
                  {INSPIRE_JOB_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-100 pt-3.5">
            <label htmlFor="inspire-size" className="text-xs text-slate-600">
              Max results
            </label>
            <select
              id="inspire-size"
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 tabular-nums focus:border-blue-700 focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={40}>40</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : sectionMode === 'jobs' ? (
              <Briefcase className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Search className="h-4 w-4" aria-hidden="true" />
            )}
            <span>
              {loading
                ? 'Querying inspirehep.net...'
                : sectionMode === 'jobs'
                  ? 'Search INSPIRE Jobs'
                  : 'Search INSPIRE-HEP'}
            </span>
          </button>
        </form>
      </aside>

      {/* Center Results List */}
      <section
        aria-label={sectionMode === 'jobs' ? 'INSPIRE-HEP job listings' : 'INSPIRE-HEP literature results'}
        className="min-w-0 flex-1 rounded-xl border border-black/[0.08] bg-white"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {sectionMode === 'jobs' ? 'INSPIRE-HEP Jobs' : 'INSPIRE-HEP Literature'}
            </h2>
            {sectionMode === 'literature' && literatureResult && (
              <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                Showing {literatureResult.papers.length} of{' '}
                {literatureResult.totalResults.toLocaleString()} indexed records
              </p>
            )}
            {sectionMode === 'jobs' && jobsResult && (
              <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                Showing {jobsResult.jobs.length} of{' '}
                {jobsResult.totalResults.toLocaleString()} job openings
              </p>
            )}
          </div>
          {sectionMode === 'literature' && documentType && (
            <span className="font-mono text-xs text-slate-500">Type: {documentType}</span>
          )}
          {sectionMode === 'jobs' && jobStatus !== 'all' && (
            <span className="font-mono text-xs text-slate-500">Status: {jobStatus}</span>
          )}
        </div>

        {sectionMode === 'literature' && activeAuthorBanner && (
          <AuthorProfileBanner
            authorName={activeAuthorBanner.name}
            inspireRecid={activeAuthorBanner.inspireRecid}
            activeTab="inspirehep"
            onSwitchToArxiv={onSearchAuthorInArxiv}
            onDismiss={() => setActiveAuthorBanner(null)}
          />
        )}

        {error && (
          <div role="alert" className="m-5 rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
            <p className="font-semibold">INSPIRE-HEP query failed</p>
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

        {!loading && sectionMode === 'literature' && literatureResult && (
          <>
            {literatureResult.papers.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-sm font-semibold text-slate-800">
                  No matching INSPIRE-HEP literature records
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Adjust keywords, document type, year range, or citation threshold.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-200">
                {literatureResult.papers.map((paper) => {
                  const isSaved = savedIds.has(paper.id);
                  const isSelected = selectedPaper?.id === paper.id;
                  const docTags = mapInspireDocumentTypesToTags(paper.documentTypes);
                  return (
                    <li
                      key={`${paper.inspireId || paper.id}`}
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
                            {docTags.map((dt) => (
                              <span key={dt}>· {dt}</span>
                            ))}
                            {typeof paper.citationCount === 'number' && (
                              <span>· {paper.citationCount.toLocaleString()} citations</span>
                            )}
                            <span>· {paper.published.slice(0, 10)}</span>
                            <span>
                              · {paper.id.startsWith('inspire:') ? paper.id : `arXiv:${paper.id}`}
                            </span>
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
                            preferSource="inspirehep"
                            onSearchAuthorInArxiv={onSearchAuthorInArxiv}
                            onSearchAuthorInInspire={handleSearchAuthorHere}
                            className="mt-1"
                          />

                          {paper.abstract && (
                            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600">
                              {paper.abstract}
                            </p>
                          )}
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
                              disabled={downloadingId === paper.id}
                              aria-label={`Download PDF for ${paper.title}`}
                              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-blue-600 disabled:opacity-60 whitespace-nowrap"
                            >
                              {downloadingId === paper.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                              ) : (
                                <Download className="h-3 w-3" aria-hidden="true" />
                              )}
                              <span>{downloadingId === paper.id ? 'Saving...' : 'PDF'}</span>
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
          </>
        )}

        {!loading && sectionMode === 'jobs' && jobsResult && (
          <>
            {jobsResult.jobs.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-sm font-semibold text-slate-800">No matching INSPIRE-HEP jobs</p>
                <p className="mt-1 text-xs text-slate-500">
                  Try widening rank, region, or switching status to All.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-200">
                {jobsResult.jobs.map((job) => {
                  const isSelected = selectedJob?.id === job.id;
                  return (
                    <li
                      key={job.id}
                      className={`px-5 py-4 transition-colors ${
                        isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-xs text-slate-500 tabular-nums">
                            <span className="font-semibold text-blue-700">
                              {job.ranks.join(', ') || 'Position'}
                            </span>
                            <span>· {job.status}</span>
                            {job.regions.length > 0 && <span>· {job.regions.join(', ')}</span>}
                            {job.deadlineDate && <span>· Deadline {job.deadlineDate}</span>}
                          </div>

                          <button
                            type="button"
                            onClick={() => setSelectedJob(job)}
                            className="mt-1.5 text-left font-serif text-base font-semibold leading-snug text-slate-900 hover:text-blue-700"
                          >
                            {job.position}
                          </button>

                          {job.institutions.length > 0 && (
                            <p className="mt-1 text-xs font-medium text-slate-700">
                              {job.institutions.join(' · ')}
                            </p>
                          )}

                          {job.categories.length > 0 && (
                            <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                              {job.categories.join(' · ')}
                            </p>
                          )}

                          {job.descriptionText && (
                            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600">
                              {job.descriptionText}
                            </p>
                          )}
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedJob(job)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Inspect
                          </button>
                          <a
                            href={job.urls[0] || job.inspireUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline whitespace-nowrap"
                          >
                            <span>Apply / Page</span>
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </a>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>

      {/* Right Sticky Inspector */}
      {sectionMode === 'literature' ? (
        <PaperReaderPanel
          paper={selectedPaper}
          isSaved={selectedPaper ? savedIds.has(selectedPaper.id) : false}
          onClose={() => onSelectPaper(null)}
          onSavePaper={onSavePaper}
          onSyncZotero={onSyncZotero}
          onSearchAuthorInArxiv={onSearchAuthorInArxiv}
          onSearchAuthorInInspire={handleSearchAuthorHere}
        />
      ) : selectedJob ? (
        <aside
          aria-label={`Job details for ${selectedJob.position}`}
          className="fixed top-13 bottom-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-black/[0.08] bg-white shadow-xl xl:sticky xl:top-16 xl:bottom-auto xl:right-auto xl:z-auto xl:max-h-[calc(100vh-5.5rem)] xl:w-[440px] xl:max-w-none xl:shrink-0 xl:rounded-xl xl:border xl:shadow-none"
        >
          <div className="flex items-center justify-between gap-4 border-b border-slate-200/80 px-5 py-3.5">
            <span className="font-mono text-xs font-medium text-slate-600 tabular-nums">
              INSPIRE Job:{selectedJob.id}
            </span>
            <button
              type="button"
              onClick={() => setSelectedJob(null)}
              aria-label={`Close job details for ${selectedJob.position}`}
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-slate-500 tabular-nums">
              <span className="font-semibold text-blue-600">
                {selectedJob.ranks.join(', ') || 'Open Role'}
              </span>
              <span>· {selectedJob.status}</span>
              {selectedJob.regions.length > 0 && <span>· {selectedJob.regions.join(', ')}</span>}
              {selectedJob.deadlineDate && <span>· Deadline {selectedJob.deadlineDate}</span>}
            </div>
            <h2 className="mt-2.5 font-serif text-xl font-semibold leading-snug text-slate-900">
              {selectedJob.position}
            </h2>
            {selectedJob.institutions.length > 0 && (
              <p className="mt-1.5 text-xs font-medium text-slate-700">
                {selectedJob.institutions.join(' · ')}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2 border-y border-slate-100 py-3">
              {selectedJob.urls[0] && (
                <a
                  href={selectedJob.urls[0]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  <span>Application Portal</span>
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
              <a
                href={selectedJob.inspireUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <span>INSPIRE Listing</span>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>

            {selectedJob.contacts.length > 0 && (
              <div className="mt-3 text-xs text-slate-600">
                <span className="font-medium text-slate-700">Contact: </span>
                {selectedJob.contacts
                  .map((c) => [c.name, c.email].filter(Boolean).join(' · '))
                  .join('; ')}
              </div>
            )}

            <div className="mt-4 whitespace-pre-wrap font-serif text-sm leading-relaxed text-slate-800">
              {selectedJob.descriptionText || 'No description text provided.'}
            </div>
          </div>
        </aside>
      ) : (
        <aside className="hidden xl:sticky xl:top-16 xl:flex xl:w-[430px] shrink-0 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center">
          <Briefcase className="h-8 w-8 text-slate-300" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-slate-800">Select a job to inspect</p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">
            Choose any INSPIRE-HEP job posting to read full requirements, contact emails, deadlines, and application portals.
          </p>
        </aside>
      )}
    </div>
  );
}
