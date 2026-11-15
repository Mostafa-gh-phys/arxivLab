import { useEffect, useState } from 'react';
import {
  Bookmark,
  BookmarkCheck,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  RotateCw,
  Send,
  X,
} from 'lucide-react';
import { paperToBibtex } from '../shared/citations';
import { buildPdfEndpointUrl, triggerPaperPdfDownload } from '../shared/download';
import type { ArxivPaper, SavedPaper } from '../shared/types';
import { AuthorLinkList } from './AuthorLinkList';

interface PdfPreviewModalProps {
  paper: ArxivPaper | SavedPaper | null;
  open: boolean;
  isSaved: boolean;
  onClose: () => void;
  onSavePaper: (paper: ArxivPaper) => Promise<void>;
  onSyncZotero: (paper: ArxivPaper) => Promise<void>;
  onSearchAuthorInArxiv?: (authorName: string) => void;
  onSearchAuthorInInspire?: (authorName: string) => void;
}

export function PdfPreviewModal({
  paper,
  open,
  isSaved,
  onClose,
  onSavePaper,
  onSyncZotero,
  onSearchAuthorInArxiv,
  onSearchAuthorInInspire,
}: PdfPreviewModalProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [copiedBib, setCopiedBib] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setIframeLoaded(false);
    setFeedback(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, paper?.id, onClose]);

  if (!open || !paper) return null;

  const previewUrl = `${buildPdfEndpointUrl(paper, { view: true, save: true })}&v=${reloadNonce}#toolbar=1&navpanes=0&view=FitH`;

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Document Viewer — ${paper.title}`}
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/80 backdrop-blur-xs"
    >
      {/* Top Document Viewer Toolbar (Zotero-inspired) */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-2.5 text-slate-100">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-600/20 px-2 py-1 font-mono text-[11px] font-semibold text-blue-300">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{paper.id.startsWith('inspire:') ? paper.id : `arXiv:${paper.id}`}</span>
          </span>
          <h2 className="truncate font-serif text-sm font-semibold text-white">
            {paper.title}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {feedback && (
            <span className="max-w-xs truncate rounded bg-slate-800 px-2.5 py-1 text-[11px] text-slate-200">
              {feedback}
            </span>
          )}

          <button
            type="button"
            onClick={() => {
              setIframeLoaded(false);
              setReloadNonce((n) => n + 1);
            }}
            title="Reload PDF preview"
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
          >
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Reload</span>
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
            <span>Download PDF</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              setSaving(true);
              try {
                await onSavePaper(paper);
                setFeedback('Saved to library');
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${
              isSaved
                ? 'border border-emerald-700 bg-emerald-900/50 text-emerald-200'
                : 'bg-blue-600 text-white hover:bg-blue-500'
            }`}
          >
            {isSaved ? (
              <BookmarkCheck className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>{isSaved ? 'Saved' : 'Save'}</span>
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
            <span>Zotero</span>
          </button>

          <a
            href={paper.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden md:inline">Source</span>
          </a>

          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label={sidebarOpen ? 'Hide info sidebar' : 'Show info sidebar'}
            className="rounded-md border border-slate-700 bg-slate-800 p-1.5 text-slate-200 hover:bg-slate-700"
          >
            {sidebarOpen ? (
              <PanelRightClose className="h-4 w-4" aria-hidden="true" />
            ) : (
              <PanelRightOpen className="h-4 w-4" aria-hidden="true" />
            )}
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

      {/* Main Split Stage: PDF Document Canvas + Zotero-like Info/Citation Pane */}
      <div className="flex min-h-0 flex-1">
        <div className="relative flex-1 bg-slate-800">
          {!iframeLoaded && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-300">
              <Loader2 className="h-6 w-6 animate-spin text-blue-400" aria-hidden="true" />
              <p className="text-xs font-medium">Streaming PDF preview...</p>
            </div>
          )}
          <iframe
            key={`${paper.id}-${reloadNonce}`}
            src={previewUrl}
            title={`PDF preview for ${paper.title}`}
            onLoad={() => setIframeLoaded(true)}
            className="h-full w-full border-0 bg-slate-800"
          />
        </div>

        {sidebarOpen && (
          <aside className="hidden w-88 shrink-0 flex-col overflow-y-auto border-l border-slate-800 bg-white p-5 lg:flex">
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
          </aside>
        )}
      </div>
    </div>
  );
}
