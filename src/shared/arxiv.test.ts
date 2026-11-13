import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildArxivQueryUrl,
  computeDateRangeFromPreset,
  normalizeArxivId,
  parseArxivAtomFeed,
} from './arxiv';

test('normalizeArxivId handles URLs, prefixes, and versions', () => {
  assert.equal(normalizeArxivId('https://arxiv.org/abs/2401.12345v2'), '2401.12345');
  assert.equal(normalizeArxivId('https://arxiv.org/pdf/hep-th/9711200v1.pdf'), 'hep-th/9711200');
  assert.equal(normalizeArxivId('arXiv:2305.00112v3'), '2305.00112');
  assert.equal(normalizeArxivId('hep-th/9711200'), 'hep-th/9711200');
});

test('buildArxivQueryUrl constructs keyword, category, and date bounds', () => {
  const urlStr = buildArxivQueryUrl({
    query: 'holographic entropy',
    field: 'abs',
    categories: ['hep-th', 'gr-qc'],
    dateFrom: '2025-01-01',
    dateTo: '2025-12-31',
    sortBy: 'submittedDate',
    sortOrder: 'descending',
    maxResults: 20,
  });

  const url = new URL(urlStr);
  const sq = url.searchParams.get('search_query') || '';
  assert.match(sq, /\(abs:holographic AND abs:entropy\)/);
  assert.match(sq, /\(cat:hep-th OR cat:gr-qc\)/);
  assert.match(sq, /submittedDate:\[202501010000 TO 202512312359\]/);
  assert.equal(url.searchParams.get('max_results'), '20');
  assert.equal(url.searchParams.get('sortBy'), 'submittedDate');
});

test('buildArxivQueryUrl uses id_list when given a direct arXiv ID', () => {
  const urlStr = buildArxivQueryUrl({
    query: 'https://arxiv.org/abs/hep-th/9711200v3',
    field: 'all',
  });
  const url = new URL(urlStr);
  assert.equal(url.searchParams.get('id_list'), 'hep-th/9711200');
});

test('computeDateRangeFromPreset returns deterministic ranges', () => {
  const ref = new Date('2026-11-13T12:00:00Z');
  assert.deepEqual(computeDateRangeFromPreset('7d', ref), {
    dateFrom: '2026-11-06',
    dateTo: '2026-11-13',
  });
  assert.deepEqual(computeDateRangeFromPreset('1y', ref), {
    dateFrom: '2025-11-13',
    dateTo: '2026-11-13',
  });
  assert.deepEqual(computeDateRangeFromPreset('any', ref), {
    dateFrom: '',
    dateTo: '',
  });
});

test('parseArxivAtomFeed extracts papers, authors, categories, and links', () => {
  const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
  <feed xmlns="http://www.w3.org/2005/Atom"
        xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/"
        xmlns:arxiv="http://arxiv.org/schemas/atom">
    <opensearch:totalResults>42</opensearch:totalResults>
    <opensearch:startIndex>0</opensearch:startIndex>
    <opensearch:itemsPerPage>1</opensearch:itemsPerPage>
    <entry>
      <id>http://arxiv.org/abs/hep-th/9711200v3</id>
      <updated>1998-01-22T00:00:00Z</updated>
      <published>1997-11-27T00:00:00Z</published>
      <title>The Large N Limit of Superconformal Field Theories and Supergravity</title>
      <summary>We show that the large N limit of certain conformal field theories can be described in terms of supergravity.</summary>
      <author><name>Juan M. Maldacena</name></author>
      <arxiv:doi>10.1023/A:1026654312961</arxiv:doi>
      <arxiv:journal_ref>Adv.Theor.Math.Phys.2:231-252,1998</arxiv:journal_ref>
      <arxiv:primary_category term="hep-th" />
      <category term="hep-th" />
      <category term="gr-qc" />
      <link href="http://arxiv.org/abs/hep-th/9711200v3" rel="alternate" type="text/html"/>
      <link title="pdf" href="http://arxiv.org/pdf/hep-th/9711200v3" rel="related" type="application/pdf"/>
    </entry>
  </feed>`;

  const res = parseArxivAtomFeed(sampleXml);
  assert.equal(res.totalResults, 42);
  assert.equal(res.papers.length, 1);
  const p = res.papers[0];
  assert.equal(p.id, 'hep-th/9711200');
  assert.equal(p.versionedId, 'hep-th/9711200v3');
  assert.deepEqual(p.authors, ['Juan M. Maldacena']);
  assert.equal(p.primaryCategory, 'hep-th');
  assert.deepEqual(p.categories, ['hep-th', 'gr-qc']);
  assert.equal(p.pdfUrl, 'https://arxiv.org/pdf/hep-th/9711200v3');
  assert.equal(p.doi, '10.1023/A:1026654312961');
});
