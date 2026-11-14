import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePaperId } from './arxiv';
import {
  buildAuthorExternalUrls,
  buildInspireJobsUrl,
  buildInspireLiteratureUrl,
  doesInspireAuthorMatchName,
  mapInspireDocumentTypesToTags,
  parseInspireJobsResponse,
  parseInspireLiteratureResponse,
} from './inspire';

test('normalizePaperId handles both arXiv IDs and INSPIRE record IDs', () => {
  assert.equal(normalizePaperId('https://arxiv.org/abs/2401.12345v2'), '2401.12345');
  assert.equal(normalizePaperId('inspire:3227929'), 'inspire:3227929');
  assert.equal(
    normalizePaperId('https://inspirehep.net/literature/3227929'),
    'inspire:3227929'
  );
});

test('mapInspireDocumentTypesToTags maps INSPIRE types to library tags and infers from comments', () => {
  assert.deepEqual(mapInspireDocumentTypesToTags(['lectures', 'article', 'published']), [
    'lecture',
    'article',
  ]);
  assert.deepEqual(mapInspireDocumentTypesToTags(['thesis']), ['dissertation']);
  assert.deepEqual(mapInspireDocumentTypesToTags(['conference paper']), ['conference-paper']);
  assert.deepEqual(mapInspireDocumentTypesToTags([], 'PhD thesis, University of Oxford'), [
    'dissertation',
  ]);
  assert.deepEqual(mapInspireDocumentTypesToTags([], 'TASI 2025 Lecture notes'), ['lecture']);
});

test('buildInspireLiteratureUrl formats field clauses, doc_type, subject, citations, and year bounds', () => {
  const url = buildInspireLiteratureUrl({
    query: 'Maldacena',
    field: 'author',
    documentType: 'lectures',
    subject: 'Theory-HEP',
    yearFrom: '2015',
    yearTo: '2026',
    minCitations: 50,
    sortBy: 'mostcited',
    size: 20,
  });
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('sort'), 'mostcited');
  assert.equal(parsed.searchParams.get('size'), '20');
  assert.equal(parsed.searchParams.get('doc_type'), 'lectures');
  assert.equal(parsed.searchParams.get('subject'), 'Theory-HEP');
  const q = parsed.searchParams.get('q') || '';
  assert.match(q, /a "Maldacena"/);
  assert.match(q, /de 2015->2026/);
  assert.match(q, /cited 50->9999999/);
});

test('buildInspireJobsUrl passes status, rank, region, and category filters', () => {
  const url = buildInspireJobsUrl({
    query: 'holography',
    status: 'open',
    rank: 'POSTDOC',
    region: 'Europe',
    category: 'hep-th',
    size: 15,
  });
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('q'), 'holography');
  assert.equal(parsed.searchParams.get('status'), 'open');
  assert.equal(parsed.searchParams.get('rank'), 'POSTDOC');
  assert.equal(parsed.searchParams.get('region'), 'Europe');
  assert.equal(parsed.searchParams.get('field_of_interest'), 'hep-th');
});

test('parseInspireLiteratureResponse parses arXiv-linked and INSPIRE-only thesis entries', () => {
  const parsed = parseInspireLiteratureResponse({
    hits: {
      total: 2,
      hits: [
        {
          id: '1001',
          created: '2024-01-01T00:00:00Z',
          updated: '2024-02-01T00:00:00Z',
          metadata: {
            titles: [{ title: 'TASI Lectures on Black Holes' }],
            authors: [
              { full_name: 'Hartman, Thomas', recid: 101, affiliations: [{ value: 'Cornell' }] },
            ],
            document_type: ['lectures'],
            arxiv_eprints: [{ value: '2401.00001', categories: ['hep-th'] }],
            inspire_categories: [{ term: 'Theory-HEP' }],
            abstracts: [{ value: 'Introductory lectures.' }],
            citation_count: 85,
            earliest_date: '2024-01-02',
            texkeys: ['Hartman:2024xyz'],
          },
        },
        {
          id: '2002',
          created: '2023-06-15T00:00:00Z',
          metadata: {
            titles: [{ title: 'Non-arXiv Doctoral Thesis' }],
            authors: [{ full_name: 'Doe, Jane' }],
            document_type: ['thesis'],
            inspire_categories: [{ term: 'Phenomenology-HEP' }],
            documents: [{ url: 'https://inspirehep.net/files/thesis.pdf' }],
            earliest_date: '2023-06-15',
          },
        },
      ],
    },
  });

  assert.equal(parsed.totalResults, 2);
  assert.equal(parsed.papers.length, 2);
  assert.equal(parsed.papers[0].id, '2401.00001');
  assert.equal(parsed.papers[0].authors[0], 'Thomas Hartman');
  assert.equal(parsed.papers[0].authorDetails?.[0].inspireRecid, '101');
  assert.deepEqual(parsed.papers[0].documentTypes, ['lectures']);
  assert.equal(parsed.papers[0].citationCount, 85);

  assert.equal(parsed.papers[1].id, 'inspire:2002');
  assert.equal(parsed.papers[1].pdfUrl, 'https://inspirehep.net/files/thesis.pdf');
  assert.deepEqual(parsed.papers[1].documentTypes, ['thesis']);
});

test('parseInspireJobsResponse extracts position, institution, rank, and description', () => {
  const res = parseInspireJobsResponse({
    hits: {
      total: 1,
      hits: [
        {
          id: '3225295',
          updated: '2026-11-06T12:00:00Z',
          metadata: {
            position: 'Postdoctoral researcher',
            institutions: [{ value: 'KU Leuven' }],
            ranks: ['POSTDOC'],
            regions: ['Europe'],
            status: 'open',
            deadline_date: '2026-12-16',
            arxiv_categories: ['hep-th'],
            description: '<div>Apply now.</div><div>See details.</div>',
            urls: [{ value: 'https://academicjobsonline.org/ajo/jobs/32558' }],
            contact_details: [{ name: 'Nikolay Bobev', email: 'test@example.org' }],
          },
        },
      ],
    },
  });

  assert.equal(res.totalResults, 1);
  assert.equal(res.jobs[0].position, 'Postdoctoral researcher');
  assert.equal(res.jobs[0].institutions[0], 'KU Leuven');
  assert.equal(res.jobs[0].deadlineDate, '2026-12-16');
  assert.match(res.jobs[0].descriptionText, /Apply now\./);
});

test('doesInspireAuthorMatchName prevents fuzzy false positives on unknown names', () => {
  assert.equal(
    doesInspireAuthorMatchName('Juan M. Maldacena', {
      name: { value: 'Maldacena, Juan Martin', preferred_name: 'Juan Martin Maldacena' },
    }),
    true
  );
  assert.equal(
    doesInspireAuthorMatchName('Xyzz Nonexistent Author 9999', {
      name: { value: 'Author, Dummy' },
    }),
    false
  );
});

test('buildAuthorExternalUrls formats arXiv, INSPIRE, and Google Scholar links', () => {
  const urls = buildAuthorExternalUrls('Juan M. Maldacena', '999108');
  assert.match(urls.arxivUrl, /arxiv\.org\/search/);
  assert.equal(urls.inspireUrl, 'https://inspirehep.net/authors/999108');
  assert.match(urls.googleScholarUrl, /scholar\.google\.com/);
});
