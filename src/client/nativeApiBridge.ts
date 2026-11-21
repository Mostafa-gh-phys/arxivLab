import { Capacitor } from '@capacitor/core';
import {
  buildArxivAuthorSearchClause,
  buildArxivQueryUrl,
  normalizePaperId,
  parseArxivAtomFeed,
} from '../shared/arxiv';
import { buildArxivBrowseUrl, parseArxivBrowseHtml } from '../shared/arxivBrowse';
import {
  papersToBibtexCollection,
  papersToRisCollection,
  paperToZoteroItem,
} from '../shared/citations';
import {
  buildAuthorExternalUrls,
  buildInspireJobsUrl,
  buildInspireLiteratureUrl,
  doesInspireAuthorMatchName,
  mapInspireDocumentTypesToTags,
  parseInspireJobsResponse,
  parseInspireLiteratureResponse,
} from '../shared/inspire';
import { mergeHighlights } from '../shared/highlights';
import type { NetworkConfig } from '../shared/network';
import type {
  ArxivBrowseParams,
  ArxivPaper,
  ArxivSearchParams,
  AuthorResolution,
  CustomCloudConfig,
  InspireJobsParams,
  InspireLiteratureParams,
  McpConfig,
  PdfHighlight,
  SavedPaper,
  ZoteroConfig,
} from '../shared/types';

export interface NativeStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const LIBRARY_STORAGE_KEY = 'arxivlab_native_library_v1';
const CONFIG_STORAGE_KEY = 'arxivlab_native_config_v1';

interface NativeStoreState {
  network: NetworkConfig;
  cloud: CustomCloudConfig;
  zotero: ZoteroConfig;
  mcp: McpConfig;
}

function createDefaultStoreState(): NativeStoreState {
  return {
    network: {
      dnsPreset: 'system',
      customDnsServers: [],
      useCustomDnsForArxiv: true,
      useCustomDnsForZotero: true,
    },
    cloud: {
      provider: 'webdav',
      endpointUrl: '',
      remotePath: '/arXivLab',
      username: '',
      passwordOrToken: '',
      includeCachedPdfs: false,
      hasSecret: false,
    },
    zotero: {
      mode: 'web_api',
      userId: '',
      apiKey: '',
      hasApiKey: false,
      defaultCollectionKey: '',
      localEndpoint: 'http://127.0.0.1:23119',
      autoSyncOnSave: false,
    },
    mcp: {
      transportMode: 'online_http',
      permissionMode: 'read_save',
      requireBearerToken: true,
      bearerToken: '',
      allowZoteroPushFromAgent: false,
      cacheFullTextOnAgentRead: false,
    },
  };
}

function getStorage(customStorage?: NativeStorageLike): NativeStorageLike | null {
  if (customStorage) return customStorage;
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
    return globalThis.localStorage;
  }
  return null;
}

export function readNativeLibrary(storage?: NativeStorageLike): SavedPaper[] {
  const store = getStorage(storage);
  if (!store) return [];
  try {
    const raw = store.getItem(LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedPaper[]) : [];
  } catch {
    return [];
  }
}

export function writeNativeLibrary(papers: SavedPaper[], storage?: NativeStorageLike): SavedPaper[] {
  const store = getStorage(storage);
  if (store) {
    store.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(papers));
  }
  return papers;
}

function readNativeConfig(storage?: NativeStorageLike): NativeStoreState {
  const store = getStorage(storage);
  const defaults = createDefaultStoreState();
  if (!store) return defaults;
  try {
    const raw = store.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<NativeStoreState>;
    return {
      network: { ...defaults.network, ...(parsed.network || {}) },
      cloud: { ...defaults.cloud, ...(parsed.cloud || {}) },
      zotero: { ...defaults.zotero, ...(parsed.zotero || {}) },
      mcp: { ...defaults.mcp, ...(parsed.mcp || {}) },
    };
  } catch {
    return defaults;
  }
}

