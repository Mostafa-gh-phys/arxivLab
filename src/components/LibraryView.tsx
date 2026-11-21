import { useMemo, useState } from 'react';
import {
  Check,
  Download,
  ExternalLink,
  Loader2,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import { triggerPaperPdfDownload } from '../shared/download';
import { formatBytes } from '../shared/network';
import type { ArxivPaper, PdfHighlight, SavedPaper } from '../shared/types';
import { AuthorLinkList } from './AuthorLinkList';
import { PaperReaderPanel } from './PaperReaderPanel';

interface LibraryViewProps {
  papers: SavedPaper[];
  selectedPaper: ArxivPaper | SavedPaper | null;
  onSelectPaper: (paper: ArxivPaper | SavedPaper | null) => void;
  onUpdatePaperMeta: (id: string, tags: string[], notes: string) => Promise<void>;
  onSaveHighlights?: (paper: ArxivPaper, highlights: PdfHighlight[]) => Promise<void>;
  onDeletePaper: (id: string) => Promise<void>;
  onSyncZotero: (paper: ArxivPaper) => Promise<void>;
  onGoToSearch: () => void;
  onSearchAuthorInArxiv?: (authorName: string) => void;
  onSearchAuthorInInspire?: (authorName: string, inspireRecid?: string) => void;
}

export function LibraryView({
  papers,
  selectedPaper,
  onSelectPaper,
  onUpdatePaperMeta,
  onSaveHighlights,
  onDeletePaper,
  onSyncZotero,
  onGoToSearch,
  onSearchAuthorInArxiv,
  onSearchAuthorInInspire,
}: LibraryViewProps) {
  const [filterQuery, setFilterQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState('');
  const [draftTags, setDraftTags] = useState('');
  const [savedNoticeId, setSavedNoticeId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    for (const p of papers) {
      set.add(p.primaryCategory);
    }
    return Array.from(set).sort();
  }, [papers]);

  const availableTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of papers) {
      for (const t of p.tags || []) {
        set.add(t);
      }
    }
    return Array.from(set).sort();
  }, [papers]);

  const filtered = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    return papers.filter((p) => {
      const catMatch = categoryFilter === 'all' || p.primaryCategory === categoryFilter;
      if (!catMatch) return false;
      const tagMatch = tagFilter === 'all' || (p.tags || []).includes(tagFilter);
      if (!tagMatch) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.authors.some((a) => a.toLowerCase().includes(q)) ||
        p.tags.some((t) => t.toLowerCase().includes(q)) ||
        p.notes.toLowerCase().includes(q)
      );
    });
  }, [papers, filterQuery, categoryFilter, tagFilter]);

  const startEdit = (paper: SavedPaper) => {
    setEditingId(paper.id);
    setDraftNotes(paper.notes || '');
    setDraftTags((paper.tags || []).join(', '));
  };

  const handleSaveMeta = async (id: string) => {
    const tags = draftTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    await onUpdatePaperMeta(id, tags, draftNotes);
    setEditingId(null);
    setSavedNoticeId(id);
    setTimeout(() => setSavedNoticeId(null), 1600);
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <section className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h1 className="text-base font-semibold text-slate-900">
              Saved Paper Library
            </h1>
            <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
              {papers.length} persisted paper{papers.length === 1 ? '' : 's'} shared with MCP agents
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/api/library/export?format=bibtex"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Export .bib</span>
            </a>
            <a
              href="/api/library/export?format=ris"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Export .ris</span>
            </a>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
          <div className="min-w-[200px] flex-1">
            <label htmlFor="library-filter-input" className="sr-only">
              Filter saved library
            </label>
            <input
              id="library-filter-input"
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filter saved papers by title, author, tag, or arXiv ID..."
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="library-cat-filter" className="sr-only">
              Filter by category
            </label>
            <select
              id="library-cat-filter"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs text-slate-800 focus:border-blue-700 focus:outline-none"
            >
              <option value="all">All categories</option>
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="library-tag-filter" className="sr-only">
              Filter by document type or tag
            </label>
            <select
              id="library-tag-filter"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs text-slate-800 focus:border-blue-700 focus:outline-none"
            >
              <option value="all">All types & tags</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
        </div>

        {papers.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-semibold text-slate-800">Your Linux library is empty</p>
            <p className="mt-1 text-xs text-slate-500">
              Search arXiv.org or allow an MCP agent to save papers here.
            </p>
            <button
              type="button"
              onClick={onGoToSearch}
              className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
            >
              Search arXiv
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No saved papers match your current filter.
          </div>
        ) : (
          <ul className="divide-y divide-slate-200">
            {filtered.map((paper) => {
              const isEditing = editingId === paper.id;
              return (
                <li key={paper.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-xs text-slate-500 tabular-nums">
                        <span className="font-semibold text-blue-700">
                          {paper.primaryCategory}
                        </span>
                        <span>
                          · {paper.id.startsWith('inspire:') ? paper.id : `arXiv:${paper.id}`}
                        </span>
                        {paper.source === 'inspirehep' && <span>· INSPIRE-HEP</span>}
                        <span>· Saved {paper.savedAt.slice(0, 10)}</span>
                        {paper.pdfCached && (
                          <span className="text-emerald-700">
                            · PDF cached{paper.pdfSizeBytes ? ` (${formatBytes(paper.pdfSizeBytes)})` : ''}
                          </span>
                        )}
                        {paper.highlights && paper.highlights.length > 0 && (
                          <span className="text-amber-700">
                            · {paper.highlights.length} highlight{paper.highlights.length === 1 ? '' : 's'}
                          </span>
                        )}
                        {paper.zoteroItemKey && (
                          <span className="text-emerald-700">
                            · Zotero synced ({paper.zoteroItemKey})
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => onSelectPaper(paper)}
                        className="mt-1.5 text-left font-serif text-base font-semibold text-slate-900 hover:text-blue-700"
                      >
                        {paper.title}
                      </button>

                      <AuthorLinkList
                        authors={paper.authors}
                        authorDetails={paper.authorDetails}
                        maxVisible={6}
                        preferSource={paper.source || 'arxiv'}
                        onSearchAuthorInArxiv={onSearchAuthorInArxiv}
                        onSearchAuthorInInspire={onSearchAuthorInInspire}
                        className="mt-1"
                      />

                      {paper.tags.length > 0 && !isEditing && (
                        <p className="mt-1.5 font-mono text-[11px] text-slate-500">
                          Tags: {paper.tags.join(' · ')}
                        </p>
                      )}

                      {paper.notes && !isEditing && (
                        <p className="mt-1.5 text-xs leading-relaxed text-slate-700">
                          {paper.notes}
                        </p>
                      )}

                      {paper.highlights && paper.highlights.length > 0 && !isEditing && (
                        <button
                          type="button"
                          onClick={() => onSelectPaper(paper)}
                          className="mt-2 block w-full border-l-2 border-amber-400 pl-2.5 text-left text-[11px] leading-relaxed text-slate-600 hover:border-blue-600 hover:text-slate-900"
                        >
                          <span className="font-mono text-[10px] font-semibold text-amber-800">
                            p.{paper.highlights[0].page}
                          </span>{' '}
                          &ldquo;{paper.highlights[0].quote.slice(0, 140)}
                          {paper.highlights[0].quote.length > 140 ? '…' : ''}&rdquo;
                          {paper.highlights.length > 1 && (
                            <span className="ml-1 font-medium text-blue-700">
                              (+{paper.highlights.length - 1} more)
                            </span>
                          )}
                        </button>
                      )}

                      {isEditing && (
                        <div className="mt-3 space-y-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <div>
                            <label
                              htmlFor={`tags-${paper.id}`}
                              className="block text-[11px] font-medium text-slate-700"
                            >
                              Tags (comma-separated)
                            </label>
                            <input
                              id={`tags-${paper.id}`}
                              type="text"
                              value={draftTags}
                              onChange={(e) => setDraftTags(e.target.value)}
                              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor={`notes-${paper.id}`}
                              className="block text-[11px] font-medium text-slate-700"
                            >
                              Research Notes
                            </label>
                            <textarea
                              id={`notes-${paper.id}`}
                              rows={2}
                              value={draftNotes}
                              onChange={(e) => setDraftNotes(e.target.value)}
                              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveMeta(paper.id)}
                              className="inline-flex items-center gap-1 rounded-md bg-blue-700 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-800"
                            >
                              <Save className="h-3 w-3" aria-hidden="true" />
                              <span>Save Notes</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {savedNoticeId === paper.id && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          Updated
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => startEdit(paper)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Notes
                      </button>
                      <button
                        type="button"
                        onClick={() => onSyncZotero(paper)}
                        aria-label={`Sync ${paper.title} to Zotero`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Send className="h-3 w-3" aria-hidden="true" />
                        <span>Zotero</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setDownloadingId(paper.id);
                          try {
                            await triggerPaperPdfDownload(paper);
                          } finally {
                            setDownloadingId((curr) => (curr === paper.id ? null : curr));
                          }
                        }}
                        disabled={downloadingId === paper.id}
                        aria-label={`Download PDF for ${paper.title}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        {downloadingId === paper.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                        ) : (
                          <Download className="h-3 w-3" aria-hidden="true" />
                        )}
                        <span>{downloadingId === paper.id ? 'Saving...' : 'PDF'}</span>
                      </button>
                      <a
                        href={paper.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open PDF in browser for ${paper.title}`}
                        className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                      <button
                        type="button"
                        onClick={() => onDeletePaper(paper.id)}
                        aria-label={`Remove ${paper.title}`}
                        className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <PaperReaderPanel
        paper={selectedPaper}
        isSaved={true}
        savedHighlights={
          selectedPaper
            ? papers.find((p) => p.id === selectedPaper.id)?.highlights ??
              ('highlights' in selectedPaper ? selectedPaper.highlights : undefined)
            : undefined
        }
        onClose={() => onSelectPaper(null)}
        onSavePaper={async (p, hl) => {
          if (hl && onSaveHighlights) {
            await onSaveHighlights(p, hl);
          }
        }}
        onSaveHighlights={onSaveHighlights}
        onSyncZotero={onSyncZotero}
        onSearchAuthorInArxiv={onSearchAuthorInArxiv}
        onSearchAuthorInInspire={onSearchAuthorInInspire}
      />
    </div>
  );
}
