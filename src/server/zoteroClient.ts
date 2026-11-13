import { paperToZoteroItem } from '../shared/citations';
import type { ArxivPaper, ZoteroCollection, ZoteroConfig } from '../shared/types';
import { dnsAwareRequest, getDnsServersForTarget } from './dnsHttp';
import { readConfig } from './storage';

export interface ZoteroVerifyResult {
  ok: boolean;
  mode: ZoteroConfig['mode'];
  message: string;
  collections: ZoteroCollection[];
}

export interface ZoteroSyncResult {
  ok: boolean;
  syncedCount: number;
  failedCount: number;
  itemKeys: Record<string, string>;
  message: string;
}

export async function verifyZoteroConnection(config: ZoteroConfig): Promise<ZoteroVerifyResult> {
  if (config.mode === 'local_desktop') {
    const base = (config.localEndpoint || 'http://127.0.0.1:23119').replace(/\/$/, '');
    try {
      const res = await dnsAwareRequest(`${base}/connector/ping`, {
        method: 'GET',
        timeoutMs: 5000,
      });
      if (res.status >= 200 && res.status < 300) {
        return {
          ok: true,
          mode: 'local_desktop',
          message: `Connected to local Zotero Desktop at ${base}.`,
          collections: [],
        };
      }
      return {
        ok: false,
        mode: 'local_desktop',
        message: `Local Zotero responded with HTTP ${res.status}. Ensure Zotero desktop is open.`,
        collections: [],
      };
    } catch (err: unknown) {
      return {
        ok: false,
        mode: 'local_desktop',
        message: `Could not reach local Zotero at ${base} (${(err as Error).message}). Start Zotero desktop or switch to Web API v3 / BibTeX export.`,
        collections: [],
      };
    }
  }

  if (!config.userId.trim() || !config.apiKey.trim()) {
    return {
      ok: false,
      mode: 'web_api',
      message: 'Zotero User ID and API Key are required for Web API v3.',
      collections: [],
    };
  }

  try {
    const appCfg = await readConfig();
    const dnsServers = getDnsServersForTarget(appCfg.network, 'zotero');
    const res = await dnsAwareRequest(
      `https://api.zotero.org/users/${encodeURIComponent(config.userId.trim())}/collections`,
      {
        method: 'GET',
        headers: {
          'Zotero-API-Key': config.apiKey.trim(),
          'Zotero-API-Version': '3',
        },
        timeoutMs: 10000,
        dnsServers,
      }
    );
    if (res.status < 200 || res.status >= 300) {
      return {
        ok: false,
        mode: 'web_api',
        message: `Zotero Web API returned HTTP ${res.status} (${res.statusText}). Check User ID and API Key permissions.`,
        collections: [],
      };
    }
    const raw = res.json<
      Array<{
        key: string;
        data?: { name?: string; parentCollection?: string | false };
        meta?: { numItems?: number };
      }>
    >();
    const collections: ZoteroCollection[] = raw.map((c) => ({
      key: c.key,
      name: c.data?.name || c.key,
      parentCollection: c.data?.parentCollection ?? false,
      numItems: c.meta?.numItems ?? 0,
    }));
    return {
      ok: true,
      mode: 'web_api',
      message: `Verified Zotero Web API v3 (${collections.length} collection${collections.length === 1 ? '' : 's'} loaded).`,
      collections,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      mode: 'web_api',
      message: `Failed to reach api.zotero.org: ${(err as Error).message}`,
      collections: [],
    };
  }
}

export async function pushPapersToZotero(
  papers: ArxivPaper[],
  config: ZoteroConfig,
  collectionKeyOverride?: string
): Promise<ZoteroSyncResult> {
  if (papers.length === 0) {
    return {
      ok: false,
      syncedCount: 0,
      failedCount: 0,
      itemKeys: {},
      message: 'No papers provided to sync.',
    };
  }

  const collectionKey = (collectionKeyOverride ?? config.defaultCollectionKey ?? '').trim();

  if (config.mode === 'local_desktop') {
    const base = (config.localEndpoint || 'http://127.0.0.1:23119').replace(/\/$/, '');
    try {
      const items = papers.map((p) => ({
        ...paperToZoteroItem(p, []),
        id: `arxiv:${p.id}`,
      }));
      const res = await dnsAwareRequest(`${base}/connector/saveItems`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uri: papers[0].absUrl,
          items,
        }),
        timeoutMs: 8000,
      });
      if (res.status < 200 || res.status >= 300) {
        return {
          ok: false,
          syncedCount: 0,
          failedCount: papers.length,
          itemKeys: {},
          message: `Local Zotero connector returned HTTP ${res.status}.`,
        };
      }
      const itemKeys: Record<string, string> = {};
      for (const p of papers) {
        itemKeys[p.id] = `local:${p.id}`;
      }
      return {
        ok: true,
        syncedCount: papers.length,
        failedCount: 0,
        itemKeys,
        message: `Sent ${papers.length} paper(s) to local Zotero Desktop.`,
      };
    } catch (err: unknown) {
      return {
        ok: false,
        syncedCount: 0,
        failedCount: papers.length,
        itemKeys: {},
        message: `Local Zotero Desktop unreachable at ${base}: ${(err as Error).message}`,
      };
    }
  }

  if (!config.userId.trim() || !config.apiKey.trim()) {
    return {
      ok: false,
      syncedCount: 0,
      failedCount: papers.length,
      itemKeys: {},
      message: 'Configure Zotero User ID and API Key first, or use BibTeX/RIS export.',
    };
  }

  const payload = papers.map((p) =>
    paperToZoteroItem(p, collectionKey ? [collectionKey] : [], ['arxivlab'])
  );

  try {
    const appCfg = await readConfig();
    const dnsServers = getDnsServersForTarget(appCfg.network, 'zotero');
    const res = await dnsAwareRequest(
      `https://api.zotero.org/users/${encodeURIComponent(config.userId.trim())}/items`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Zotero-API-Key': config.apiKey.trim(),
          'Zotero-API-Version': '3',
        },
        body: JSON.stringify(payload),
        timeoutMs: 15000,
        dnsServers,
      }
    );

    if (res.status < 200 || res.status >= 300) {
      return {
        ok: false,
        syncedCount: 0,
        failedCount: papers.length,
        itemKeys: {},
        message: `Zotero Web API error (${res.status}): ${res.text().slice(0, 200)}`,
      };
    }

    const result = res.json<{
      successful?: Record<string, { key: string }>;
      failed?: Record<string, unknown>;
    }>();
    const itemKeys: Record<string, string> = {};
    const successful = result.successful || {};
    for (const [idxStr, created] of Object.entries(successful)) {
      const idx = Number(idxStr);
      if (papers[idx] && created?.key) {
        itemKeys[papers[idx].id] = created.key;
      }
    }
    const syncedCount = Object.keys(successful).length;
    const failedCount = Object.keys(result.failed || {}).length;
    return {
      ok: syncedCount > 0,
      syncedCount,
      failedCount,
      itemKeys,
      message:
        failedCount === 0
          ? `Synced ${syncedCount} paper(s) to Zotero Cloud.`
          : `Synced ${syncedCount}, failed ${failedCount}.`,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      syncedCount: 0,
      failedCount: papers.length,
      itemKeys: {},
      message: `Zotero Web API request failed: ${(err as Error).message}`,
    };
  }
}
