import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatHighlightsMarkdown,
  mergeHighlights,
  normalizeClientRects,
  normalizeDragBox,
  removeHighlight,
  updateHighlight,
  upsertHighlight,
} from './highlights';
import type { PdfHighlight } from './types';

test('normalizeClientRects normalizes coordinates and coalesces adjacent same-line boxes', () => {
  const pageBox = { left: 100, top: 200, width: 500, height: 800 };
  const rects = normalizeClientRects(
    [
      { left: 150, top: 280, width: 100, height: 16 },
      { left: 252, top: 280, width: 80, height: 16 }, // same line within gap threshold
      { left: 150, top: 320, width: 120, height: 16 }, // second line
      { left: 160, top: 320, width: 1, height: 16 }, // sub-2px noise filtered
    ],
    pageBox
  );

  assert.equal(rects.length, 2);
  assert.deepEqual(rects[0], { x: 0.1, y: 0.1, width: 0.364, height: 0.02 });
  assert.deepEqual(rects[1], { x: 0.1, y: 0.15, width: 0.24, height: 0.02 });
});

test('normalizeDragBox rejects accidental tiny clicks and normalizes drawn areas', () => {
  const pageBox = { left: 0, top: 0, width: 1000, height: 1000 };
  assert.equal(normalizeDragBox({ x: 10, y: 10 }, { x: 14, y: 12 }, pageBox), null);

  const box = normalizeDragBox({ x: 400, y: 300 }, { x: 200, y: 150 }, pageBox);
  assert.deepEqual(box, { x: 0.2, y: 0.15, width: 0.2, height: 0.15 });
});

test('upsertHighlight, updateHighlight, removeHighlight, and mergeHighlights maintain reading order', () => {
  const h2: PdfHighlight = {
    id: 'h2',
    page: 3,
    color: 'sky',
    kind: 'text',
    rects: [{ x: 0.1, y: 0.2, width: 0.5, height: 0.02 }],
    quote: 'Equation (12)',
    note: '',
    createdAt: '2026-11-21T10:00:00Z',
  };
  const h1: PdfHighlight = {
    id: 'h1',
    page: 1,
    color: 'amber',
    kind: 'area',
    rects: [{ x: 0.2, y: 0.4, width: 0.6, height: 0.1 }],
    quote: '[Highlighted region]',
    note: 'Check bound',
    createdAt: '2026-11-21T10:01:00Z',
  };

  let list = upsertHighlight([], h2);
  list = upsertHighlight(list, h1);
  assert.deepEqual(
    list.map((h) => h.id),
    ['h1', 'h2']
  );

  list = updateHighlight(list, 'h2', { note: 'Verified', color: 'emerald' });
  assert.equal(list[1].note, 'Verified');
  assert.equal(list[1].color, 'emerald');

  const merged = mergeHighlights(list, [
    { ...h2, note: 'Duplicate id should keep existing' },
    {
      id: 'h3',
      page: 2,
      color: 'rose',
      kind: 'text',
      rects: [{ x: 0.1, y: 0.5, width: 0.4, height: 0.02 }],
      quote: 'Conjecture',
      note: '',
      createdAt: '2026-11-21T10:02:00Z',
    },
  ]);
  assert.deepEqual(
    merged.map((h) => h.id),
    ['h1', 'h3', 'h2']
  );

  const afterRemove = removeHighlight(merged, 'h3');
  assert.deepEqual(
    afterRemove.map((h) => h.id),
    ['h1', 'h2']
  );
});

test('formatHighlightsMarkdown exports clean structured notes grouped by page', () => {
  const md = formatHighlightsMarkdown(
    { id: '2401.12345', title: 'Test Paper', authors: ['Ada Lovelace'] },
    [
      {
        id: 'h1',
        page: 2,
        color: 'amber',
        kind: 'text',
        rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.02 }],
        quote: 'The partition function factorizes.',
        note: 'Key lemma',
        createdAt: '2026-11-21T10:00:00Z',
      },
    ]
  );

  assert.match(md, /# Test Paper/);
  assert.match(md, /## Page 2 \(Yellow\)/);
  assert.match(md, /> The partition function factorizes\./);
  assert.match(md, /Note: Key lemma/);
});
