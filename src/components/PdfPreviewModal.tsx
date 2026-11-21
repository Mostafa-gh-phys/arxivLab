import { useCallback, useEffect, useState } from 'react';
import {
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Highlighter,
  Loader2,
  MousePointer,
  PanelRightClose,
  PanelRightOpen,
  RotateCw,
  Send,
  SquareDashedMousePointer,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { paperToBibtex } from '../shared/citations';
import { buildPdfEndpointUrl, triggerPaperPdfDownload } from '../shared/download';
import {
  formatHighlightsMarkdown,
  HIGHLIGHT_PALETTE,
  removeHighlight,
  sortHighlightsByReadingOrder,
  updateHighlight,
  upsertHighlight,
} from '../shared/highlights';
import type {
  ArxivPaper,
  PdfHighlight,
  PdfHighlightColor,
  SavedPaper,
} from '../shared/types';
import { AuthorLinkList } from './AuthorLinkList';
import { PdfCanvasViewer, type PdfViewerToolMode } from './PdfCanvasViewer';

interface PdfPreviewModalProps {
  paper: ArxivPaper | SavedPaper | null;
  open: boolean;
  isSaved: boolean;
  savedHighlights?: PdfHighlight[];
  onClose: () => void;
  onSavePaper: (paper: ArxivPaper, highlights?: PdfHighlight[]) => Promise<void>;
  onSaveHighlights?: (paper: ArxivPaper, highlights: PdfHighlight[]) => Promise<void>;
  onSyncZotero: (paper: ArxivPaper) => Promise<void>;
  onSearchAuthorInArxiv?: (authorName: string) => void;
  onSearchAuthorInInspire?: (authorName: string) => void;
}

export function PdfPreviewModal({
  paper,
  open,
  isSaved,
  savedHighlights,
  onClose,
  onSavePaper,
  onSaveHighlights,
  onSyncZotero,
  onSearchAuthorInArxiv,
  onSearchAuthorInInspire,
}: PdfPreviewModalProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'highlights' | 'info'>('highlights');
  const [toolMode, setToolMode] = useState<PdfViewerToolMode>('highlight_text');
  const [activeColor, setActiveColor] = useState<PdfHighlightColor>('amber');
  const [zoom, setZoom] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [jumpToPage, setJumpToPage] = useState<{ page: number; nonce: number } | null>(null);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<PdfHighlight[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState('');
  const [reloadNonce, setReloadNonce] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [copiedBib, setCopiedBib] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const resolvedSavedHighlights =
    savedHighlights ??
    (paper && 'highlights' in paper && Array.isArray(paper.highlights) ? paper.highlights : []);

  useEffect(() => {
    if (!open) return;
    setHighlights(sortHighlightsByReadingOrder(resolvedSavedHighlights));
    setFeedback(null);
    setActiveHighlightId(null);
    setEditingNoteId(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // Sync when modal opens or switches paper
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, paper?.id]);

  // Keep local state updated if parent savedHighlights updates externally
  useEffect(() => {
    if (!open) return;
    setHighlights(sortHighlightsByReadingOrder(resolvedSavedHighlights));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedSavedHighlights.length]);

  const persistHighlightsToLibrary = useCallback(
    async (nextHighlights: PdfHighlight[], toastMessage?: string) => {
      if (!paper) return;
      setSaving(true);
      try {
        if (onSaveHighlights) {
          await onSaveHighlights(paper, nextHighlights);
        } else {
          await onSavePaper(paper, nextHighlights);
        }
        setFeedback(
          toastMessage ||
            `Saved ${nextHighlights.length} highlight${nextHighlights.length === 1 ? '' : 's'} to library`
        );
      } catch (err: unknown) {
        setFeedback((err as Error).message || 'Could not save highlights.');
      } finally {
        setSaving(false);
      }
    },
    [paper, onSaveHighlights, onSavePaper]
  );

  if (!open || !paper) return null;

  const pdfEndpointUrl = buildPdfEndpointUrl(paper, { view: true, save: true });

  const handleAddHighlight = async (item: Omit<PdfHighlight, 'id' | 'createdAt'>) => {
    const newHighlight: PdfHighlight = {
      ...item,
      id: `hl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
    };
    const next = upsertHighlight(highlights, newHighlight);
    setHighlights(next);
    setActiveHighlightId(newHighlight.id);
    setSidebarOpen(true);
    setSidebarTab('highlights');
    await persistHighlightsToLibrary(next, 'Highlight saved to library');
  };

  const handleDeleteHighlight = async (id: string) => {
    const next = removeHighlight(highlights, id);
    setHighlights(next);
    if (activeHighlightId === id) setActiveHighlightId(null);
    if (editingNoteId === id) setEditingNoteId(null);
    await persistHighlightsToLibrary(next, 'Highlight removed from library');
  };

  const handleSaveNote = async (id: string) => {
    const next = updateHighlight(highlights, id, { note: draftNote });
    setHighlights(next);
    setEditingNoteId(null);
    await persistHighlightsToLibrary(next, 'Highlight note saved to library');
  };

  const handleChangeHighlightColor = async (id: string, color: PdfHighlightColor) => {
    const next = updateHighlight(highlights, id, { color });
    setHighlights(next);
    await persistHighlightsToLibrary(next, 'Highlight color updated');
  };

  const handleDownload = async () => {
    setDownloading(true);
    setFeedback(null);
    try {
      const res = await triggerPaperPdfDownload(paper);
      setFeedback(`Downloaded ${res.fileName}`);
    } catch (err: unknown) {
      setFeedback((err as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  const handleCopyHighlightsMd = async () => {
    const md = formatHighlightsMarkdown(paper, highlights);
    await navigator.clipboard.writeText(md);
    setCopiedMd(true);
    setTimeout(() => setCopiedMd(false), 1600);
  };

  const goToPage = (targetPage: number) => {
    if (totalPages <= 0) return;
    const clamped = Math.max(1, Math.min(totalPages, targetPage));
    setJumpToPage((prev) => ({ page: clamped, nonce: (prev?.nonce || 0) + 1 }));
    setCurrentPage(clamped);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Document Viewer — ${paper.title}`}
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/92"
    >
      {/* Top Primary Bar */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 px-3 py-2 text-slate-100 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-blue-600/20 px-2 py-1 font-mono text-[11px] font-semibold text-blue-300">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{paper.id.startsWith('inspire:') ? paper.id : `arXiv:${paper.id}`}</span>
          </span>
          <h2 className="truncate font-serif text-sm font-semibold text-white">{paper.title}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {feedback && (
            <span className="max-w-xs truncate rounded bg-slate-800 px-2.5 py-1 text-[11px] text-emerald-300">
              {feedback}
            </span>
          )}

          <button
            type="button"
            onClick={async () => {
              await persistHighlightsToLibrary(
                highlights,
                isSaved
                  ? `Saved ${highlights.length} highlight(s) in library`
                  : 'Paper & highlights saved to library'
              );
            }}
            disabled={saving}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${
              isSaved
                ? 'border border-emerald-700 bg-emerald-900/50 text-emerald-200 hover:bg-emerald-900/70'
                : 'bg-blue-600 text-white hover:bg-blue-500'
            }`}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : isSaved ? (
              <BookmarkCheck className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>{isSaved ? `Saved (${highlights.length})` : 'Save to Library'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-60"
          >
            {downloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">Download PDF</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              setSyncing(true);
              setFeedback(null);
              try {
                await onSyncZotero(paper);
                setFeedback('Synced to Zotero');
              } catch (err: unknown) {
                setFeedback((err as Error).message);
              } finally {
                setSyncing(false);
              }
            }}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">Zotero</span>
          </button>

          <a
            href={paper.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open original PDF"
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>

          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label={sidebarOpen ? 'Hide highlights sidebar' : 'Show highlights sidebar'}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
          >
            {sidebarOpen ? (
              <PanelRightClose className="h-4 w-4" aria-hidden="true" />
            ) : (
              <PanelRightOpen className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="hidden md:inline tabular-nums">({highlights.length})</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close document viewer"
            className="rounded-md border border-slate-700 bg-slate-800 p-1.5 text-slate-200 hover:bg-rose-900/60 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Secondary Annotation & Reader Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/95 px-3 py-1.5 text-xs text-slate-200 sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="PDF annotation tool"
            className="inline-flex items-center rounded-md border border-slate-700 bg-slate-800 p-0.5"
          >
            <button
              type="button"
              onClick={() => setToolMode('select')}
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                toolMode === 'select'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MousePointer className="h-3 w-3" aria-hidden="true" />
              <span>Read</span>
            </button>
            <button
              type="button"
              onClick={() => setToolMode('highlight_text')}
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                toolMode === 'highlight_text'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Highlighter className="h-3 w-3" aria-hidden="true" />
              <span>Highlight Text</span>
            </button>
            <button
              type="button"
              onClick={() => setToolMode('highlight_area')}
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                toolMode === 'highlight_area'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <SquareDashedMousePointer className="h-3 w-3" aria-hidden="true" />
              <span>Box Equation/Fig</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 border-l border-slate-700 pl-2">
            {(['amber', 'emerald', 'sky', 'rose'] as PdfHighlightColor[]).map((color) => {
              const active = activeColor === color;
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => setActiveColor(color)}
                  aria-label={`Set highlight color ${HIGHLIGHT_PALETTE[color].label}`}
                  aria-pressed={active}
                  className={`h-5 w-5 rounded-full border transition-transform ${
                    HIGHLIGHT_PALETTE[color].swatchClass
                  } ${active ? 'scale-110 ring-2 ring-white ring-offset-1 ring-offset-slate-900' : 'opacity-75 hover:opacity-100'}`}
                />
              );
            })}
          </div>

          <span className="hidden text-[11px] text-slate-400 lg:inline">
            {toolMode === 'highlight_text'
              ? 'Drag across text to highlight & save automatically'
              : toolMode === 'highlight_area'
                ? 'Drag a box over equations, tables, or figures'
                : 'Select text to highlight from popup menu'}
          </span>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums">
          <div className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-1.5 py-0.5">
            <button
              type="button"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              aria-label="Previous page"
              className="rounded p-0.5 text-slate-300 hover:bg-slate-700 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <span className="px-1 text-slate-200">
              {totalPages > 0 ? `${currentPage} / ${totalPages}` : '—'}
            </span>
            <button
              type="button"
              onClick={() => goToPage(currentPage + 1)}
              disabled={totalPages === 0 || currentPage >= totalPages}
              aria-label="Next page"
              className="rounded p-0.5 text-slate-300 hover:bg-slate-700 disabled:opacity-40"
            >
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-1.5 py-0.5">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.6, Math.round((z - 0.15) * 100) / 100))}
              aria-label="Zoom out"
              className="rounded p-0.5 text-slate-300 hover:bg-slate-700"
            >
              <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              title="Reset zoom"
              className="px-1 text-slate-200 hover:text-white"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.2, Math.round((z + 0.15) * 100) / 100))}
              aria-label="Zoom in"
              className="rounded p-0.5 text-slate-300 hover:bg-slate-700"
            >
              <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setReloadNonce((n) => n + 1)}
            aria-label="Reload PDF document"
            className="rounded-md border border-slate-700 bg-slate-800 p-1 text-slate-300 hover:bg-slate-700"
          >
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Main Split Stage: Interactive PDF Canvas + Highlights / Paper Info Sidebar */}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <PdfCanvasViewer
            pdfUrl={pdfEndpointUrl}
            externalFallbackUrl={paper.pdfUrl}
            highlights={highlights}
            toolMode={toolMode}
            activeColor={activeColor}
            zoom={zoom}
            reloadNonce={reloadNonce}
            activeHighlightId={activeHighlightId}
            jumpToPage={jumpToPage}
            onTotalPagesChange={setTotalPages}
            onCurrentPageChange={setCurrentPage}
            onAddHighlight={handleAddHighlight}
            onSelectHighlight={(h) => {
              setActiveHighlightId(h.id);
              setSidebarOpen(true);
              setSidebarTab('highlights');
              setEditingNoteId(h.id);
              setDraftNote(h.note || '');
            }}
          />
        </div>

        {sidebarOpen && (
          <aside className="fixed inset-y-0 right-0 z-40 flex w-84 max-w-full flex-col border-l border-slate-800 bg-white pt-14 lg:static lg:z-auto lg:w-96 lg:pt-0">
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
              <div className="flex flex-1 gap-1 rounded-lg bg-slate-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setSidebarTab('highlights')}
                  className={`flex-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors tabular-nums ${
                    sidebarTab === 'highlights'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Highlights ({highlights.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarTab('info')}
                  className={`flex-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    sidebarTab === 'info'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Info &amp; BibTeX
                </button>
              </div>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close annotations sidebar"
                className="ml-2 rounded p-1 text-slate-500 hover:bg-slate-100 lg:hidden"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {sidebarTab === 'highlights' ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-600">
                  <span>Stored in library file automatically</span>
                  {highlights.length > 0 && (
                    <button
                      type="button"
                      onClick={handleCopyHighlightsMd}
                      className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-100"
                    >
                      {copiedMd ? (
                        <Check className="h-3 w-3 text-emerald-700" aria-hidden="true" />
                      ) : (
                        <Copy className="h-3 w-3" aria-hidden="true" />
                      )}
                      <span>{copiedMd ? 'Copied' : 'Copy .md'}</span>
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-3">
                  {highlights.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 p-5 text-center">
                      <Highlighter className="mx-auto h-6 w-6 text-slate-300" aria-hidden="true" />
                      <p className="mt-2 text-xs font-semibold text-slate-800">No highlights yet</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                        Use <strong>Highlight Text</strong> to drag across sentences, or{' '}
                        <strong>Box Equation/Fig</strong> to highlight formulas &amp; figures. Every highlight saves straight into your library file.
                      </p>
                    </div>
                  ) : (
                    <ul className="space-y-2.5">
                      {highlights.map((h) => {
                        const palette = HIGHLIGHT_PALETTE[h.color] || HIGHLIGHT_PALETTE.amber;
                        const isSelected = activeHighlightId === h.id;
                        const isEditing = editingNoteId === h.id;

                        return (
                          <li
                            key={h.id}
                            className={`rounded-lg border p-3 transition-colors ${
                              isSelected
                                ? 'border-slate-900 bg-slate-50/70'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveHighlightId(h.id);
                                  goToPage(h.page);
                                }}
                                className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold text-slate-700 hover:text-blue-700 tabular-nums"
                              >
                                <span
                                  className={`inline-block h-2.5 w-2.5 rounded-full border ${palette.swatchClass}`}
                                />
                                <span>Page {h.page}</span>
                                {h.kind === 'area' && (
                                  <span className="font-sans font-normal text-slate-400">
                                    · Region
                                  </span>
                                )}
                              </button>

                              <div className="flex items-center gap-1">
                                {(['amber', 'emerald', 'sky', 'rose'] as PdfHighlightColor[]).map(
                                  (color) => (
                                    <button
                                      key={color}
                                      type="button"
                                      onClick={() => handleChangeHighlightColor(h.id, color)}
                                      aria-label={`Change color to ${HIGHLIGHT_PALETTE[color].label}`}
                                      className={`h-3 w-3 rounded-full border ${
                                        HIGHLIGHT_PALETTE[color].swatchClass
                                      } ${h.color === color ? 'ring-1 ring-slate-800' : 'opacity-50 hover:opacity-100'}`}
                                    />
                                  )
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteHighlight(h.id)}
                                  aria-label={`Delete highlight on page ${h.page}`}
                                  className="ml-1 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setActiveHighlightId(h.id);
                                goToPage(h.page);
                              }}
                              className="mt-2 block w-full text-left font-serif text-xs leading-relaxed text-slate-800"
                            >
                              &ldquo;{h.quote}&rdquo;
                            </button>

                            {isEditing ? (
                              <div className="mt-2 space-y-1.5">
                                <textarea
                                  rows={2}
                                  value={draftNote}
                                  onChange={(e) => setDraftNote(e.target.value)}
                                  placeholder="Add annotation note..."
                                  className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                                />
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setEditingNoteId(null)}
                                    className="rounded border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSaveNote(h.id)}
                                    className="rounded bg-blue-600 px-2.5 py-0.5 text-[11px] font-medium text-white hover:bg-blue-700"
                                  >
                                    Save Note
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="mt-2 flex items-start justify-between gap-2 border-t border-slate-100 pt-1.5">
                                {h.note ? (
                                  <p className="text-[11px] leading-relaxed text-slate-600">
                                    {h.note}
                                  </p>
                                ) : (
                                  <span className="text-[11px] text-slate-400">No note</span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingNoteId(h.id);
                                    setDraftNote(h.note || '');
                                  }}
                                  className="shrink-0 text-[11px] font-medium text-blue-700 hover:underline"
                                >
                                  {h.note ? 'Edit' : '+ Note'}
                                </button>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-5">
                <div className="font-mono text-[11px] font-semibold text-blue-700">
                  {paper.primaryCategory} · {paper.published.slice(0, 10)}
                </div>
                <h3 className="mt-1.5 font-serif text-base font-semibold leading-snug text-slate-900">
                  {paper.title}
                </h3>
                <AuthorLinkList
                  authors={paper.authors}
                  authorDetails={paper.authorDetails}
                  maxVisible={0}
                  preferSource={paper.source || 'arxiv'}
                  onSearchAuthorInArxiv={(name) => {
                    onClose();
                    onSearchAuthorInArxiv?.(name);
                  }}
                  onSearchAuthorInInspire={(name) => {
                    onClose();
                    onSearchAuthorInInspire?.(name);
                  }}
                  className="mt-2 leading-relaxed"
                />

                <div className="mt-4 border-t border-slate-100 pt-3">
                  <h4 className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                    Abstract
                  </h4>
                  <p className="mt-1.5 font-serif text-xs leading-relaxed text-slate-700">
                    {paper.abstract || 'No abstract available.'}
                  </p>
                </div>

                <div className="mt-4 border-t border-slate-100 pt-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                      BibTeX
                    </h4>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(paperToBibtex(paper));
                        setCopiedBib(true);
                        setTimeout(() => setCopiedBib(false), 1600);
                      }}
                      className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {copiedBib ? (
                        <Check className="h-3 w-3 text-emerald-700" aria-hidden="true" />
                      ) : (
                        <Copy className="h-3 w-3" aria-hidden="true" />
                      )}
                      <span>{copiedBib ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-[10px] leading-relaxed text-slate-700">
                    {paperToBibtex(paper)}
                  </pre>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
