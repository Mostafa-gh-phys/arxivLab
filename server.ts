import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import { normalizeArxivId } from './src/shared/arxiv';
import { papersToBibtexCollection, papersToRisCollection } from './src/shared/citations';
import type {
  ArxivPaper,
  ArxivSearchField,
  ArxivSortBy,
  ArxivSortOrder,
  McpConfig,
  SavedPaper,
  ZoteroConfig,
} from './src/shared/types';
import {
  downloadPaperPdf,
  fetchPaperById,
  fetchPaperReadableContent,
  searchArxiv,
} from './src/server/arxivClient';
import { testDnsResolution } from './src/server/dnsHttp';
import { handleMcpJsonRpc, type JsonRpcRequest } from './src/server/mcpHandler';
import {
  DATA_DIR,
  deleteSavedPaper,
  readConfig,
  readLibrary,
  readMcpActivity,
  sanitizeZoteroConfigForClient,
  upsertSavedPaper,
  writeConfig,
} from './src/server/storage';
import { pushPapersToZotero, verifyZoteroConnection } from './src/server/zoteroClient';
import {
  isValidDnsServerIp,
  resolveEffectiveDnsServers,
  type NetworkConfig,
} from './src/shared/network';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

// Active SSE sessions for MCP HTTP+SSE transport
const sseSessions = new Map<string, Response>();

function extractBearerToken(req: Request): string {
  const auth = req.headers.authorization || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  const queryToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  return queryToken;
}

async function requireMcpAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const cfg = await readConfig();
  if (!cfg.mcp.requireBearerToken) {
    next();
    return;
  }
  const provided = extractBearerToken(req);
  if (!provided || provided !== cfg.mcp.bearerToken) {
    res.status(401).json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32001,
        message: 'Unauthorized: valid Bearer token required for remote MCP access.',
      },
    });
    return;
  }
  next();
}

