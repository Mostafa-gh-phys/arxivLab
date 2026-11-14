import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import type { ArxivPaper, ZoteroConfig } from '../shared/types';
import { pushPapersToZotero } from './zoteroClient';

const SAMPLE_PAPER: ArxivPaper = {
  id: '2401.12345',
  versionedId: '2401.12345v1',
  title: 'Holographic Complexity and Black Holes',
  authors: ['Juan M. Maldacena'],
  abstract: 'A short abstract.',
  primaryCategory: 'hep-th',
  categories: ['hep-th'],
  published: '2024-01-15T00:00:00Z',
  updated: '2024-01-15T00:00:00Z',
  pdfUrl: 'https://arxiv.org/pdf/2401.12345',
  absUrl: 'https://arxiv.org/abs/2401.12345',
  htmlUrl: 'https://arxiv.org/html/2401.12345v1',
};

test('pushPapersToZotero sends Content-Length, Zotero-Allowed-Request, and sessionID to local connector', async () => {
  let capturedHeaders: http.IncomingHttpHeaders = {};
  let capturedBody = '';

  const server = http.createServer((req, res) => {
    capturedHeaders = req.headers;
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      capturedBody = Buffer.concat(chunks).toString('utf-8');
      if (!/^[0-9]+$/.test(String(req.headers['content-length'] || ''))) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Content-length not provided\n');
        return;
      }
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };

  try {
    const cfg: ZoteroConfig = {
      mode: 'local_desktop',
      userId: '',
      apiKey: '',
      defaultCollectionKey: '',
      localEndpoint: `http://127.0.0.1:${address.port}`,
      autoSyncOnSave: false,
    };

    const result = await pushPapersToZotero([SAMPLE_PAPER], cfg);
    assert.equal(result.ok, true);
    assert.equal(result.syncedCount, 1);
    assert.match(String(capturedHeaders['content-length']), /^[0-9]+$/);
    assert.equal(capturedHeaders['transfer-encoding'], undefined);
    assert.equal(capturedHeaders['zotero-allowed-request'], 'true');

    const payload = JSON.parse(capturedBody) as {
      sessionID?: string;
      uri?: string;
      items?: Array<Record<string, unknown>>;
    };
    assert.ok(payload.sessionID);
    assert.equal(payload.uri, SAMPLE_PAPER.absUrl);
    assert.equal(payload.items?.length, 1);
    assert.equal(payload.items?.[0].id, 'arxiv:2401.12345');
    assert.equal('collections' in (payload.items?.[0] || {}), false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('pushPapersToZotero surfaces response details when local connector rejects request', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Target library not editable');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };

  try {
    const cfg: ZoteroConfig = {
      mode: 'local_desktop',
      userId: '',
      apiKey: '',
      defaultCollectionKey: '',
      localEndpoint: `http://127.0.0.1:${address.port}`,
      autoSyncOnSave: false,
    };

    const result = await pushPapersToZotero([SAMPLE_PAPER], cfg);
    assert.equal(result.ok, false);
    assert.match(result.message, /HTTP 400/);
    assert.match(result.message, /Target library not editable/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
