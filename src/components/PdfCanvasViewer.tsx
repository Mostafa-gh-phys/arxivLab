import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ExternalLink, Highlighter, Loader2, RotateCw } from 'lucide-react';
import {
  HIGHLIGHT_PALETTE,
  normalizeClientRects,
  normalizeDragBox,
} from '../shared/highlights';
import type {
  PdfHighlight,
  PdfHighlightColor,
  PdfHighlightRect,
} from '../shared/types';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type PdfViewerToolMode = 'select' | 'highlight_text' | 'highlight_area';

interface PdfCanvasViewerProps {
  pdfUrl: string;
  externalFallbackUrl?: string;
  highlights: PdfHighlight[];
  toolMode: PdfViewerToolMode;
  activeColor: PdfHighlightColor;
  zoom: number;
  reloadNonce?: number;
  activeHighlightId?: string | null;
  jumpToPage?: { page: number; nonce: number } | null;
  compact?: boolean;
  onTotalPagesChange?: (total: number) => void;
  onCurrentPageChange?: (page: number) => void;
  onAddHighlight: (item: Omit<PdfHighlight, 'id' | 'createdAt'>) => void;
  onSelectHighlight?: (highlight: PdfHighlight) => void;
}

interface PendingTextSelection {
  page: number;
  rects: PdfHighlightRect[];
  quote: string;
  anchorTopPx: number;
  anchorLeftPx: number;
}

interface PdfPageCanvasProps {
  doc: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  baseWidth: number;
  pageHighlights: PdfHighlight[];
  toolMode: PdfViewerToolMode;
  activeColor: PdfHighlightColor;
  activeHighlightId?: string | null;
  onTextSelectionCaptured: (pageNumber: number, pageEl: HTMLElement) => void;
  onCreateAreaHighlight: (pageNumber: number, rect: PdfHighlightRect) => void;
  onSelectHighlight?: (highlight: PdfHighlight) => void;
  registerPageRef: (pageNumber: number, el: HTMLDivElement | null) => void;
}

