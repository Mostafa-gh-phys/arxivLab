import type {
  ArxivPaper,
  PdfHighlight,
  PdfHighlightColor,
  PdfHighlightRect,
} from './types';

export interface HighlightColorStyle {
  id: PdfHighlightColor;
  label: string;
  swatchClass: string;
  overlayClass: string;
  badgeClass: string;
}

export const HIGHLIGHT_PALETTE: Record<PdfHighlightColor, HighlightColorStyle> = {
  amber: {
    id: 'amber',
    label: 'Yellow',
    swatchClass: 'bg-amber-300 border-amber-500',
    overlayClass: 'bg-amber-300/45 border-amber-500/70',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  emerald: {
    id: 'emerald',
    label: 'Green',
    swatchClass: 'bg-emerald-300 border-emerald-500',
    overlayClass: 'bg-emerald-300/40 border-emerald-500/70',
    badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  },
  sky: {
    id: 'sky',
    label: 'Blue',
    swatchClass: 'bg-sky-300 border-sky-500',
    overlayClass: 'bg-sky-300/40 border-sky-500/70',
    badgeClass: 'bg-sky-100 text-sky-900 border-sky-300',
  },
  rose: {
    id: 'rose',
    label: 'Pink',
    swatchClass: 'bg-rose-300 border-rose-500',
    overlayClass: 'bg-rose-300/40 border-rose-500/70',
    badgeClass: 'bg-rose-100 text-rose-900 border-rose-300',
  },
};

export interface BoxLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function normalizeClientRects(
  clientRects: BoxLike[],
  pageBox: BoxLike
): PdfHighlightRect[] {
  if (pageBox.width <= 0 || pageBox.height <= 0) return [];

  const raw: PdfHighlightRect[] = [];
  for (const r of clientRects) {
    if (r.width < 2 || r.height < 2) continue;
    const x1 = clamp01((r.left - pageBox.left) / pageBox.width);
    const y1 = clamp01((r.top - pageBox.top) / pageBox.height);
    const x2 = clamp01((r.left + r.width - pageBox.left) / pageBox.width);
    const y2 = clamp01((r.top + r.height - pageBox.top) / pageBox.height);
    const width = x2 - x1;
    const height = y2 - y1;
    if (width <= 0.001 || height <= 0.001) continue;
    raw.push({
      x: round4(x1),
      y: round4(y1),
      width: round4(width),
      height: round4(height),
    });
  }

  if (raw.length <= 1) return raw;

  // Sort top-to-bottom, left-to-right and coalesce same-line spans
  raw.sort((a, b) => (Math.abs(a.y - b.y) > 0.008 ? a.y - b.y : a.x - b.x));

  const merged: PdfHighlightRect[] = [];
  for (const rect of raw) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      Math.abs(prev.y - rect.y) <= 0.008 &&
      Math.abs(prev.height - rect.height) <= 0.012 &&
      rect.x <= prev.x + prev.width + 0.012
    ) {
      const nextRight = Math.max(prev.x + prev.width, rect.x + rect.width);
      const nextTop = Math.min(prev.y, rect.y);
      const nextBottom = Math.max(prev.y + prev.height, rect.y + rect.height);
      prev.x = round4(Math.min(prev.x, rect.x));
      prev.y = round4(nextTop);
      prev.width = round4(nextRight - prev.x);
      prev.height = round4(nextBottom - nextTop);
    } else {
      merged.push({ ...rect });
    }
  }

  return merged;
}

export function normalizeDragBox(
  start: { x: number; y: number },
  end: { x: number; y: number },
  pageBox: BoxLike
): PdfHighlightRect | null {
  if (pageBox.width <= 0 || pageBox.height <= 0) return null;
  const pxW = Math.abs(end.x - start.x);
  const pxH = Math.abs(end.y - start.y);
  if (pxW < 8 || pxH < 8) return null;

  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const x1 = clamp01((left - pageBox.left) / pageBox.width);
  const y1 = clamp01((top - pageBox.top) / pageBox.height);
  const x2 = clamp01((left + pxW - pageBox.left) / pageBox.width);
  const y2 = clamp01((top + pxH - pageBox.top) / pageBox.height);
  if (x2 - x1 <= 0.002 || y2 - y1 <= 0.002) return null;

  return {
    x: round4(x1),
    y: round4(y1),
    width: round4(x2 - x1),
    height: round4(y2 - y1),
  };
}

export function sortHighlightsByReadingOrder(list: PdfHighlight[]): PdfHighlight[] {
  return [...list].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    const ay = a.rects[0]?.y ?? 0;
    const by = b.rects[0]?.y ?? 0;
    if (Math.abs(ay - by) > 0.004) return ay - by;
    return (a.rects[0]?.x ?? 0) - (b.rects[0]?.x ?? 0);
  });
}

export function upsertHighlight(
  list: PdfHighlight[] | undefined,
  item: PdfHighlight
): PdfHighlight[] {
  const base = Array.isArray(list) ? list : [];
  const idx = base.findIndex((h) => h.id === item.id);
  const next = idx >= 0 ? base.map((h, i) => (i === idx ? item : h)) : [...base, item];
  return sortHighlightsByReadingOrder(next);
}

export function updateHighlight(
  list: PdfHighlight[] | undefined,
  id: string,
  patch: Partial<Pick<PdfHighlight, 'note' | 'color' | 'quote'>>
): PdfHighlight[] {
  const base = Array.isArray(list) ? list : [];
  return sortHighlightsByReadingOrder(
    base.map((h) => (h.id === id ? { ...h, ...patch } : h))
  );
}

export function removeHighlight(
  list: PdfHighlight[] | undefined,
  id: string
): PdfHighlight[] {
  const base = Array.isArray(list) ? list : [];
  return base.filter((h) => h.id !== id);
}

export function mergeHighlights(
  existing: PdfHighlight[] | undefined,
  incoming: PdfHighlight[] | undefined
): PdfHighlight[] {
  const map = new Map<string, PdfHighlight>();
  for (const h of existing || []) {
    if (h?.id) map.set(h.id, h);
  }
  for (const h of incoming || []) {
    if (h?.id && !map.has(h.id)) {
      map.set(h.id, h);
    }
  }
  return sortHighlightsByReadingOrder(Array.from(map.values()));
}

export function formatHighlightsMarkdown(
  paper: Pick<ArxivPaper, 'id' | 'title' | 'authors'>,
  highlights: PdfHighlight[]
): string {
  const sorted = sortHighlightsByReadingOrder(highlights);
  const lines: string[] = [
    `# ${paper.title}`,
    `ID: ${paper.id} | Authors: ${paper.authors.join(', ')}`,
    '',
  ];
  for (const h of sorted) {
    const colorLabel = HIGHLIGHT_PALETTE[h.color]?.label || h.color;
    lines.push(`## Page ${h.page} (${colorLabel}${h.kind === 'area' ? ' region' : ''})`);
    if (h.quote.trim()) {
      lines.push(`> ${h.quote.trim().replace(/\n+/g, ' ')}`);
    }
    if (h.note.trim()) {
      lines.push(`Note: ${h.note.trim()}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim() + '\n';
}
