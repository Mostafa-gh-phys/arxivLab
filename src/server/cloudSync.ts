import type { CustomCloudConfig, SavedPaper } from '../shared/types';
import { readCachedPdf, safePdfFileName } from './storage';

const LIBRARY_FILE_NAME = 'arxivlab-library.json';

function normalizeWebDavBase(endpointUrl: string, remotePath: string): string {
  const base = endpointUrl.trim().replace(/\/+$/, '');
  const cleanFolder = ('/' + (remotePath || '/arXivLab').trim())
    .replace(/\/+/g, '/')
    .replace(/\/+$/, '');
  return cleanFolder === '/' ? base : `${base}${cleanFolder}`;
}

function buildAuthHeaders(cfg: CustomCloudConfig): Record<string, string> {
  const headers: Record<string, string> = {};
  if (cfg.provider === 'webdav') {
    if (cfg.username || cfg.passwordOrToken) {
      const encoded = Buffer.from(`${cfg.username}:${cfg.passwordOrToken}`, 'utf-8').toString('base64');
      headers.Authorization = `Basic ${encoded}`;
    }
  } else if (cfg.passwordOrToken) {
    headers.Authorization = cfg.passwordOrToken.toLowerCase().startsWith('bearer ')
      ? cfg.passwordOrToken
      : `Bearer ${cfg.passwordOrToken}`;
  }
  return headers;
}

async function ensureWebDavFolder(cfg: CustomCloudConfig): Promise<void> {
  const base = cfg.endpointUrl.trim().replace(/\/+$/, '');
  const segments = (cfg.remotePath || '/arXivLab')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  const authHeaders = buildAuthHeaders(cfg);
  let current = base;
  for (const seg of segments) {
    current = `${current}/${encodeURIComponent(seg)}`;
    const res = await fetch(current, {
      method: 'MKCOL',
      headers: authHeaders,
    });
    // 201 Created, 405 Already exists, 301/302 redirect, 409/200 ok to continue
    if (![200, 201, 204, 301, 302, 405].includes(res.status)) {
      if (res.status === 401 || res.status === 403) {
        throw new Error(`WebDAV authentication failed (HTTP ${res.status}).`);
      }
    }
  }
}

export async function testCustomCloudConnection(cfg: CustomCloudConfig): Promise<{
  ok: boolean;
  message: string;
}> {
  if (!cfg.endpointUrl.trim()) {
    return { ok: false, message: 'Enter a WebDAV or custom storage endpoint URL first.' };
  }

  const headers = buildAuthHeaders(cfg);
  try {
    if (cfg.provider === 'webdav') {
      const targetUrl = normalizeWebDavBase(cfg.endpointUrl, cfg.remotePath);
      const res = await fetch(targetUrl, {
        method: 'PROPFIND',
        headers: { ...headers, Depth: '0' },
      });
      if (res.status === 404) {
        await ensureWebDavFolder(cfg);
        return {
          ok: true,
          message: `Connected and initialized WebDAV folder ${cfg.remotePath || '/arXivLab'}.`,
        };
      }
      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: `Authentication failed (HTTP ${res.status}).` };
      }
      if (res.status >= 200 && res.status < 400) {
        return {
          ok: true,
          message: `WebDAV endpoint reachable (HTTP ${res.status}).`,
        };
      }
      return { ok: false, message: `WebDAV endpoint returned HTTP ${res.status} ${res.statusText}.` };
    }

    const endpoint = cfg.endpointUrl.trim();
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: { ...headers, Accept: 'application/json' },
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: `Authentication rejected (HTTP ${res.status}).` };
    }
    if (res.status === 404 || (res.status >= 200 && res.status < 400)) {
      return {
        ok: true,
        message: `Custom storage endpoint reachable (HTTP ${res.status}).`,
      };
    }
    return { ok: false, message: `Endpoint returned HTTP ${res.status} ${res.statusText}.` };
  } catch (err: unknown) {
    return { ok: false, message: `Connection failed: ${(err as Error).message}` };
  }
}

