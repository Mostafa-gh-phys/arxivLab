import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  CustomCloudConfig,
  McpActivityEntry,
  McpConfig,
  SavedPaper,
  ZoteroConfig,
} from '../shared/types';
import type { NetworkConfig } from '../shared/network';

export const DATA_DIR = path.resolve(process.cwd(), '.arxiv-mcp-data');
const LIBRARY_PATH = path.join(DATA_DIR, 'library.json');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const ACTIVITY_PATH = path.join(DATA_DIR, 'mcp-activity.json');
const PAPERS_CACHE_DIR = path.join(DATA_DIR, 'papers');
const PDFS_CACHE_DIR = path.join(DATA_DIR, 'pdfs');

interface PersistedConfig {
  zotero: ZoteroConfig;
  mcp: McpConfig;
  network: NetworkConfig;
  cloud: CustomCloudConfig;
}

const SEED_PAPERS: SavedPaper[] = [
  {
    id: 'hep-th/9711200',
    versionedId: 'hep-th/9711200v3',
    title: 'The Large N Limit of Superconformal Field Theories and Supergravity',
    authors: ['Juan M. Maldacena'],
    abstract:
      'We show that the large N limit of certain conformal field theories in various dimensions include in their Hilbert space a sector describing supergravity on the product of Anti-de Sitter spacetimes, spheres and other compact manifolds. This is shown by taking some branes in the full M/string theory and taking a low energy limit where the field theory on the brane decouples from the bulk.',
    primaryCategory: 'hep-th',
    categories: ['hep-th'],
    published: '1997-11-27T00:00:00Z',
    updated: '1998-01-22T00:00:00Z',
    pdfUrl: 'https://arxiv.org/pdf/hep-th/9711200v3',
    absUrl: 'https://arxiv.org/abs/hep-th/9711200v3',
    htmlUrl: 'https://arxiv.org/html/hep-th/9711200v3',
    doi: '10.1023/A:1026654312961',
    journalRef: 'Adv. Theor. Math. Phys. 2 (1998) 231-252',
    savedAt: '2026-11-10T09:15:00Z',
    tags: ['adscft', 'holography', 'foundational'],
    notes: 'Original AdS/CFT correspondence formulation connecting N=4 SYM and Type IIB supergravity on AdS5 x S5.',
  },
  {
    id: 'quant-ph/9707021',
    versionedId: 'quant-ph/9707021v1',
    title: 'Fault-tolerant quantum computation by anyons',
    authors: ['A. Yu. Kitaev'],
    abstract:
      'A two-dimensional quantum system with anyonic excitations can be considered as a quantum computer. Unitary transformations can be performed by moving the excitations around each other. Measurements can be performed by joining excitations in pairs and observing the result of fusion.',
    primaryCategory: 'quant-ph',
    categories: ['quant-ph', 'cond-mat', 'hep-th'],
    published: '1997-07-09T00:00:00Z',
    updated: '1997-07-09T00:00:00Z',
    pdfUrl: 'https://arxiv.org/pdf/quant-ph/9707021v1',
    absUrl: 'https://arxiv.org/abs/quant-ph/9707021v1',
    htmlUrl: 'https://arxiv.org/html/quant-ph/9707021v1',
    doi: '10.1016/S0003-4916(02)00018-0',
    journalRef: 'Annals Phys. 303 (2003) 2-30',
    savedAt: '2026-11-11T14:20:00Z',
    tags: ['topological-qec', 'toric-code'],
    notes: 'Toric code construction and topological fault tolerance.',
  },
  {
    id: '1706.03762',
    versionedId: '1706.03762v7',
    title: 'Attention Is All You Need',
    authors: [
      'Ashish Vaswani',
      'Noam Shazeer',
      'Niki Parmar',
      'Jakob Uszkoreit',
      'Llion Jones',
      'Aidan N. Gomez',
      'Lukasz Kaiser',
      'Illia Polosukhin',
    ],
    abstract:
      'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks in an encoder-decoder configuration. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.',
    primaryCategory: 'cs.CL',
    categories: ['cs.CL', 'cs.LG'],
    published: '2017-06-12T17:57:34Z',
    updated: '2023-08-02T00:41:18Z',
    pdfUrl: 'https://arxiv.org/pdf/1706.03762v7',
    absUrl: 'https://arxiv.org/abs/1706.03762v7',
    htmlUrl: 'https://arxiv.org/html/1706.03762v7',
    savedAt: '2026-11-12T10:00:00Z',
    tags: ['transformers', 'architecture'],
    notes: 'Multi-head self-attention reference.',
  },
];

async function ensureDirs(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(PAPERS_CACHE_DIR, { recursive: true });
  await fs.mkdir(PDFS_CACHE_DIR, { recursive: true });
}

function defaultConfig(): PersistedConfig {
  return {
    zotero: {
      mode: 'web_api',
      userId: '',
      apiKey: '',
      defaultCollectionKey: '',
      localEndpoint: 'http://127.0.0.1:23119',
      autoSyncOnSave: false,
    },
    mcp: {
      transportMode: 'local_stdio',
      permissionMode: 'read_save',
      requireBearerToken: false,
      bearerToken: `axl_${crypto.randomBytes(18).toString('hex')}`,
      allowZoteroPushFromAgent: true,
      cacheFullTextOnAgentRead: true,
    },
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
      includeCachedPdfs: true,
    },
  };
}

export async function readLibrary(): Promise<SavedPaper[]> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(LIBRARY_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedPaper[]) : [];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      await fs.writeFile(LIBRARY_PATH, JSON.stringify(SEED_PAPERS, null, 2), 'utf-8');
      return SEED_PAPERS;
    }
    throw err;
  }
}

