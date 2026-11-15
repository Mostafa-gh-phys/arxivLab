import { useEffect, useState } from 'react';
import {
  Bookmark,
  BookmarkCheck,
  Check,
  Copy,
  Download,
  Eye,
  ExternalLink,
  FileText,
  Loader2,
  Maximize2,
  Send,
  X,
} from 'lucide-react';
import { paperToBibtex } from '../shared/citations';
import { buildPdfEndpointUrl, triggerPaperPdfDownload } from '../shared/download';
import { mapInspireDocumentTypesToTags } from '../shared/inspire';
import type { ArxivPaper, SavedPaper } from '../shared/types';
import { AuthorLinkList } from './AuthorLinkList';
import { PdfPreviewModal } from './PdfPreviewModal';

interface PaperReaderPanelProps {
  paper: ArxivPaper | SavedPaper | null;
  isSaved: boolean;
  onClose: () => void;
  onSavePaper: (paper: ArxivPaper) => Promise<void>;
  onSyncZotero: (paper: ArxivPaper) => Promise<void>;
  onSearchAuthorInArxiv?: (authorName: string) => void;
  onSearchAuthorInInspire?: (authorName: string) => void;
}

export function PaperReaderPanel({
  paper,
  isSaved,
  onClose,
  onSavePaper,
  onSyncZotero,
  onSearchAuthorInArxiv,
  onSearchAuthorInInspire,
}: PaperReaderPanelProps) {
  const [fullText, setFullText] = useState<string | null>(null);
  const [fullTextSource, setFullTextSource] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadFeedback, setDownloadFeedback] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [zoteroFeedback, setZoteroFeedback] = useState<string | null>(null);
  const [copiedBibtex, setCopiedBibtex] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [pdfFrameLoaded, setPdfFrameLoaded] = useState(false);
  const [activeSubView, setActiveSubView] = useState<
    'overview' | 'pdf' | 'fulltext' | 'bibtex'
  >('overview');

  useEffect(() => {
    setFullText(null);
    setFullTextSource(null);
    setTextError(null);
    setDownloadFeedback(null);
    setZoteroFeedback(null);
    setPdfFrameLoaded(false);
    setActiveSubView('overview');
  }, [paper?.id]);

  if (!paper) {
    return (
      <aside className="hidden xl:sticky xl:top-16 xl:flex xl:w-[430px] shrink-0 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center">
        <FileText className="h-8 w-8 text-slate-300" aria-hidden="true" />
        <p className="mt-3 text-sm font-semibold text-slate-800">Select a paper to inspect</p>
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">
          Choose any entry from the results or library to read its abstract, preview the PDF in-app, copy BibTeX, or push to Zotero.
        </p>
      </aside>
    );
  }

  const handleLoadFullText = async () => {
    setActiveSubView('fulltext');
    if (fullText) return;
    if (paper.id.startsWith('inspire:')) {
      setFullText(paper.abstract || paper.title);
      setFullTextSource('inspire-abstract');
      return;
    }
    setLoadingText(true);
    setTextError(null);
    try {
      const res = await fetch(
        `/api/arxiv/paper?id=${encodeURIComponent(paper.id)}&content=1`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load paper content.');
      }
      setFullText(data.readable?.text || paper.abstract);
      setFullTextSource(data.readable?.source || 'abstract-only');
    } catch (err: unknown) {
      setTextError((err as Error).message);
    } finally {
      setLoadingText(false);
    }
  };

  const handleDownloadPdf = async () => {
    setDownloading(true);
    setDownloadFeedback(null);
    try {
      const res = await triggerPaperPdfDownload(paper);
      setDownloadFeedback(`Saved ${res.fileName}`);
    } catch (err: unknown) {
      setDownloadFeedback((err as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSavePaper(paper);
    } finally {
      setSaving(false);
    }
  };

  const handleZoteroPush = async () => {
    setSyncing(true);
    setZoteroFeedback(null);
    try {
      await onSyncZotero(paper);
      setZoteroFeedback('Synced to Zotero');
    } catch (err: unknown) {
      setZoteroFeedback((err as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const handleCopyBibtex = async () => {
    await navigator.clipboard.writeText(paperToBibtex(paper));
    setCopiedBibtex(true);
    setTimeout(() => setCopiedBibtex(false), 1800);
  };

  const bibtexText = paperToBibtex(paper);
  const isInspireOnly = paper.id.startsWith('inspire:');
  const docTypeTags = mapInspireDocumentTypesToTags(paper.documentTypes, paper.comment);
  const inlinePdfUrl = `${buildPdfEndpointUrl(paper, { view: true, save: true })}#toolbar=1&navpanes=0&view=FitH`;

  return (
    <>
      <aside
        aria-label={`Paper details for ${paper.title}`}
        className="fixed top-13 bottom-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-black/[0.08] bg-white shadow-xl xl:sticky xl:top-16 xl:bottom-auto xl:right-auto xl:z-auto xl:max-h-[calc(100vh-5.5rem)] xl:w-[440px] xl:max-w-none xl:shrink-0 xl:rounded-xl xl:border xl:shadow-none"
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-200/80 px-5 py-3.5">
          <span className="font-mono text-xs font-medium text-slate-600 tabular-nums">
            {isInspireOnly ? paper.id : `arXiv:${paper.versionedId}`}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPreviewModalOpen(true)}
              title="Open full document viewer"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50"
            >
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Viewer</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={`Close reader for ${paper.title}`}
              className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-slate-500 tabular-nums">
            <span className="font-semibold text-blue-600">{paper.primaryCategory}</span>
            {docTypeTags.map((tag) => (
              <span key={tag}>· {tag}</span>
            ))}
            {paper.categories
              .filter((c) => c !== paper.primaryCategory)
              .map((cat) => (
                <span key={cat}>· {cat}</span>
              ))}
            {typeof paper.citationCount === 'number' && (
              <span>· {paper.citationCount.toLocaleString()} citations</span>
            )}
            <span>· Published {paper.published.slice(0, 10)}</span>
            {'pdfCached' in paper && paper.pdfCached && (
              <span className="text-emerald-700">· PDF cached</span>
            )}
          </div>

          <h2 className="mt-2.5 font-serif text-xl font-semibold leading-snug text-slate-900 [text-wrap:balance]">
            {paper.title}
          </h2>

          <AuthorLinkList
            authors={paper.authors}
            authorDetails={paper.authorDetails}
            maxVisible={0}
            preferSource={paper.source || 'arxiv'}
            onSearchAuthorInArxiv={onSearchAuthorInArxiv}
            onSearchAuthorInInspire={onSearchAuthorInInspire}
            className="mt-2 leading-relaxed"
          />

          {/* Primary Action Strip */}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-y border-slate-100 py-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                isSaved
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : isSaved ? (
                <BookmarkCheck className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{isSaved ? 'Saved' : 'Save'}</span>
            </button>

            <button
              type="button"
              onClick={() => setPreviewModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-1.5 text-xs font-medium text-blue-800 transition-colors hover:bg-blue-100 whitespace-nowrap shrink-0"
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Preview PDF</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              {downloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" aria-hidden="true" />
              ) : (
                <Download className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
              )}
              <span>{downloading ? 'Downloading...' : 'Download'}</span>
            </button>

            <button
              type="button"
              onClick={handleZoteroPush}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
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
              aria-label={`Open PDF externally for ${paper.title}`}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>

          {(zoteroFeedback || downloadFeedback) && (
            <p className="mt-2.5 text-xs font-medium text-slate-700">
              {downloadFeedback || zoteroFeedback}
            </p>
          )}

          {/* Sub-view Tabs */}
          <div className="mt-4 flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setActiveSubView('overview')}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                activeSubView === 'overview'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Abstract
            </button>
            <button
              type="button"
              onClick={() => {
                setPdfFrameLoaded(false);
                setActiveSubView('pdf');
              }}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                activeSubView === 'pdf'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              PDF Preview
            </button>
            <button
              type="button"
              onClick={handleLoadFullText}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                activeSubView === 'fulltext'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Reader Text
            </button>
            <button
              type="button"
              onClick={() => setActiveSubView('bibtex')}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                activeSubView === 'bibtex'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              BibTeX
            </button>
          </div>

          {activeSubView === 'overview' && (
            <div className="mt-4 space-y-4">
              <p className="font-serif text-[15px] leading-relaxed text-slate-800">
                {paper.abstract || 'No abstract provided for this record.'}
              </p>

              <dl className="space-y-2 border-t border-slate-100 pt-3 text-xs">
                {paper.journalRef && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Journal Ref</dt>
                    <dd className="text-right font-medium text-slate-800">{paper.journalRef}</dd>
                  </div>
                )}
                {paper.doi && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">DOI</dt>
                    <dd className="text-right font-mono text-slate-800">{paper.doi}</dd>
                  </div>
                )}
                {paper.comment && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Comments</dt>
                    <dd className="text-right text-slate-700">{paper.comment}</dd>
                  </div>
                )}
                {paper.inspireUrl && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">INSPIRE-HEP</dt>
                    <dd>
                      <a
                        href={paper.inspireUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-blue-700 hover:underline"
                      >
                        {paper.inspireUrl}
                      </a>
                    </dd>
                  </div>
                )}
                {!isInspireOnly && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">arXiv Page</dt>
                    <dd>
                      <a
                        href={paper.absUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-blue-700 hover:underline"
                      >
                        {paper.absUrl}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {activeSubView === 'pdf' && (
            <div className="mt-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">Inline PDF Preview</span>
                <button
                  type="button"
                  onClick={() => setPreviewModalOpen(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50"
                >
                  <Maximize2 className="h-3 w-3" aria-hidden="true" />
                  <span>Expand Full Reader</span>
                </button>
              </div>
              <div className="relative h-[460px] overflow-hidden rounded-lg border border-slate-200 bg-slate-800">
                {!pdfFrameLoaded && (
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-300">
                    <Loader2 className="h-5 w-5 animate-spin text-blue-400" aria-hidden="true" />
                    <span className="text-xs">Loading PDF document...</span>
                  </div>
                )}
                <iframe
                  key={paper.id}
                  src={inlinePdfUrl}
                  title={`Inline PDF preview for ${paper.title}`}
                  onLoad={() => setPdfFrameLoaded(true)}
                  className="h-full w-full border-0"
                />
              </div>
            </div>
          )}

          {activeSubView === 'fulltext' && (
            <div className="mt-4">
              {loadingText ? (
                <div className="flex items-center gap-2 py-8 text-xs text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-700" aria-hidden="true" />
                  <span>Fetching readable text from arxiv.org...</span>
                </div>
              ) : textError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  {textError}
                </div>
              ) : (
                <div className="space-y-3">
                  {fullTextSource && (
                    <p className="font-mono text-[11px] text-slate-500">
                      Source: {fullTextSource}
                    </p>
                  )}
                  <div className="max-h-[420px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3.5 font-serif text-sm leading-relaxed text-slate-800">
                    {fullText || paper.abstract}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeSubView === 'bibtex' && (
            <div className="mt-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">BibTeX Entry</span>
                <button
                  type="button"
                  onClick={handleCopyBibtex}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  {copiedBibtex ? (
                    <Check className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>{copiedBibtex ? 'Copied' : 'Copy BibTeX'}</span>
                </button>
              </div>
              <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-800">
                {bibtexText}
              </pre>
            </div>
          )}
        </div>
      </aside>

      <PdfPreviewModal
        paper={paper}
        open={previewModalOpen}
        isSaved={isSaved}
        onClose={() => setPreviewModalOpen(false)}
        onSavePaper={onSavePaper}
        onSyncZotero={onSyncZotero}
        onSearchAuthorInArxiv={onSearchAuthorInArxiv}
        onSearchAuthorInInspire={onSearchAuthorInInspire}
      />
    </>
  );
}