function PdfPageCanvas({
  doc,
  pageNumber,
  zoom,
  baseWidth,
  pageHighlights,
  toolMode,
  activeColor,
  activeHighlightId,
  onTextSelectionCaptured,
  onCreateAreaHighlight,
  onSelectHighlight,
  registerPageRef,
}: PdfPageCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);

  const [inView, setInView] = useState(pageNumber <= 3);
  const [rendered, setRendered] = useState(false);
  const [pageRatio, setPageRatio] = useState(1.294); // Letter aspect ratio default
  const [dragBox, setDragBox] = useState<{
    startX: number;
    startY: number;
    currX: number;
    currY: number;
  } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    registerPageRef(pageNumber, el);
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
          }
        }
      },
      { rootMargin: '250px 0px' }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      registerPageRef(pageNumber, null);
    };
  }, [pageNumber, registerPageRef]);

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    let renderTask: pdfjsLib.RenderTask | null = null;
    let textLayerInstance: pdfjsLib.TextLayer | null = null;

    async function drawPage() {
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        setPageRatio(baseViewport.height / baseViewport.width);

        const targetCssWidth = Math.max(240, baseWidth * zoom);
        const cssScale = targetCssWidth / baseViewport.width;
        const viewport = page.getViewport({ scale: cssScale });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        const canvas = canvasRef.current;
        const textLayerEl = textLayerRef.current;
        if (!canvas || !textLayerEl) return;

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined;
        renderTask = page.render({
          canvasContext: ctx,
          viewport,
          canvas,
          transform,
        });
        await renderTask.promise;
        if (cancelled) return;

        textLayerEl.innerHTML = '';
        textLayerEl.style.width = `${Math.floor(viewport.width)}px`;
        textLayerEl.style.height = `${Math.floor(viewport.height)}px`;
        textLayerEl.style.setProperty('--scale-factor', String(viewport.scale));
        textLayerEl.style.setProperty('--total-scale-factor', String(viewport.scale));

        textLayerInstance = new pdfjsLib.TextLayer({
          textContentSource: page.streamTextContent(),
          container: textLayerEl,
          viewport,
        });
        await textLayerInstance.render();
        if (!cancelled) {
          setRendered(true);
        }
      } catch {
        // Page render cancelled or aborted cleanly
      }
    }

    setRendered(false);
    void drawPage();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayerInstance?.cancel();
    };
  }, [doc, pageNumber, zoom, baseWidth, inView]);

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (toolMode !== 'highlight_area') return;
    if (e.button !== 0) return;
    const el = containerRef.current;
    if (!el) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    setDragBox({
      startX: e.clientX,
      startY: e.clientY,
      currX: e.clientX,
      currY: e.clientY,
    });
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragBox) return;
    setDragBox((prev) => (prev ? { ...prev, currX: e.clientX, currY: e.clientY } : null));
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (toolMode === 'highlight_area' && dragBox && el) {
      if (el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }
      const box = el.getBoundingClientRect();
      const norm = normalizeDragBox(
        { x: dragBox.startX, y: dragBox.startY },
        { x: e.clientX, y: e.clientY },
        { left: box.left, top: box.top, width: box.width, height: box.height }
      );
      setDragBox(null);
      if (norm) {
        onCreateAreaHighlight(pageNumber, norm);
      }
      return;
    }

    if (el) {
      setTimeout(() => onTextSelectionCaptured(pageNumber, el), 10);
    }
  };

  const targetW = Math.floor(Math.max(240, baseWidth * zoom));
  const estimatedH = Math.floor(targetW * pageRatio);

  let liveBoxStyle: { left: number; top: number; width: number; height: number } | null = null;
  if (dragBox && containerRef.current) {
    const rect = containerRef.current.getBoundingClientRect();
    liveBoxStyle = {
      left: Math.min(dragBox.startX, dragBox.currX) - rect.left,
      top: Math.min(dragBox.startY, dragBox.currY) - rect.top,
      width: Math.abs(dragBox.currX - dragBox.startX),
      height: Math.abs(dragBox.currY - dragBox.startY),
    };
  }

  return (
    <div
      ref={containerRef}
      data-pdf-page={pageNumber}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ width: `${targetW}px`, minHeight: `${estimatedH}px` }}
      className={`relative mx-auto overflow-hidden rounded-sm bg-white shadow-md ring-1 ring-black/10 ${
        toolMode === 'highlight_area' ? 'cursor-crosshair select-none' : ''
      }`}
    >
      <canvas ref={canvasRef} className="block" />

      {/* Persisted Library Highlights Layer */}
      <div className="pointer-events-none absolute inset-0 z-[3]">
        {pageHighlights.map((h) => {
          const palette = HIGHLIGHT_PALETTE[h.color] || HIGHLIGHT_PALETTE.amber;
          const isSelected = activeHighlightId === h.id;
          return h.rects.map((r, idx) => (
            <button
              key={`${h.id}-${idx}`}
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                onSelectHighlight?.(h);
              }}
              title={h.note ? `${h.quote} — Note: ${h.note}` : h.quote}
              aria-label={`Highlight on page ${h.page}: ${h.quote.slice(0, 48)}`}
              style={{
                left: `${r.x * 100}%`,
                top: `${r.y * 100}%`,
                width: `${r.width * 100}%`,
                height: `${r.height * 100}%`,
              }}
              className={`pointer-events-auto absolute rounded-[2px] mix-blend-multiply transition-shadow ${palette.overlayClass} ${
                h.kind === 'area' ? 'border border-dashed' : ''
              } ${isSelected ? 'ring-2 ring-slate-900 ring-offset-1' : 'hover:ring-1 hover:ring-slate-700'}`}
            />
          ));
        })}

        {liveBoxStyle && (
          <div
            style={{
              left: `${liveBoxStyle.left}px`,
              top: `${liveBoxStyle.top}px`,
              width: `${liveBoxStyle.width}px`,
              height: `${liveBoxStyle.height}px`,
            }}
            className={`absolute rounded-xs border-2 border-dashed ${HIGHLIGHT_PALETTE[activeColor].overlayClass}`}
          />
        )}
      </div>

      {/* Interactive PDF.js Text Layer (disabled during drag-area mode so drags stay crisp) */}
      <div
        ref={textLayerRef}
        className={`axl-pdf-text-layer ${toolMode === 'highlight_area' ? 'pointer-events-none' : ''}`}
      />

      {!rendered && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-50/70 text-xs text-slate-500">
          <span>Rendering page {pageNumber}...</span>
        </div>
      )}

      <span className="pointer-events-none absolute right-2 bottom-1.5 z-[4] rounded bg-slate-900/60 px-1.5 py-0.5 font-mono text-[10px] text-white tabular-nums">
        {pageNumber}
      </span>
    </div>
  );
}