function writeNativeConfig(next: NativeStoreState, storage?: NativeStorageLike): NativeStoreState {
  const store = getStorage(storage);
  if (store) {
    store.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function textResponse(body: string, contentType: string, fileName?: string): Response {
  const headers: Record<string, string> = { 'Content-Type': contentType };
  if (fileName) {
    headers['Content-Disposition'] = `attachment; filename="${fileName}"`;
  }
  return new Response(body, { status: 200, headers });
}

function mergePapersIntoLibrary(
  existing: SavedPaper[],
  incoming: Array<Partial<SavedPaper> & Pick<ArxivPaper, 'id' | 'title'>>
): { papers: SavedPaper[]; added: number; updated: number } {
  const byId = new Map<string, SavedPaper>();
  for (const p of existing) {
    byId.set(p.id, p);
  }
  let added = 0;
  let updated = 0;
  for (const item of incoming) {
    const normId = normalizePaperId(item.id) || item.id;
    const prev = byId.get(normId);
    const mergedTags = Array.from(
      new Set([
        ...(prev?.tags || []),
        ...(item.tags || []),
        ...mapInspireDocumentTypesToTags(item.documentTypes, item.comment),
      ])
    ).filter(Boolean);

    if (prev) {
      byId.set(normId, {
        ...prev,
        ...item,
        id: normId,
        tags: mergedTags,
        notes: item.notes ?? prev.notes ?? '',
        highlights: item.highlights
          ? mergeHighlights(prev.highlights, item.highlights)
          : prev.highlights || [],
        savedAt: prev.savedAt,
      } as SavedPaper);
      updated++;
    } else {
      byId.set(normId, {
        versionedId: item.versionedId || normId,
        authors: item.authors || [],
        abstract: item.abstract || '',
        primaryCategory: item.primaryCategory || 'hep-th',
        categories: item.categories || ['hep-th'],
        published: item.published || new Date().toISOString(),
        updated: item.updated || new Date().toISOString(),
        pdfUrl: item.pdfUrl || `https://arxiv.org/pdf/${normId}`,
        absUrl: item.absUrl || `https://arxiv.org/abs/${normId}`,
        htmlUrl: item.htmlUrl || `https://arxiv.org/html/${normId}`,
        ...item,
        id: normId,
        savedAt: item.savedAt || new Date().toISOString(),
        tags: mergedTags,
        notes: item.notes || '',
        highlights: Array.isArray(item.highlights) ? item.highlights : [],
      });
      added++;
    }
  }
  const papers = Array.from(byId.values()).sort((a, b) =>
    (b.savedAt || '').localeCompare(a.savedAt || '')
  );
  return { papers, added, updated };
}

export async function handleNativeApiRequest(
  rawUrl: string,
  init: RequestInit = {},
  deps: {
    upstreamFetch?: typeof fetch;
    storage?: NativeStorageLike;
  } = {}
): Promise<Response | null> {
  const url = new URL(rawUrl, 'https://arxivlab.local');
  const pathname = url.pathname;
  if (!pathname.startsWith('/api/')) {
    return null;
  }

  const method = (init.method || 'GET').toUpperCase();
  const upstreamFetch = deps.upstreamFetch || globalThis.fetch.bind(globalThis);
  const storage = deps.storage;

  let bodyJson: Record<string, unknown> = {};
  if (typeof init.body === 'string' && init.body.trim()) {
    try {
      bodyJson = JSON.parse(init.body) as Record<string, unknown>;
    } catch {
      bodyJson = {};
    }
  }

  // 1. Health
  if (pathname === '/api/health') {
    return jsonResponse({ ok: true, mode: 'android-native', version: '2.0.0' });
  }

  // 2. arXiv Search
  if (pathname === '/api/arxiv/search' && method === 'POST') {
    const params = bodyJson as unknown as ArxivSearchParams;
    const queryUrl = buildArxivQueryUrl(params);
    const res = await upstreamFetch(queryUrl, { headers: { Accept: 'application/atom+xml' } });
    if (!res.ok) {
      return jsonResponse({ error: `arXiv API returned HTTP ${res.status}` }, res.status);
    }
    const xml = await res.text();
    return jsonResponse(parseArxivAtomFeed(xml, queryUrl));
  }

  // 3. arXiv Browse
  if (pathname === '/api/arxiv/browse' && method === 'POST') {
    const params = bodyJson as unknown as ArxivBrowseParams;
    const show = params.mode === 'new' ? 200 : Math.min(200, Math.max(40, (params.maxResults || 25) * 2));
    const queryUrl = buildArxivBrowseUrl(params.category, params.mode, show);
    const res = await upstreamFetch(queryUrl, { headers: { Accept: 'text/html' } });
    if (!res.ok) {
      return jsonResponse({ error: `arXiv listing returned HTTP ${res.status}` }, res.status);
    }
    const html = await res.text();
    const parsed = parseArxivBrowseHtml(html, {
      category: params.category,
      mode: params.mode,
      queryUrl,
    });
    let filtered = parsed.papers;
    if (params.mode === 'new' && params.section && params.section !== 'all') {
      filtered = filtered.filter((p) => p.listingSection === params.section);
    }
    if (params.filterText?.trim()) {
      const needle = params.filterText.trim().toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.title.toLowerCase().includes(needle) ||
          p.authors.some((a) => a.toLowerCase().includes(needle)) ||
          p.abstract.toLowerCase().includes(needle) ||
          p.id.toLowerCase().includes(needle)
      );
    }
    const limit = Math.min(100, Math.max(1, params.maxResults ?? 25));
    return jsonResponse({
      ...parsed,
      papers: filtered.slice(0, limit),
      totalResults: filtered.length,
    });
  }

  // 4. INSPIRE Literature & Jobs
  if (pathname === '/api/inspire/literature' && method === 'POST') {
    const queryUrl = buildInspireLiteratureUrl(bodyJson as unknown as InspireLiteratureParams);
    const res = await upstreamFetch(queryUrl, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      return jsonResponse({ error: `INSPIRE-HEP returned HTTP ${res.status}` }, res.status);
    }
    const json = (await res.json()) as Record<string, unknown>;
    return jsonResponse(parseInspireLiteratureResponse(json, queryUrl));
  }

  if (pathname === '/api/inspire/jobs' && method === 'POST') {
    const queryUrl = buildInspireJobsUrl(bodyJson as unknown as InspireJobsParams);
    const res = await upstreamFetch(queryUrl, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      return jsonResponse({ error: `INSPIRE-HEP Jobs returned HTTP ${res.status}` }, res.status);
    }
    const json = (await res.json()) as Record<string, unknown>;
    return jsonResponse(parseInspireJobsResponse(json, queryUrl));
  }

  // 5. Author Resolution
  if (pathname === '/api/author/resolve' && method === 'GET') {
    const name = (url.searchParams.get('name') || '').trim();
    const recidParam = (url.searchParams.get('recid') || '').trim() || undefined;
    const baseUrls = buildAuthorExternalUrls(name, recidParam);

    let inspireUrl: string | null = null;
    let inspireRecid = recidParam;
    let inspireAffiliation: string | undefined;
    let inspireOrcid: string | undefined;
    let arxivPaperCount = 0;

    await Promise.all([
      (async () => {
        try {
          const target = inspireRecid
            ? `https://inspirehep.net/api/authors/${encodeURIComponent(inspireRecid)}`
            : `https://inspirehep.net/api/authors?q=${encodeURIComponent(name)}&size=5`;
          const res = await upstreamFetch(target, { headers: { Accept: 'application/json' } });
          if (!res.ok) return;
          const json = (await res.json()) as Record<string, unknown>;
          const hit = inspireRecid
            ? (json as { id?: string; metadata?: Record<string, unknown> })
            : ((json.hits as { hits?: Array<{ id?: string; metadata?: Record<string, unknown> }> })?.hits || []).find(
                (c) => doesInspireAuthorMatchName(name, c.metadata || {})
              );
          if (hit?.id) {
            inspireRecid = String(hit.id);
            inspireUrl = `https://inspirehep.net/authors/${inspireRecid}`;
            const meta = hit.metadata || {};
            const positions = Array.isArray(meta.positions)
              ? (meta.positions as Array<{ institution?: string; current?: boolean }>)
              : [];
            inspireAffiliation = (positions.find((p) => p.current) || positions[0])?.institution;
            const ids = Array.isArray(meta.ids)
              ? (meta.ids as Array<{ schema?: string; value?: string }>)
              : [];
            inspireOrcid = ids.find((i) => i.schema === 'ORCID')?.value;
          }
        } catch {
          // Non-fatal
        }
      })(),
      (async () => {
        try {
          const clause = buildArxivAuthorSearchClause(name);
          if (!clause) return;
          const res = await upstreamFetch(
            `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(clause)}&max_results=3`
          );
          if (!res.ok) return;
          const parsed = parseArxivAtomFeed(await res.text());
          arxivPaperCount = parsed.totalResults || parsed.papers.length;
        } catch {
          // Non-fatal
        }
      })(),
    ]);

    const resolution: AuthorResolution = {
      name,
      arxivUrl: baseUrls.arxivUrl,
      arxivPaperCount,
      arxivSamplePapers: [],
      inspireUrl,
      inspireRecid,
      inspireAffiliation,
      inspireOrcid,
      googleScholarUrl: baseUrls.googleScholarUrl,
      hasDirectPage: Boolean(inspireUrl || arxivPaperCount > 0),
    };
    return jsonResponse(resolution);
  }

  // 6. Paper metadata / fulltext by ID
  if (pathname === '/api/arxiv/paper' && method === 'GET') {
    const id = normalizePaperId(url.searchParams.get('id') || '');
    if (!id) return jsonResponse({ error: 'Missing paper id' }, 400);
    const saved = readNativeLibrary(storage).find((p) => p.id === id);
    let paper: ArxivPaper | undefined = saved;

    if (!paper) {
      if (id.startsWith('inspire:')) {
        const recid = id.replace(/^inspire:/, '');
        const res = await upstreamFetch(`https://inspirehep.net/api/literature/${encodeURIComponent(recid)}`);
        if (res.ok) {
          const item = (await res.json()) as Record<string, unknown>;
          const parsed = parseInspireLiteratureResponse({ hits: { total: 1, hits: [item] } });
          paper = parsed.papers[0];
        }
      } else {
        const res = await upstreamFetch(
          `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`
        );
        if (res.ok) {
          paper = parseArxivAtomFeed(await res.text()).papers[0];
        }
      }
    }

    if (!paper) return jsonResponse({ error: `Paper ${id} not found.` }, 404);
    return jsonResponse({
      paper,
      readable: {
        source: 'abstract-only',
        text: `${paper.title}\n\nAuthors: ${paper.authors.join(', ')}\n\nAbstract\n${paper.abstract}`,
      },
    });
  }

  // 7. Library CRUD
  if (pathname === '/api/library' && method === 'GET') {
    return jsonResponse({ papers: readNativeLibrary(storage) });
  }

  if (pathname === '/api/library' && method === 'POST') {
    const rawPaper = (bodyJson.paper || bodyJson) as Partial<SavedPaper> & Pick<ArxivPaper, 'id' | 'title'>;
    if (!rawPaper?.id) return jsonResponse({ error: 'Invalid paper payload.' }, 400);
    const incomingHighlights = Array.isArray(bodyJson.highlights)
      ? (bodyJson.highlights as PdfHighlight[])
      : rawPaper.highlights;
    const current = readNativeLibrary(storage);
    const { papers } = mergePapersIntoLibrary(current, [
      {
        ...rawPaper,
        highlights: incomingHighlights,
      },
    ]);
    writeNativeLibrary(papers, storage);
    const savedPaper = papers.find((p) => p.id === (normalizePaperId(rawPaper.id) || rawPaper.id));
    return jsonResponse({ ok: true, savedPaper, papers });
  }

  if (pathname === '/api/library/update' && method === 'PATCH') {
    const id = String(bodyJson.id || '');
    const tags = Array.isArray(bodyJson.tags) ? (bodyJson.tags as string[]) : undefined;
    const notes = typeof bodyJson.notes === 'string' ? bodyJson.notes : undefined;
    const highlights = Array.isArray(bodyJson.highlights)
      ? (bodyJson.highlights as PdfHighlight[])
      : undefined;
    const next = readNativeLibrary(storage).map((p) =>
      p.id === id
        ? {
            ...p,
            tags: tags ?? p.tags,
            notes: notes ?? p.notes,
            highlights: highlights ?? p.highlights ?? [],
          }
        : p
    );
    writeNativeLibrary(next, storage);
    return jsonResponse({ ok: true, papers: next });
  }

  if (pathname === '/api/library' && method === 'DELETE') {
    const id = url.searchParams.get('id') || '';
    const next = readNativeLibrary(storage).filter((p) => p.id !== id);
    writeNativeLibrary(next, storage);
    return jsonResponse({ ok: true, papers: next });
  }

  if (pathname === '/api/library/import' && method === 'POST') {
    const incoming = Array.isArray(bodyJson.papers)
      ? (bodyJson.papers as Array<Partial<SavedPaper> & Pick<ArxivPaper, 'id' | 'title'>>)
      : [];
    const current = readNativeLibrary(storage);
    const merged = mergePapersIntoLibrary(current, incoming);
    writeNativeLibrary(merged.papers, storage);
    return jsonResponse({ ok: true, ...merged });
  }

  if (pathname === '/api/library/export' && method === 'GET') {
    const format = url.searchParams.get('format') || 'bibtex';
    const papers = readNativeLibrary(storage);
    if (format === 'json') {
      return textResponse(
        JSON.stringify({ version: '2.0.0', exportedAt: new Date().toISOString(), papers }, null, 2),
        'application/json',
        'arxivlab-library.json'
      );
    }
    if (format === 'ris') {
      return textResponse(papersToRisCollection(papers), 'application/x-research-info-systems', 'arxivlab.ris');
    }
    return textResponse(papersToBibtexCollection(papers), 'application/x-bibtex', 'arxivlab.bib');
  }

  // 8. Cloud / Network / Zotero Config & Direct Zotero Web API Sync
  if (pathname === '/api/network/config') {
    const cfg = readNativeConfig(storage);
    if (method === 'PUT') {
      cfg.network = { ...cfg.network, ...(bodyJson as Partial<NetworkConfig>) };
      writeNativeConfig(cfg, storage);
    }
    return jsonResponse({ config: cfg.network });
  }

  if (pathname === '/api/cloud/config') {
    const cfg = readNativeConfig(storage);
    if (method === 'PUT') {
      const incoming = bodyJson as Partial<CustomCloudConfig>;
      cfg.cloud = {
        ...cfg.cloud,
        ...incoming,
        passwordOrToken:
          incoming.passwordOrToken === '********' ? cfg.cloud.passwordOrToken : incoming.passwordOrToken ?? cfg.cloud.passwordOrToken,
        hasSecret: Boolean(
          incoming.passwordOrToken && incoming.passwordOrToken !== '********'
            ? incoming.passwordOrToken
            : cfg.cloud.passwordOrToken
        ),
      };
      writeNativeConfig(cfg, storage);
    }
    return jsonResponse({
      config: {
        ...cfg.cloud,
        passwordOrToken: cfg.cloud.passwordOrToken ? '********' : '',
        hasSecret: Boolean(cfg.cloud.passwordOrToken),
      },
    });
  }

  if (pathname === '/api/zotero/config') {
    const cfg = readNativeConfig(storage);
    if (method === 'PUT') {
      const incoming = bodyJson as Partial<ZoteroConfig>;
      cfg.zotero = {
        ...cfg.zotero,
        ...incoming,
        apiKey:
          incoming.apiKey === '********' ? cfg.zotero.apiKey : incoming.apiKey ?? cfg.zotero.apiKey,
        hasApiKey: Boolean(
          incoming.apiKey && incoming.apiKey !== '********' ? incoming.apiKey : cfg.zotero.apiKey
        ),
      };
      writeNativeConfig(cfg, storage);
    }
    return jsonResponse({
      config: {
        ...cfg.zotero,
        apiKey: cfg.zotero.apiKey ? '********' : '',
        hasApiKey: Boolean(cfg.zotero.apiKey),
      },
    });
  }

  if (pathname === '/api/zotero/sync' && method === 'POST') {
    const cfg = readNativeConfig(storage).zotero;
    const papers = (Array.isArray(bodyJson.papers) ? bodyJson.papers : []) as ArxivPaper[];
    if (cfg.mode !== 'web_api' || !cfg.userId || !cfg.apiKey) {
      return jsonResponse(
        {
          ok: false,
          message: 'On Android, configure Zotero Web API v3 (User ID + API Key) in the Zotero tab.',
        },
        400
      );
    }
    const items = papers.map((p) =>
      paperToZoteroItem(p, cfg.defaultCollectionKey ? [cfg.defaultCollectionKey] : [])
    );
    const zRes = await upstreamFetch(`https://api.zotero.org/users/${encodeURIComponent(cfg.userId)}/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Zotero-API-Version': '3',
        'Zotero-API-Key': cfg.apiKey,
      },
      body: JSON.stringify(items),
    });
    if (!zRes.ok) {
      const errText = await zRes.text();
      return jsonResponse({ ok: false, message: `Zotero Web API HTTP ${zRes.status}: ${errText}` }, 400);
    }
    return jsonResponse({
      ok: true,
      message: `Synced ${papers.length} paper(s) to Zotero Cloud.`,
      papers: readNativeLibrary(storage),
    });
  }

  if (pathname === '/api/desktop/info') {
    return jsonResponse({
      version: '2.0.0',
      targets: {
        linuxAppImage: 'arXivLab-2.0.0-x86_64.AppImage',
        windowsExeInstaller: 'arXivLab-Setup-2.0.0.exe',
        windowsExePortable: 'arXivLab-Portable-2.0.0.exe',
        macOsDmgArm64: 'arXivLab-2.0.0-mac-arm64.dmg',
        macOsDmgX64: 'arXivLab-2.0.0-mac-x64.dmg',
        androidApk: 'arXivLab-2.0.0-android.apk',
        androidAab: 'arXivLab-2.0.0-playstore.aab',
      },
      artifacts: [],
    });
  }

  if (pathname === '/api/mcp/config') {
    const cfg = readNativeConfig(storage).mcp;
    return jsonResponse({
      config: cfg,
      activity: [],
      endpoints: { http: 'Desktop/Server only', sse: 'Desktop/Server only', health: 'Native Android' },
      clientConfigs: {},
    });
  }

  return jsonResponse({ error: `Endpoint ${pathname} requires desktop or server runtime.` }, 501);
}

let bridgeInstalled = false;

export function installNativeApiBridgeIfNeeded(): void {
  if (bridgeInstalled) return;
  if (!Capacitor.isNativePlatform()) return;
  bridgeInstalled = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.startsWith('/api/')) {
      const handled = await handleNativeApiRequest(urlStr, init, { upstreamFetch: originalFetch });
      if (handled) return handled;
    }
    return originalFetch(input, init);
  };
}
