import assert from 'node:assert/strict';
import test from 'node:test';
import { handleNativeApiRequest, type NativeStorageLike } from './nativeApiBridge';

function createMemoryStorage(): NativeStorageLike {
  const map = new Map<string, string>();
  return {
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

test('nativeApiBridge persists saved library papers, updates notes/tags, and exports BibTeX/JSON', async () => {
  const storage = createMemoryStorage();

  const saveRes = await handleNativeApiRequest(
    '/api/library',
    {
      method: 'POST',
      body: JSON.stringify({
        paper: {
          id: '2401.12345',
          versionedId: '2401.12345v1',
          title: 'Quantum Black Holes on Android',
          authors: ['Juan Maldacena'],
          abstract: 'Compact test paper.',
          primaryCategory: 'hep-th',
          categories: ['hep-th'],
          published: '2024-01-20T00:00:00Z',
          updated: '2024-01-20T00:00:00Z',
          pdfUrl: 'https://arxiv.org/pdf/2401.12345',
          absUrl: 'https://arxiv.org/abs/2401.12345',
          htmlUrl: 'https://arxiv.org/html/2401.12345',
          documentTypes: ['lectures'],
        },
      }),
    },
    { storage }
  );
  assert.ok(saveRes);
  assert.equal(saveRes.status, 200);
  const saveJson = (await saveRes.json()) as { savedPaper: { tags: string[] }; papers: unknown[] };
  assert.equal(saveJson.papers.length, 1);
  assert.deepEqual(saveJson.savedPaper.tags, ['lecture']);

  await handleNativeApiRequest(
    '/api/library/update',
    {
      method: 'PATCH',
      body: JSON.stringify({ id: '2401.12345', tags: ['lecture', 'mobile'], notes: 'Read on bus' }),
    },
    { storage }
  );

  const bibRes = await handleNativeApiRequest('/api/library/export?format=bibtex', {}, { storage });
  assert.ok(bibRes);
  const bibText = await bibRes.text();
  assert.match(bibText, /Quantum Black Holes on Android/);

  const delRes = await handleNativeApiRequest(
    '/api/library?id=2401.12345',
    { method: 'DELETE' },
    { storage }
  );
  assert.ok(delRes);
  const delJson = (await delRes.json()) as { papers: unknown[] };
  assert.equal(delJson.papers.length, 0);
});

test('nativeApiBridge parses arXiv Atom feeds via upstream fetch', async () => {
  const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
  <feed xmlns="http://www.w3.org/2005/Atom" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/" xmlns:arxiv="http://arxiv.org/schemas/atom">
    <opensearch:totalResults>1</opensearch:totalResults>
    <entry>
      <id>http://arxiv.org/abs/2501.00001v1</id>
      <updated>2025-01-01T00:00:00Z</updated>
      <published>2025-01-01T00:00:00Z</published>
      <title>Android Mobile Field Theory</title>
      <summary>Abstract test.</summary>
      <author><name>Edward Witten</name></author>
      <arxiv:primary_category term="hep-th" />
      <category term="hep-th" />
      <link title="pdf" href="http://arxiv.org/pdf/2501.00001v1" rel="related" type="application/pdf"/>
    </entry>
  </feed>`;

  const res = await handleNativeApiRequest(
    '/api/arxiv/search',
    {
      method: 'POST',
      body: JSON.stringify({ query: 'Android', field: 'all', categories: ['hep-th'] }),
    },
    {
      upstreamFetch: async () =>
        new Response(sampleXml, { status: 200, headers: { 'Content-Type': 'application/atom+xml' } }),
    }
  );
  assert.ok(res);
  assert.equal(res.status, 200);
  const data = (await res.json()) as { totalResults: number; papers: Array<{ id: string; title: string }> };
  assert.equal(data.totalResults, 1);
  assert.equal(data.papers[0].id, '2501.00001');
  assert.equal(data.papers[0].title, 'Android Mobile Field Theory');
});
