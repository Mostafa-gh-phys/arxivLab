import { useCallback, useEffect, useMemo, useState } from 'react';
import { AddByIdModal } from './components/AddByIdModal';
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
  SavedPaper,
} from './shared/types';

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('search');
  const [savedPapers, setSavedPapers] = useState<SavedPaper[]>([]);
  const [searchResult, setSearchResult] = useState<ArxivSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedPaper, setSelectedPaper] = useState<ArxivPaper | SavedPaper | null>(null);
  const [addByIdOpen, setAddByIdOpen] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<{
    type: 'ok' | 'error';
    text: string;
  } | null>(null);

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
      setSearching(true);
      setSearchError(null);
      try {
        const res = await fetch('/api/arxiv/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'arXiv search failed.');
        }
        setSearchResult(data as ArxivSearchResult);
        if (data.papers?.length > 0 && window.innerWidth >= 1280) {
          setSelectedPaper((curr) => curr || data.papers[0]);
        }
      } catch (err: unknown) {
        setSearchError((err as Error).message);
      } finally {
        setSearching(false);
      }
    },
    []
  );

  const runBrowse = useCallback(async (params: ArxivBrowseParams) => {
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch('/api/arxiv/browse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'arXiv mailing browse failed.');
      }
      setSearchResult(data as ArxivSearchResult);
      if (data.papers?.length > 0 && window.innerWidth >= 1280) {
        setSelectedPaper((curr) => curr || data.papers[0]);
      }
    } catch (err: unknown) {
      setSearchError((err as Error).message);
    } finally {
      setSearching(false);
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
    showNotice(
      'ok',
      data.zoteroSyncMessage
        ? `Saved arXiv:${paper.id} · ${data.zoteroSyncMessage}`
        : `Saved arXiv:${paper.id} to Linux library.`
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
      if (selectedPaper?.id === id) {
        setSelectedPaper(null);
      }
      showNotice('ok', `Removed arXiv:${id} from library.`);
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
          />
        )}

        {activeTab === 'library' && (
          <LibraryView
            papers={savedPapers}
            selectedPaper={selectedPaper}
            onSelectPaper={setSelectedPaper}
            onUpdatePaperMeta={handleUpdatePaperMeta}
            onDeletePaper={handleDeletePaper}
            onSyncZotero={handleSyncZotero}
            onGoToSearch={() => setActiveTab('search')}
          />
        )}

        {activeTab === 'zotero' && (
          <ZoteroView papers={savedPapers} onPapersUpdated={setSavedPapers} />
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