async function startServer(): Promise<void> {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '2mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, platform: process.platform, dataDir: DATA_DIR });
  });

  // Direct arXiv.org search
  app.post('/api/arxiv/search', async (req, res) => {
    try {
      const body = req.body || {};
      const result = await searchArxiv({
        query: typeof body.query === 'string' ? body.query : '',
        field: (body.field as ArxivSearchField) || 'all',
        categories: Array.isArray(body.categories) ? body.categories.map(String) : [],
        dateFrom: typeof body.dateFrom === 'string' ? body.dateFrom : '',
        dateTo: typeof body.dateTo === 'string' ? body.dateTo : '',
        sortBy: (body.sortBy as ArxivSortBy) || 'submittedDate',
        sortOrder: (body.sortOrder as ArxivSortOrder) || 'descending',
        start: typeof body.start === 'number' ? body.start : 0,
        maxResults: typeof body.maxResults === 'number' ? body.maxResults : 15,
      });
      res.json(result);
    } catch (err: unknown) {
      res.status(502).json({
        error: `Unable to reach arxiv.org: ${(err as Error).message}`,
      });
    }
  });

  // Lookup single arXiv paper & optional HTML full-text extract
  app.get('/api/arxiv/paper', async (req, res) => {
    try {
      const rawId = typeof req.query.id === 'string' ? req.query.id : '';
      const id = normalizeArxivId(rawId);
      if (!id) {
        res.status(400).json({ error: 'arXiv ID is required.' });
        return;
      }
      const paper = await fetchPaperById(id);
      if (!paper) {
        res.status(404).json({ error: `No paper found on arXiv for "${id}".` });
        return;
      }
      const includeContent = req.query.content === '1' || req.query.content === 'true';
      if (includeContent) {
        const readable = await fetchPaperReadableContent(paper, true);
        res.json({ paper, readable });
        return;
      }
      res.json({ paper });
    } catch (err: unknown) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  // Direct PDF download & Linux disk cache
  app.get('/api/arxiv/download', async (req, res) => {
    try {
      const rawId = typeof req.query.id === 'string' ? req.query.id : '';
      const saveToDisk = req.query.save !== '0' && req.query.save !== 'false';
      const inlineView = req.query.view === '1' || req.query.view === 'true';
      const pdf = await downloadPaperPdf(rawId, saveToDisk);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', String(pdf.sizeBytes));
      res.setHeader(
        'Content-Disposition',
        `${inlineView ? 'inline' : 'attachment'}; filename="${pdf.fileName}"`
      );
      res.send(pdf.buffer);
    } catch (err: unknown) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  app.post('/api/library/download-pdf', async (req, res) => {
    try {
      const rawId = String(req.body?.id || '');
      const pdf = await downloadPaperPdf(rawId, true);
      const papers = await readLibrary();
      res.json({
        ok: true,
        paperId: pdf.paperId,
        fileName: pdf.fileName,
        sizeBytes: pdf.sizeBytes,
        papers,
      });
    } catch (err: unknown) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  // Network & Custom DNS routes
  app.get('/api/network/config', async (_req, res) => {
    const cfg = await readConfig();
    res.json({
      config: cfg.network,
      effectiveServers: resolveEffectiveDnsServers(cfg.network),
    });
  });

  app.put('/api/network/config', async (req, res) => {
    try {
      const body = (req.body || {}) as Partial<NetworkConfig>;
      const current = await readConfig();
      const customServers = Array.isArray(body.customDnsServers)
        ? body.customDnsServers.map((s) => String(s).trim()).filter(Boolean)
        : current.network.customDnsServers;

      if (body.dnsPreset === 'custom') {
        if (customServers.length === 0) {
          res.status(400).json({
            error: 'Enter at least one valid DNS server IP when Custom DNS is selected.',
          });
          return;
        }
        const bad = customServers.find((ip) => !isValidDnsServerIp(ip));
        if (bad) {
          res.status(400).json({
            error: `Invalid DNS server IP address: "${bad}".`,
          });
          return;
        }
      }

      const nextNetwork: NetworkConfig = {
        dnsPreset: body.dnsPreset || current.network.dnsPreset,
        customDnsServers: customServers,
        useCustomDnsForArxiv:
          typeof body.useCustomDnsForArxiv === 'boolean'
            ? body.useCustomDnsForArxiv
            : current.network.useCustomDnsForArxiv,
        useCustomDnsForZotero:
          typeof body.useCustomDnsForZotero === 'boolean'
            ? body.useCustomDnsForZotero
            : current.network.useCustomDnsForZotero,
      };

      await writeConfig({ ...current, network: nextNetwork });
      res.json({
        config: nextNetwork,
        effectiveServers: resolveEffectiveDnsServers(nextNetwork),
      });
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/network/test-dns', async (req, res) => {
    const current = await readConfig();
    const override = (req.body || {}) as Partial<NetworkConfig>;
    const effective: NetworkConfig = {
      ...current.network,
      ...override,
      customDnsServers: Array.isArray(override.customDnsServers)
        ? override.customDnsServers.map((s) => String(s).trim()).filter(Boolean)
        : current.network.customDnsServers,
    };
    const result = await testDnsResolution(effective);
    res.json(result);
  });

  // Desktop Packaging Info (.exe / .AppImage)
  app.get('/api/desktop/info', async (_req, res) => {
    const releaseDir = path.resolve(process.cwd(), 'release');
    let artifacts: Array<{ name: string; sizeBytes: number }> = [];
    try {
      const entries = await fs.readdir(releaseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (
          entry.isFile() &&
          /\.(AppImage|exe|dmg|deb)$/i.test(entry.name)
        ) {
          const st = await fs.stat(path.join(releaseDir, entry.name));
          artifacts.push({ name: entry.name, sizeBytes: st.size });
        }
      }
    } catch {
      // release directory may not exist until desktop build runs
    }
    res.json({
      platform: process.platform,
      arch: process.arch,
      projectDir: process.cwd(),
      targets: {
        linuxAppImage: 'arXivLab-1.0.0-x86_64.AppImage',
        windowsExeInstaller: 'arXivLab-Setup-1.0.0.exe',
        windowsExePortable: 'arXivLab-Portable-1.0.0.exe',
      },
      artifacts,
    });
  });

  app.get('/api/desktop/build-script', async (_req, res) => {
    const scriptPath = path.resolve(process.cwd(), 'scripts/build-desktop.sh');
    try {
      const content = await fs.readFile(scriptPath, 'utf-8');
      res.setHeader('Content-Type', 'text/x-shellscript; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="build-desktop.sh"');
      res.send(content);
    } catch {
      res.status(404).json({ error: 'Build script not found.' });
    }
  });

  // Saved Linux Library CRUD
  app.get('/api/library', async (_req, res) => {
    const papers = await readLibrary();
    res.json({ papers });
  });

  app.post('/api/library', async (req, res) => {
    try {
      const body = req.body || {};
      const incoming = body.paper as ArxivPaper | undefined;
      if (!incoming || !incoming.id || !incoming.title) {
        res.status(400).json({ error: 'Valid paper payload is required.' });
        return;
      }
      const existing = await readLibrary();
      const prev = existing.find((p) => p.id === incoming.id);
      const savedEntry: SavedPaper = {
        ...incoming,
        savedAt: prev?.savedAt || new Date().toISOString(),
        tags: Array.isArray(body.tags) ? body.tags.map(String) : prev?.tags || [],
        notes: typeof body.notes === 'string' ? body.notes : prev?.notes || '',
        zoteroItemKey: prev?.zoteroItemKey,
        zoteroSyncedAt: prev?.zoteroSyncedAt,
        fullTextCached: prev?.fullTextCached,
        fullTextExcerpt: prev?.fullTextExcerpt,
      };

      const cfg = await readConfig();
      let zoteroSyncMessage: string | undefined;
      if (body.syncZotero || cfg.zotero.autoSyncOnSave) {
        const zRes = await pushPapersToZotero([savedEntry], cfg.zotero);
        zoteroSyncMessage = zRes.message;
        if (zRes.ok && zRes.itemKeys[savedEntry.id]) {
          savedEntry.zoteroItemKey = zRes.itemKeys[savedEntry.id];
          savedEntry.zoteroSyncedAt = new Date().toISOString();
        }
      }

      const papers = await upsertSavedPaper(savedEntry);
      res.json({ papers, savedPaper: savedEntry, zoteroSyncMessage });
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/library/update', async (req, res) => {
    try {
      const body = req.body || {};
      const id = normalizeArxivId(String(body.id || ''));
      if (!id) {
        res.status(400).json({ error: 'Paper id is required.' });
        return;
      }
      const existing = await readLibrary();
      const target = existing.find((p) => p.id === id);
      if (!target) {
        res.status(404).json({ error: `Paper ${id} not found in saved library.` });
        return;
      }
      const updated: SavedPaper = {
        ...target,
        tags: Array.isArray(body.tags) ? body.tags.map(String) : target.tags,
        notes: typeof body.notes === 'string' ? body.notes : target.notes,
      };
      const papers = await upsertSavedPaper(updated);
      res.json({ papers, savedPaper: updated });
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/library', async (req, res) => {
    const rawId = typeof req.query.id === 'string' ? req.query.id : '';
    const id = normalizeArxivId(rawId);
    if (!id) {
      res.status(400).json({ error: 'Paper id query parameter is required.' });
      return;
    }
    const papers = await deleteSavedPaper(id);
    res.json({ papers });
  });

  app.get('/api/library/export', async (req, res) => {
    const format = req.query.format === 'ris' ? 'ris' : 'bibtex';
    const papers = await readLibrary();
    if (format === 'ris') {
      res.setHeader('Content-Type', 'application/x-research-info-systems; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="arxivlab-library.ris"');
      res.send(papersToRisCollection(papers));
      return;
    }
    res.setHeader('Content-Type', 'application/x-bibtex; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="arxivlab-library.bib"');
    res.send(papersToBibtexCollection(papers));
  });

  // Zotero integration routes
  app.get('/api/zotero/config', async (_req, res) => {
    const cfg = await readConfig();
    res.json({ config: sanitizeZoteroConfigForClient(cfg.zotero) });
  });

  app.put('/api/zotero/config', async (req, res) => {
    try {
      const body = (req.body || {}) as Partial<ZoteroConfig>;
      const current = await readConfig();

      if (body.mode === 'web_api') {
        const nextUserId = (body.userId ?? current.zotero.userId).trim();
        const nextApiKey =
          body.apiKey && !body.apiKey.includes('••••')
            ? body.apiKey.trim()
            : current.zotero.apiKey;
        if (!nextUserId || !nextApiKey) {
          res.status(400).json({
            error: 'Zotero User ID and API Key are required for Zotero Web API v3 mode.',
          });
          return;
        }
      }

      const nextZotero: ZoteroConfig = {
        mode: body.mode || current.zotero.mode,
        userId: typeof body.userId === 'string' ? body.userId.trim() : current.zotero.userId,
        apiKey:
          typeof body.apiKey === 'string' && !body.apiKey.includes('••••')
            ? body.apiKey.trim()
            : current.zotero.apiKey,
        defaultCollectionKey:
          typeof body.defaultCollectionKey === 'string'
            ? body.defaultCollectionKey.trim()
            : current.zotero.defaultCollectionKey,
        localEndpoint:
          typeof body.localEndpoint === 'string' && body.localEndpoint.trim()
            ? body.localEndpoint.trim()
            : current.zotero.localEndpoint,
        autoSyncOnSave:
          typeof body.autoSyncOnSave === 'boolean'
            ? body.autoSyncOnSave
            : current.zotero.autoSyncOnSave,
      };

      await writeConfig({ ...current, zotero: nextZotero });
      res.json({ config: sanitizeZoteroConfigForClient(nextZotero) });
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/zotero/verify', async (req, res) => {
    const current = await readConfig();
    const body = (req.body || {}) as Partial<ZoteroConfig>;
    const effective: ZoteroConfig = {
      ...current.zotero,
      ...body,
      apiKey:
        typeof body.apiKey === 'string' && body.apiKey.trim() && !body.apiKey.includes('••••')
          ? body.apiKey.trim()
          : current.zotero.apiKey,
    };
    const result = await verifyZoteroConnection(effective);
    res.status(result.ok ? 200 : 400).json(result);
  });

  app.post('/api/zotero/sync', async (req, res) => {
    try {
      const body = req.body || {};
      const current = await readConfig();
      const saved = await readLibrary();

      let targetPapers: ArxivPaper[] = [];
      if (Array.isArray(body.papers) && body.papers.length > 0) {
        targetPapers = body.papers as ArxivPaper[];
      } else if (Array.isArray(body.paperIds) && body.paperIds.length > 0) {
        const idSet = new Set(body.paperIds.map((x: unknown) => normalizeArxivId(String(x))));
        targetPapers = saved.filter((p) => idSet.has(p.id));
      } else {
        targetPapers = saved;
      }

      const collectionKey =
        typeof body.collectionKey === 'string' ? body.collectionKey : undefined;
      const syncResult = await pushPapersToZotero(targetPapers, current.zotero, collectionKey);

      if (syncResult.ok) {
        const now = new Date().toISOString();
        for (const paper of targetPapers) {
          const match = saved.find((s) => s.id === paper.id);
          if (match && syncResult.itemKeys[paper.id]) {
            await upsertSavedPaper({
              ...match,
              zoteroItemKey: syncResult.itemKeys[paper.id],
              zoteroSyncedAt: now,
            });
          }
        }
      }

      const refreshed = await readLibrary();
      res.status(syncResult.ok ? 200 : 400).json({ ...syncResult, papers: refreshed });
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // MCP configuration, activity & live tester
  app.get('/api/mcp/config', async (req, res) => {
    const current = await readConfig();
    const activity = await readMcpActivity();
    const host = req.get('host') || `localhost:${PORT}`;
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const runtimeBaseUrl = process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
      ? process.env.APP_URL
      : `${proto}://${host}`;
    res.json({
      config: current.mcp,
      activity,
      projectDir: process.cwd(),
      runtimeBaseUrl,
      dataDir: DATA_DIR,
    });
  });

  app.put('/api/mcp/config', async (req, res) => {
    const body = (req.body || {}) as Partial<McpConfig>;
    const current = await readConfig();
    const nextMcp: McpConfig = {
      transportMode: body.transportMode || current.mcp.transportMode,
      permissionMode: body.permissionMode || current.mcp.permissionMode,
      requireBearerToken:
        typeof body.requireBearerToken === 'boolean'
          ? body.requireBearerToken
          : current.mcp.requireBearerToken,
      bearerToken:
        typeof body.bearerToken === 'string' && body.bearerToken.trim()
          ? body.bearerToken.trim()
          : current.mcp.bearerToken,
      allowZoteroPushFromAgent:
        typeof body.allowZoteroPushFromAgent === 'boolean'
          ? body.allowZoteroPushFromAgent
          : current.mcp.allowZoteroPushFromAgent,
      cacheFullTextOnAgentRead:
        typeof body.cacheFullTextOnAgentRead === 'boolean'
          ? body.cacheFullTextOnAgentRead
          : current.mcp.cacheFullTextOnAgentRead,
    };
    await writeConfig({ ...current, mcp: nextMcp });
    res.json({ config: nextMcp });
  });

  app.post('/api/mcp/rotate-token', async (_req, res) => {
    const current = await readConfig();
    const nextToken = `axl_${crypto.randomBytes(18).toString('hex')}`;
    const nextMcp: McpConfig = { ...current.mcp, bearerToken: nextToken };
    await writeConfig({ ...current, mcp: nextMcp });
    res.json({ config: nextMcp });
  });

  app.post('/api/mcp/test', async (req, res) => {
    const payload = req.body as JsonRpcRequest;
    if (!payload || !payload.method) {
      res.status(400).json({ error: 'Valid JSON-RPC 2.0 request with method is required.' });
      return;
    }
    const response = await handleMcpJsonRpc(
      {
        jsonrpc: '2.0',
        id: payload.id ?? Date.now(),
        method: payload.method,
        params: payload.params || {},
      },
      'sandbox'
    );
    const activity = await readMcpActivity();
    res.json({ response, activity });
  });

  // Real MCP Streamable HTTP endpoint (for online & local HTTP agents)
  app.post('/mcp', requireMcpAuth, async (req, res) => {
    const body = req.body;
    if (Array.isArray(body)) {
      const responses = (
        await Promise.all(body.map((item) => handleMcpJsonRpc(item as JsonRpcRequest, 'http')))
      ).filter(Boolean);
      res.json(responses);
      return;
    }
    const response = await handleMcpJsonRpc(body as JsonRpcRequest, 'http');
    if (!response) {
      res.status(202).end();
      return;
    }
    res.json(response);
  });

  // Real MCP HTTP+SSE Transport (for Claude/Cursor/online SSE agents)
  app.get('/mcp/sse', requireMcpAuth, (req, res) => {
    const sessionId = crypto.randomUUID();
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    sseSessions.set(sessionId, res);
    res.write(`event: endpoint\ndata: /mcp/messages?sessionId=${sessionId}\n\n`);

    const keepAlive = setInterval(() => {
      res.write(': ping\n\n');
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseSessions.delete(sessionId);
    });
  });

  app.post('/mcp/messages', requireMcpAuth, async (req, res) => {
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : '';
    const sseRes = sseSessions.get(sessionId);
    const rpcResponse = await handleMcpJsonRpc(req.body as JsonRpcRequest, 'sse');
    if (sseRes && rpcResponse) {
      sseRes.write(`event: message\ndata: ${JSON.stringify(rpcResponse)}\n\n`);
    }
    res.status(202).json(rpcResponse ?? { accepted: true });
  });

  // Frontend middleware / static serving
  if (!isProduction) {
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: !disableHmr,
        ws: disableHmr ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = process.env.ARXIVLAB_DIST_DIR
      ? path.resolve(process.env.ARXIVLAB_DIST_DIR)
      : path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', async (_req, res) => {
      const indexHtml = await fs.readFile(path.join(distDir, 'index.html'), 'utf-8');
      res.setHeader('Content-Type', 'text/html');
      res.send(indexHtml);
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`arXivLab server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start arXivLab server:', err);
  process.exit(1);
});
