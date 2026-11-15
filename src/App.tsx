import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AddByIdModal } from './components/AddByIdModal';
import { CloudSyncView } from './components/CloudSyncView';
import { InspireWorkspace } from './components/InspireWorkspace';
import { LibraryView } from './components/LibraryView';
import { McpModeView } from './components/McpModeView';
import { SearchWorkspace } from './components/SearchWorkspace';
import { SettingsView } from './components/SettingsView';
import { TopBar, type WorkspaceTab } from './components/TopBar';
import { ZoteroView } from './components/ZoteroView';
import type {
  ArxivBrowseParams,
  ArxivPaper,
  ArxivSearchField,
  ArxivSearchResult,
  ArxivSortBy,
  InspireJobsParams,
  InspireJobsResult,
  InspireLiteratureParams,
  InspireLiteratureResult,
  SavedPaper,
} from './shared/types';

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('search');
  const [savedPapers, setSavedPapers] = useState<SavedPaper[]>([]);
  const [searchResult, setSearchResult] = useState<ArxivSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [inspireLitResult, setInspireLitResult] = useState<InspireLiteratureResult | null>(null);
  const [inspireJobsResult, setInspireJobsResult] = useState<InspireJobsResult | null>(null);
  const [inspireLoading, setInspireLoading] = useState(false);
  const [inspireError, setInspireError] = useState<string | null>(null);
  const [selectedPaper, setSelectedPaper] = useState<ArxivPaper | SavedPaper | null>(null);
  const [selectedLibraryPaper, setSelectedLibraryPaper] = useState<ArxivPaper | SavedPaper | null>(
    null
  );
  const [selectedInspirePaper, setSelectedInspirePaper] = useState<ArxivPaper | SavedPaper | null>(
    null
  );
  const [pendingArxivAuthor, setPendingArxivAuthor] = useState<string | null>(null);
  const [pendingInspireAuthor, setPendingInspireAuthor] = useState<{
    name: string;
    inspireRecid?: string;
  } | null>(null);
  const [addByIdOpen, setAddByIdOpen] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<{
    type: 'ok' | 'error';
    text: string;
  } | null>(null);

  // Sequence guards prevent out-of-order responses when switching categories or authors rapidly
  const arxivReqSeqRef = useRef(0);
  const inspireReqSeqRef = useRef(0);

  const savedIds = useMemo(() => new Set(savedPapers.map((p) => p.id)), [savedPapers]);

  const showNotice = useCallback((type: 'ok' | 'error', text: string) => {
    setBannerMessage({ type, text });
    setTimeout(() => {
      setBannerMessage((curr) => (curr?.text === text ? null : curr));
    }, 4000);
  }, []);

  const loadLibrary = useCallback(async () => {
    const res = await fetch('/api/library');
    const data = await res.json();
    if (Array.isArray(data.papers)) {
      setSavedPapers(data.papers);
    }
  }, []);

  const runSearch = useCallback(
    async (params: {
      query: string;
      field: ArxivSearchField;
      categories: string[];
      dateFrom: string;
      dateTo: string;
      sortBy: ArxivSortBy;
      maxResults: number;
    }) => {
      const seq = ++arxivReqSeqRef.current;
      setSearching(true);
      setSearchError(null);
      try {
        const res = await fetch('/api/arxiv/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        const data = await res.json();
        if (seq !== arxivReqSeqRef.current) return;
        if (!res.ok) {
          throw new Error(data.error || 'arXiv search failed.');
        }
        const typed = data as ArxivSearchResult;
        setSearchResult(typed);
        if (window.innerWidth >= 1280) {
          setSelectedPaper((curr) =>
            curr && typed.papers.some((p) => p.id === curr.id)
              ? curr
              : typed.papers[0] || null
          );
        }
      } catch (err: unknown) {
        if (seq === arxivReqSeqRef.current) {
          setSearchError((err as Error).message);
        }
      } finally {
        if (seq === arxivReqSeqRef.current) {
          setSearching(false);
        }
      }
    },
    []
  );

  const runBrowse = useCallback(async (params: ArxivBrowseParams) => {
    const seq = ++arxivReqSeqRef.current;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch('/api/arxiv/browse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (seq !== arxivReqSeqRef.current) return;
      if (!res.ok) {
        throw new Error(data.error || 'arXiv mailing browse failed.');
      }
      const typed = data as ArxivSearchResult;
      setSearchResult(typed);
      if (window.innerWidth >= 1280) {
        setSelectedPaper((curr) =>
          curr && typed.papers.some((p) => p.id === curr.id)
            ? curr
            : typed.papers[0] || null
        );
      }
    } catch (err: unknown) {
      if (seq === arxivReqSeqRef.current) {
        setSearchError((err as Error).message);
      }
    } finally {
      if (seq === arxivReqSeqRef.current) {
        setSearching(false);
      }
    }
  }, []);

  const runInspireLiterature = useCallback(async (params: InspireLiteratureParams) => {
    const seq = ++inspireReqSeqRef.current;
    setInspireLoading(true);
    setInspireError(null);
    try {
      const res = await fetch('/api/inspire/literature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (seq !== inspireReqSeqRef.current) return;
      if (!res.ok) {
        throw new Error(data.error || 'INSPIRE-HEP search failed.');
      }
      const typed = data as InspireLiteratureResult;
      setInspireLitResult(typed);
      if (window.innerWidth >= 1280) {
        setSelectedInspirePaper((curr) =>
          curr && typed.papers.some((p) => p.id === curr.id)
            ? curr
            : typed.papers[0] || null
        );
      }
    } catch (err: unknown) {
      if (seq === inspireReqSeqRef.current) {
        setInspireError((err as Error).message);
      }
    } finally {
      if (seq === inspireReqSeqRef.current) {
        setInspireLoading(false);
      }
    }
  }, []);

  const runInspireJobs = useCallback(async (params: InspireJobsParams) => {
    const seq = ++inspireReqSeqRef.current;
    setInspireLoading(true);
    setInspireError(null);
    try {
      const res = await fetch('/api/inspire/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (seq !== inspireReqSeqRef.current) return;
      if (!res.ok) {
        throw new Error(data.error || 'INSPIRE-HEP Jobs search failed.');
      }
      setInspireJobsResult(data as InspireJobsResult);
    } catch (err: unknown) {
      if (seq === inspireReqSeqRef.current) {
        setInspireError((err as Error).message);
      }
    } finally {
      if (seq === inspireReqSeqRef.current) {
        setInspireLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadLibrary().catch(() => {});
    runSearch({
      query: '',
      field: 'all',
      categories: ['hep-th'],
      dateFrom: '',
      dateTo: '',
      sortBy: 'submittedDate',
      maxResults: 15,
    }).catch(() => {});
  }, [loadLibrary, runSearch]);

  useEffect(() => {
    if (
      activeTab === 'inspire' &&
      !inspireLitResult &&
      !inspireLoading &&
      !pendingInspireAuthor &&
      inspireReqSeqRef.current === 0
    ) {
      runInspireLiterature({
        query: '',
        field: 'all',
        subject: 'Theory-HEP',
        sortBy: 'mostrecent',
        size: 15,
      }).catch(() => {});
    }
  }, [activeTab, inspireLitResult, inspireLoading, pendingInspireAuthor, runInspireLiterature]);

  const handleSearchAuthorInArxiv = useCallback((authorName: string) => {
    setPendingArxivAuthor(authorName);
    setActiveTab('search');
  }, []);

  const handleSearchAuthorInInspire = useCallback((authorName: string, inspireRecid?: string) => {
    setPendingInspireAuthor({ name: authorName, inspireRecid });
    setActiveTab('inspire');
  }, []);

  const clearPendingArxivAuthor = useCallback(() => setPendingArxivAuthor(null), []);
  const clearPendingInspireAuthor = useCallback(() => setPendingInspireAuthor(null), []);

  const handleSavePaper = async (paper: ArxivPaper) => {
    const res = await fetch('/api/library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paper }),
    });
    const data = await res.json();
    if (!res.ok) {
      showNotice('error', data.error || 'Could not save paper.');
      return;
    }
    if (Array.isArray(data.papers)) {
      setSavedPapers(data.papers);
    }
    const label = paper.id.startsWith('inspire:') ? paper.id : `arXiv:${paper.id}`;
    const docTagPreview =
      Array.isArray(data.savedPaper?.tags) && data.savedPaper.tags.length > 0
        ? ` [${data.savedPaper.tags.join(', ')}]`
        : '';
    showNotice(
      'ok',
      data.zoteroSyncMessage
        ? `Saved ${label}${docTagPreview} · ${data.zoteroSyncMessage}`
        : `Saved ${label}${docTagPreview} to library.`
    );
  };

  const handleUpdatePaperMeta = async (id: string, tags: string[], notes: string) => {
    const res = await fetch('/api/library/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, tags, notes }),
    });
    const data = await res.json();
    if (res.ok && Array.isArray(data.papers)) {
      setSavedPapers(data.papers);
    }
  };

  const handleDeletePaper = async (id: string) => {
    const res = await fetch(`/api/library?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (res.ok && Array.isArray(data.papers)) {
      setSavedPapers(data.papers);
      if (selectedLibraryPaper?.id === id) {
        setSelectedLibraryPaper(null);
      }
      showNotice('ok', `Removed ${id.startsWith('inspire:') ? id : `arXiv:${id}`} from library.`);
    }
  };

  const handleSyncZotero = async (paper: ArxivPaper) => {
    const res = await fetch('/api/zotero/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ papers: [paper] }),
    });
    const data = await res.json();
    if (Array.isArray(data.papers)) {
      setSavedPapers(data.papers);
    }
    if (!res.ok || !data.ok) {
      showNotice('error', data.message || 'Zotero sync failed.');
      throw new Error(data.message || 'Zotero sync failed.');
    }
    showNotice('ok', data.message);
  };

  return (
    <div id="top" className="min-h-screen bg-[#f5f5f7] text-slate-900">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        savedCount={savedPapers.length}
        onOpenAddById={() => setAddByIdOpen(true)}
      />

      {bannerMessage && (
        <div
          role="status"
          className={`border-b px-6 py-2 text-xs font-medium ${
            bannerMessage.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          <div className="mx-auto max-w-[1440px]">{bannerMessage.text}</div>
        </div>
      )}

      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
        {activeTab === 'search' && (
          <SearchWorkspace
            searchResult={searchResult}
            loading={searching}
            error={searchError}
            savedIds={savedIds}
            selectedPaper={selectedPaper}
            onSelectPaper={setSelectedPaper}
            onRunSearch={runSearch}
            onRunBrowse={runBrowse}
            onSavePaper={handleSavePaper}
            onSyncZotero={handleSyncZotero}
            onSearchAuthorInInspire={handleSearchAuthorInInspire}
            pendingAuthorQuery={pendingArxivAuthor}
            onClearPendingAuthorQuery={clearPendingArxivAuthor}
          />
        )}

        {activeTab === 'inspire' && (
          <InspireWorkspace
            literatureResult={inspireLitResult}
            jobsResult={inspireJobsResult}
            loading={inspireLoading}
            error={inspireError}
            savedIds={savedIds}
            selectedPaper={selectedInspirePaper}
            onSelectPaper={setSelectedInspirePaper}
            onRunLiteratureSearch={runInspireLiterature}
            onRunJobsSearch={runInspireJobs}
            onSavePaper={handleSavePaper}
            onSyncZotero={handleSyncZotero}
            onSearchAuthorInArxiv={handleSearchAuthorInArxiv}
            pendingAuthorQuery={pendingInspireAuthor}
            onClearPendingAuthorQuery={clearPendingInspireAuthor}
          />
        )}

        {activeTab === 'library' && (
          <LibraryView
            papers={savedPapers}
            selectedPaper={selectedLibraryPaper || savedPapers[0] || null}
            onSelectPaper={setSelectedLibraryPaper}
            onUpdatePaperMeta={handleUpdatePaperMeta}
            onDeletePaper={handleDeletePaper}
            onSyncZotero={handleSyncZotero}
            onGoToSearch={() => setActiveTab('search')}
            onSearchAuthorInArxiv={handleSearchAuthorInArxiv}
            onSearchAuthorInInspire={handleSearchAuthorInInspire}
          />
        )}

        {activeTab === 'zotero' && (
          <ZoteroView papers={savedPapers} onPapersUpdated={setSavedPapers} />
        )}

        {activeTab === 'cloud' && (
          <CloudSyncView papers={savedPapers} onPapersUpdated={setSavedPapers} />
        )}

        {activeTab === 'mcp' && <McpModeView onLibraryMutated={loadLibrary} />}

        {activeTab === 'settings' && <SettingsView />}
      </main>

      <AddByIdModal
        open={addByIdOpen}
        onClose={() => setAddByIdOpen(false)}
        onPaperSaved={handleSavePaper}
      />
    </div>
  );
}