export function PdfCanvasViewer({
  pdfUrl,
  externalFallbackUrl,
  highlights,
  toolMode,
  activeColor,
  zoom,
  reloadNonce = 0,
  activeHighlightId,
  jumpToPage,
  compact = false,
  onTotalPagesChange,
  onCurrentPageChange,
  onAddHighlight,
  onSelectHighlight,
}: PdfCanvasViewerProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const [doc, setDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [baseWidth, setBaseWidth] = useState(compact ? 360 : 740);
  const [pendingSelection, setPendingSelection] = useState<PendingTextSelection | null>(null);

  const registerPageRef = useCallback((pageNum: number, el: HTMLDivElement | null) => {
    if (el) {
      pageRefs.current.set(pageNum, el);
    } else {
      pageRefs.current.delete(pageNum);
    }
  }, []);

  // Measure scroll viewport to compute clean fit-width baseline
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const measure = () => {
      const padding = compact ? 20 : 48;
      const available = Math.max(260, container.clientWidth - padding);
      setBaseWidth(Math.min(available, compact ? 520 : 860));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, [compact]);

  // Fetch PDF bytes & open document via PDF.js
  useEffect(() => {
    let cancelled = false;
    let loadingTask: pdfjsLib.PDFDocumentLoadingTask | null = null;
    let activeDoc: pdfjsLib.PDFDocumentProxy | null = null;

    async function loadPdf() {
      setLoading(true);
      setError(null);
      setPendingSelection(null);
      try {
        const res = await fetch(pdfUrl);
        if (!res.ok) {
          throw new Error(`PDF stream returned HTTP ${res.status}`);
        }
        const buffer = await res.arrayBuffer();
        if (cancelled) return;

        loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(buffer),
        });
        const loaded = await loadingTask.promise;
        if (cancelled) {
          await loaded.cleanup();
          return;
        }
        activeDoc = loaded;
        setDoc(loaded);
        setNumPages(loaded.numPages);
        onTotalPagesChange?.(loaded.numPages);
        onCurrentPageChange?.(1);
      } catch (err: unknown) {
        if (!cancelled) {
          setError((err as Error).message || 'Unable to load PDF preview.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPdf();

    return () => {
      cancelled = true;
      void loadingTask?.destroy();
      void activeDoc?.cleanup();
    };
  }, [pdfUrl, reloadNonce, retryCount, onTotalPagesChange, onCurrentPageChange]);

  // Jump to requested page
  useEffect(() => {
    if (!jumpToPage?.page) return;
    const target = pageRefs.current.get(jumpToPage.page);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [jumpToPage]);

  // Track visible page number on scroll
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container || numPages === 0) return;
    const containerTop = container.getBoundingClientRect().top;
    let closestPage = 1;
    let bestDist = Infinity;
    for (const [pageNumber, el] of pageRefs.current.entries()) {
      const dist = Math.abs(el.getBoundingClientRect().top - containerTop - 24);
      if (dist < bestDist) {
        bestDist = dist;
        closestPage = pageNumber;
      }
    }
    onCurrentPageChange?.(closestPage);
  };

  const captureTextSelection = useCallback(
    (pageNumber: number, pageEl: HTMLElement) => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setPendingSelection(null);
        return;
      }
      const quote = sel.toString().replace(/\s+/g, ' ').trim();
      if (!quote) {
        setPendingSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!pageEl.contains(range.commonAncestorContainer)) {
        return;
      }
      const clientRects = Array.from(range.getClientRects()).map((r) => ({
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
      }));
      const pageBox = pageEl.getBoundingClientRect();
      const rects = normalizeClientRects(clientRects, {
        left: pageBox.left,
        top: pageBox.top,
        width: pageBox.width,
        height: pageBox.height,
      });
      if (rects.length === 0) return;

      if (toolMode === 'highlight_text') {
        onAddHighlight({
          page: pageNumber,
          color: activeColor,
          kind: 'text',
          rects,
          quote,
          note: '',
        });
        sel.removeAllRanges();
        setPendingSelection(null);
        return;
      }

      const scrollEl = scrollContainerRef.current;
      const scrollRect = scrollEl?.getBoundingClientRect();
      const firstClient = clientRects[0];
      setPendingSelection({
        page: pageNumber,
        rects,
        quote,
        anchorTopPx: scrollRect
          ? Math.max(12, firstClient.top - scrollRect.top + (scrollEl?.scrollTop || 0) - 44)
          : 16,
        anchorLeftPx: scrollRect
          ? Math.max(12, Math.min(firstClient.left - scrollRect.left, scrollRect.width - 260))
          : 16,
      });
    },
    [toolMode, activeColor, onAddHighlight]
  );

  const commitPendingSelection = (color: PdfHighlightColor) => {
    if (!pendingSelection) return;
    onAddHighlight({
      page: pendingSelection.page,
      color,
      kind: 'text',
      rects: pendingSelection.rects,
      quote: pendingSelection.quote,
      note: '',
    });
    window.getSelection()?.removeAllRanges();
    setPendingSelection(null);
  };

  if (loading) {
    return (
      <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2.5 bg-slate-800 p-6 text-slate-300">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" aria-hidden="true" />
        <p className="text-xs font-medium">Loading interactive PDF pages &amp; highlights...</p>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-3 bg-slate-900 p-6 text-center text-slate-200">
        <p className="text-sm font-semibold">Could not render PDF inside preview</p>
        <p className="max-w-md text-xs text-slate-400">{error || 'PDF document unavailable.'}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setRetryCount((c) => c + 1)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
          >
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Retry PDF</span>
          </button>
          {externalFallbackUrl && (
            <a
              href={externalFallbackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Open Source PDF</span>
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="relative h-full w-full overflow-y-auto bg-slate-800 p-3 sm:p-5"
    >
      {/* Floating quick-highlight popover when text is selected in Read/Select mode */}
      {pendingSelection && (
        <div
          role="toolbar"
          aria-label="Highlight selected text"
          style={{
            top: `${pendingSelection.anchorTopPx}px`,
            left: `${pendingSelection.anchorLeftPx}px`,
          }}
          className="absolute z-30 flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/95 px-2.5 py-1.5 text-xs text-white shadow-xl backdrop-blur-xs"
        >
          <Highlighter className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
          <span className="text-[11px] font-medium text-slate-200">Highlight:</span>
          {(['amber', 'emerald', 'sky', 'rose'] as PdfHighlightColor[]).map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => commitPendingSelection(color)}
              aria-label={`Highlight in ${HIGHLIGHT_PALETTE[color].label}`}
              className={`h-5 w-5 rounded-full border ${HIGHLIGHT_PALETTE[color].swatchClass} transition-transform hover:scale-110`}
            />
          ))}
        </div>
      )}

      <div className="space-y-4">
        {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNumber) => (
          <PdfPageCanvas
            key={pageNumber}
            doc={doc}
            pageNumber={pageNumber}
            zoom={zoom}
            baseWidth={baseWidth}
            pageHighlights={highlights.filter((h) => h.page === pageNumber)}
            toolMode={toolMode}
            activeColor={activeColor}
            activeHighlightId={activeHighlightId}
            onTextSelectionCaptured={captureTextSelection}
            onCreateAreaHighlight={(p, rect) =>
              onAddHighlight({
                page: p,
                color: activeColor,
                kind: 'area',
                rects: [rect],
                quote: `[Highlighted region on page ${p}]`,
                note: '',
              })
            }
            onSelectHighlight={onSelectHighlight}
            registerPageRef={registerPageRef}
          />
        ))}
      </div>
    </div>
  );
}