export async function writeLibrary(papers: SavedPaper[]): Promise<void> {
  await ensureDirs();
  await fs.writeFile(LIBRARY_PATH, JSON.stringify(papers, null, 2), 'utf-8');
}

export async function upsertSavedPaper(paper: SavedPaper): Promise<SavedPaper[]> {
  const existing = await readLibrary();
  const idx = existing.findIndex((p) => p.id === paper.id);
  const next = [...existing];
  if (idx >= 0) {
    next[idx] = { ...existing[idx], ...paper };
  } else {
    next.unshift(paper);
  }
  await writeLibrary(next);
  return next;
}

export async function deleteSavedPaper(arxivId: string): Promise<SavedPaper[]> {
  const existing = await readLibrary();
  const next = existing.filter((p) => p.id !== arxivId);
  await writeLibrary(next);
  return next;
}

export async function readConfig(): Promise<PersistedConfig> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PersistedConfig>;
    const defaults = defaultConfig();
    return {
      zotero: { ...defaults.zotero, ...(parsed.zotero || {}) },
      mcp: { ...defaults.mcp, ...(parsed.mcp || {}) },
      network: { ...defaults.network, ...(parsed.network || {}) },
      cloud: { ...defaults.cloud, ...(parsed.cloud || {}) },
    };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      const defaults = defaultConfig();
      await fs.writeFile(CONFIG_PATH, JSON.stringify(defaults, null, 2), 'utf-8');
      return defaults;
    }
    throw err;
  }
}

export async function writeConfig(config: PersistedConfig): Promise<PersistedConfig> {
  await ensureDirs();
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  return config;
}

export function sanitizeZoteroConfigForClient(cfg: ZoteroConfig): ZoteroConfig {
  return {
    ...cfg,
    apiKey: cfg.apiKey ? `${cfg.apiKey.slice(0, 4)}••••${cfg.apiKey.slice(-4)}` : '',
    hasApiKey: Boolean(cfg.apiKey),
  };
}

export function sanitizeCloudConfigForClient(cfg: CustomCloudConfig): CustomCloudConfig {
  return {
    ...cfg,
    passwordOrToken: cfg.passwordOrToken
      ? `${cfg.passwordOrToken.slice(0, 2)}••••${cfg.passwordOrToken.slice(-2)}`
      : '',
    hasSecret: Boolean(cfg.passwordOrToken),
  };
}

export async function mergeImportedLibrary(incomingPapers: SavedPaper[]): Promise<{
  papers: SavedPaper[];
  added: number;
  updated: number;
}> {
  const existing = await readLibrary();
  const byId = new Map(existing.map((p) => [p.id, p]));
  let added = 0;
  let updated = 0;

  for (const item of incomingPapers) {
    if (!item || !item.id || !item.title) continue;
    const prev = byId.get(item.id);
    if (!prev) {
      byId.set(item.id, {
        ...item,
        savedAt: item.savedAt || new Date().toISOString(),
        tags: Array.isArray(item.tags) ? item.tags : [],
        notes: typeof item.notes === 'string' ? item.notes : '',
      });
      added += 1;
    } else {
      const mergedTags = Array.from(
        new Set([...(prev.tags || []), ...(Array.isArray(item.tags) ? item.tags : [])])
      ).filter(Boolean);
      const mergedNotes = prev.notes?.trim() ? prev.notes : item.notes || '';
      byId.set(item.id, {
        ...item,
        ...prev,
        tags: mergedTags,
        notes: mergedNotes,
      });
      updated += 1;
    }
  }

  const next = Array.from(byId.values()).sort(
    (a, b) => Date.parse(b.savedAt || '') - Date.parse(a.savedAt || '')
  );
  await writeLibrary(next);
  return { papers: next, added, updated };
}

function safeCacheFileName(arxivId: string): string {
  return arxivId.replace(/[^a-zA-Z0-9._-]/g, '_') + '.txt';
}

export async function readCachedFullText(arxivId: string): Promise<string | null> {
  await ensureDirs();
  const filePath = path.join(PAPERS_CACHE_DIR, safeCacheFileName(arxivId));
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export async function writeCachedFullText(arxivId: string, content: string): Promise<string> {
  await ensureDirs();
  const filePath = path.join(PAPERS_CACHE_DIR, safeCacheFileName(arxivId));
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

export function safePdfFileName(arxivId: string): string {
  return arxivId.replace(/[^a-zA-Z0-9._-]/g, '_') + '.pdf';
}

export function getCachedPdfFilePath(arxivId: string): string {
  return path.join(PDFS_CACHE_DIR, safePdfFileName(arxivId));
}

export async function readCachedPdf(arxivId: string): Promise<Buffer | null> {
  await ensureDirs();
  const filePath = getCachedPdfFilePath(arxivId);
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

export async function writeCachedPdf(arxivId: string, buffer: Buffer): Promise<{
  filePath: string;
  sizeBytes: number;
}> {
  await ensureDirs();
  const filePath = getCachedPdfFilePath(arxivId);
  await fs.writeFile(filePath, buffer);
  return { filePath, sizeBytes: buffer.byteLength };
}

export async function readMcpActivity(): Promise<McpActivityEntry[]> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(ACTIVITY_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as McpActivityEntry[]) : [];
  } catch {
    return [];
  }
}

export async function appendMcpActivity(entry: McpActivityEntry): Promise<McpActivityEntry[]> {
  const list = await readMcpActivity();
  const next = [entry, ...list].slice(0, 40);
  await ensureDirs();
  await fs.writeFile(ACTIVITY_PATH, JSON.stringify(next, null, 2), 'utf-8');
  return next;
}