export async function pushLibraryToCustomCloud(
  cfg: CustomCloudConfig,
  papers: SavedPaper[]
): Promise<{
  ok: boolean;
  message: string;
  uploadedPdfs: number;
  syncedAt: string;
}> {
  if (!cfg.endpointUrl.trim()) {
    throw new Error('Custom cloud endpoint URL is required.');
  }
  const headers = buildAuthHeaders(cfg);
  const syncedAt = new Date().toISOString();
  const manifest = JSON.stringify(
    {
      app: 'arXivLab',
      version: '2.0.0',
      syncedAt,
      paperCount: papers.length,
      papers,
    },
    null,
    2
  );

  let uploadedPdfs = 0;

  if (cfg.provider === 'webdav') {
    await ensureWebDavFolder(cfg);
    const folderUrl = normalizeWebDavBase(cfg.endpointUrl, cfg.remotePath);
    const manifestUrl = `${folderUrl}/${LIBRARY_FILE_NAME}`;
    const putRes = await fetch(manifestUrl, {
      method: 'PUT',
      headers: {
        ...headers,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: manifest,
    });
    if (!putRes.ok) {
      throw new Error(`WebDAV upload failed with HTTP ${putRes.status} ${putRes.statusText}`);
    }

    if (cfg.includeCachedPdfs) {
      const pdfFolderUrl = `${folderUrl}/pdfs`;
      await fetch(pdfFolderUrl, { method: 'MKCOL', headers }).catch(() => {});
      for (const paper of papers) {
        const pdfBuf = await readCachedPdf(paper.id);
        if (!pdfBuf) continue;
        const pdfFile = safePdfFileName(paper.id);
        const upRes = await fetch(`${pdfFolderUrl}/${encodeURIComponent(pdfFile)}`, {
          method: 'PUT',
          headers: {
            ...headers,
            'Content-Type': 'application/pdf',
          },
          body: new Uint8Array(pdfBuf),
        });
        if (upRes.ok) {
          uploadedPdfs += 1;
        }
      }
    }

    return {
      ok: true,
      message: `Synced ${papers.length} papers${uploadedPdfs ? ` and ${uploadedPdfs} cached PDFs` : ''} to WebDAV (${cfg.remotePath || '/arXivLab'}).`,
      uploadedPdfs,
      syncedAt,
    };
  }

  // Custom HTTP JSON endpoint
  const putRes = await fetch(cfg.endpointUrl.trim(), {
    method: 'PUT',
    headers: {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: manifest,
  });
  if (!putRes.ok) {
    throw new Error(`Custom HTTP storage upload failed with HTTP ${putRes.status} ${putRes.statusText}`);
  }

  return {
    ok: true,
    message: `Uploaded ${papers.length} papers to custom HTTP storage endpoint.`,
    uploadedPdfs: 0,
    syncedAt,
  };
}

export async function pullLibraryFromCustomCloud(cfg: CustomCloudConfig): Promise<{
  papers: SavedPaper[];
  syncedAt?: string;
}> {
  if (!cfg.endpointUrl.trim()) {
    throw new Error('Custom cloud endpoint URL is required.');
  }
  const headers = buildAuthHeaders(cfg);
  const targetUrl =
    cfg.provider === 'webdav'
      ? `${normalizeWebDavBase(cfg.endpointUrl, cfg.remotePath)}/${LIBRARY_FILE_NAME}`
      : cfg.endpointUrl.trim();

  const res = await fetch(targetUrl, {
    method: 'GET',
    headers: { ...headers, Accept: 'application/json' },
  });

  if (res.status === 404) {
    throw new Error('No arXivLab backup manifest found at the remote storage location.');
  }
  if (!res.ok) {
    throw new Error(`Remote pull failed with HTTP ${res.status} ${res.statusText}`);
  }

  const parsed = (await res.json()) as { papers?: SavedPaper[]; syncedAt?: string } | SavedPaper[];
  if (Array.isArray(parsed)) {
    return { papers: parsed };
  }
  if (parsed && Array.isArray(parsed.papers)) {
    return { papers: parsed.papers, syncedAt: parsed.syncedAt };
  }
  throw new Error('Remote JSON did not contain a valid arXivLab library manifest.');
}
