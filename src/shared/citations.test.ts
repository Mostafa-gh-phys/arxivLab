import test from 'node:test';
import assert from 'node:assert/strict';
import { paperToBibtex, paperToRis, paperToZoteroItem } from './citations';
import type { ArxivPaper } from './types';

const samplePaper: ArxivPaper = {
  id: '2401.12345',
  versionedId: '2401.12345v1',
  title: 'Quantum Error Correction on AdS Boundaries',
  authors: ['Alice Hopper', 'Bob Preskill'],
  abstract: 'A brief study of boundary codes.',
  primaryCategory: 'hep-th',
  categories: ['hep-th', 'quant-ph'],
  published: '2024-01-22T14:00:00Z',
  updated: '2024-01-22T14:00:00Z',
  pdfUrl: 'https://arxiv.org/pdf/2401.12345v1',
  absUrl: 'https://arxiv.org/abs/2401.12345v1',
  htmlUrl: 'https://arxiv.org/html/2401.12345v1',
};

test('paperToBibtex emits valid BibTeX with arXiv fields', () => {
  const bib = paperToBibtex(samplePaper);
  assert.match(bib, /^@article\{hopper2024_240112345,/);
  assert.match(bib, /eprint = \{2401\.12345\}/);
  assert.match(bib, /archivePrefix = \{arXiv\}/);
  assert.match(bib, /primaryClass = \{hep-th\}/);
  assert.match(bib, /author = \{Alice Hopper and Bob Preskill\}/);
});

test('paperToRis emits valid RIS tags for Zotero import', () => {
  const ris = paperToRis(samplePaper);
  assert.match(ris, /^TY  - ELEC/m);
  assert.match(ris, /^AU  - Alice Hopper/m);
  assert.match(ris, /^AN  - arXiv:2401\.12345/m);
  assert.match(ris, /^ER  - $/m);
});

test('paperToZoteroItem maps authors, collections, and arXiv metadata', () => {
  const item = paperToZoteroItem(samplePaper, ['COL123'], ['reading-list']);
  assert.equal(item.itemType, 'preprint');
  assert.equal(item.archiveID, 'arXiv:2401.12345');
  assert.deepEqual(item.collections, ['COL123']);
  assert.deepEqual(item.creators, [
    { creatorType: 'author', firstName: 'Alice', lastName: 'Hopper' },
    { creatorType: 'author', firstName: 'Bob', lastName: 'Preskill' },
  ]);
  const tags = (item.tags as Array<{ tag: string }>).map((t) => t.tag);
  assert.ok(tags.includes('hep-th'));
  assert.ok(tags.includes('reading-list'));
});
