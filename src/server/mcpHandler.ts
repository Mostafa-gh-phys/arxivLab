import crypto from 'node:crypto';
import { normalizeArxivId } from '../shared/arxiv';
import { papersToBibtexCollection, paperToBibtex } from '../shared/citations';
import { mapInspireDocumentTypesToTags } from '../shared/inspire';
import { getAllowedMcpTools, isMcpToolAllowed } from '../shared/mcpProtocol';
import type { ArxivSearchField, McpActivityEntry, SavedPaper } from '../shared/types';
import {
  downloadPaperPdf,
  fetchPaperById,
  fetchPaperReadableContent,
  searchArxiv,
} from './arxivClient';
import { lookupInspireMetadataForArxiv } from './inspireClient';
import {
  appendMcpActivity,
  readConfig,
  readLibrary,
  upsertSavedPaper,
} from './storage';
import { pushPapersToZotero } from './zoteroClient';

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export async function handleMcpJsonRpc(
  req: JsonRpcRequest,
  transport: McpActivityEntry['transport'] = 'http'
): Promise<JsonRpcResponse | null> {
  const startedAt = Date.now();
  const id = req.id ?? null;
  const method = req.method;
  const config = await readConfig();
  const mcpConfig = config.mcp;

  const logActivity = async (
    status: McpActivityEntry['status'],
    summary: string,
    toolName?: string
  ) => {
    await appendMcpActivity({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      transport,
      method,
      toolName,
      status,
      summary,
      durationMs: Math.max(1, Date.now() - startedAt),
    });
  };

  try {
    if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
      return null;
    }

    if (method === 'ping') {
      return { jsonrpc: '2.0', id, result: {} };
    }

    if (method === 'initialize') {
      await logActivity('ok', `Initialized MCP session (${mcpConfig.permissionMode})`);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: { listChanged: false },
            resources: { subscribe: false, listChanged: false },
          },
          serverInfo: {
            name: 'arxivlab-mcp',
            version: '1.0.0',
          },
        },
      };
    }

    if (method === 'tools/list') {
      const tools = getAllowedMcpTools(mcpConfig.permissionMode).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
      await logActivity('ok', `Listed ${tools.length} allowed tools`);
      return { jsonrpc: '2.0', id, result: { tools } };
    }

    if (method === 'resources/list') {
      const saved = await readLibrary();
      const resources = [
        {
          uri: 'arxiv://library',
          name: 'Saved Linux Paper Library',
          description: `Index of ${saved.length} saved arXiv papers on disk.`,
          mimeType: 'application/json',
        },
        ...saved.slice(0, 25).map((p) => ({
          uri: `arxiv://paper/${p.id}`,
          name: p.title,
          description: `${p.primaryCategory} · ${p.authors.slice(0, 2).join(', ')}`,
          mimeType: 'application/json',
        })),
      ];
      await logActivity('ok', `Listed ${resources.length} MCP resources`);
      return { jsonrpc: '2.0', id, result: { resources } };
    }

    if (method === 'resources/read') {
      const uri = String(req.params?.uri || '');
      const saved = await readLibrary();
      if (uri === 'arxiv://library') {
        await logActivity('ok', `Read resource ${uri}`);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(saved, null, 2),
              },
            ],
          },
        };
      }
      if (uri.startsWith('arxiv://paper/')) {
        const paperId = normalizeArxivId(uri.replace('arxiv://paper/', ''));
        const found = saved.find((p) => p.id === paperId) || (await fetchPaperById(paperId));
        if (!found) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32004, message: `Paper ${paperId} not found.` },
          };
        }
        await logActivity('ok', `Read resource ${uri}`);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(found, null, 2),
              },
            ],
          },
        };
      }
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: `Unknown resource URI: ${uri}` },
      };
    }

    if (method === 'tools/call') {
      const toolName = String(req.params?.name || '');
      const args = (req.params?.arguments || {}) as Record<string, unknown>;

      if (!isMcpToolAllowed(toolName, mcpConfig.permissionMode)) {
        await logActivity(
          'denied',
          `Blocked ${toolName} in ${mcpConfig.permissionMode} mode`,
          toolName
        );
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32003,
            message: `Tool "${toolName}" is disabled when MCP server is in read_only mode.`,
          },
        };
      }

      if (toolName === 'search_arxiv') {
        const result = await searchArxiv({
          query: String(args.query || ''),
          field: (args.field as ArxivSearchField) || 'all',
          categories: Array.isArray(args.categories)
            ? args.categories.map(String)
            : undefined,
          dateFrom: args.date_from ? String(args.date_from) : undefined,
          dateTo: args.date_to ? String(args.date_to) : undefined,
          maxResults: typeof args.max_results === 'number' ? args.max_results : 10,
        });
        await logActivity(
          'ok',
          `Searched arXiv (${result.papers.length} hits)`,
          'search_arxiv'
        );
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          },
        };
      }

      if (toolName === 'read_paper') {
        const arxivId = normalizeArxivId(String(args.arxiv_id || ''));
        if (!arxivId) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'arxiv_id is required.' },
          };
        }
        const paper = await fetchPaperById(arxivId);
        if (!paper) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32004, message: `Paper ${arxivId} not found on arXiv.` },
          };
        }
        const includeFullText = args.include_full_text !== false;
        const readable = includeFullText
          ? await fetchPaperReadableContent(paper, mcpConfig.cacheFullTextOnAgentRead)
          : { source: 'abstract-only', text: paper.abstract };

        await logActivity('ok', `Read paper ${paper.id} (${readable.source})`, 'read_paper');
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    paper,
                    contentSource: readable.source,
                    readableContent: readable.text,
                  },
                  null,
                  2
                ),
              },
            ],
          },
        };
      }

      if (toolName === 'save_paper') {
        const arxivId = normalizeArxivId(String(args.arxiv_id || ''));
        if (!arxivId) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'arxiv_id is required.' },
          };
        }
        const paper = await fetchPaperById(arxivId);
        if (!paper) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32004, message: `Paper ${arxivId} not found on arXiv.` },
          };
        }

        const rawTags = Array.isArray(args.tags) ? args.tags.map(String) : [];
        const inspireMeta = await lookupInspireMetadataForArxiv(paper.id);
        const documentTypes = inspireMeta?.documentTypes || paper.documentTypes || [];
        const docTags = mapInspireDocumentTypesToTags(documentTypes, paper.comment);
        const tags = Array.from(new Set([...rawTags, ...docTags]));
        const notes = typeof args.notes === 'string' ? args.notes : '';
        const readable = await fetchPaperReadableContent(paper, true);

        const savedEntry: SavedPaper = {
          ...paper,
          ...(inspireMeta || {}),
          documentTypes: documentTypes.length > 0 ? documentTypes : undefined,
          savedAt: new Date().toISOString(),
          tags,
          notes,
          fullTextCached: readable.source !== 'abstract-only',
          fullTextExcerpt: readable.text.slice(0, 1200),
        };

        if (args.download_pdf) {
          try {
            const pdfRes = await downloadPaperPdf(paper.id, true);
            savedEntry.pdfCached = true;
            savedEntry.pdfSizeBytes = pdfRes.sizeBytes;
          } catch {
            // Non-fatal if PDF fetch fails
          }
        }

        let zoteroNote = 'Not synced to Zotero.';
        if (args.sync_zotero && mcpConfig.allowZoteroPushFromAgent) {
          const zRes = await pushPapersToZotero([savedEntry], config.zotero);
          zoteroNote = zRes.message;
          if (zRes.ok && zRes.itemKeys[paper.id]) {
            savedEntry.zoteroItemKey = zRes.itemKeys[paper.id];
            savedEntry.zoteroSyncedAt = new Date().toISOString();
          }
        }

        await upsertSavedPaper(savedEntry);
        await logActivity('ok', `Saved paper ${paper.id} to Linux library`, 'save_paper');
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    saved: true,
                    paper: savedEntry,
                    zoteroStatus: zoteroNote,
                  },
                  null,
                  2
                ),
              },
            ],
          },
        };
      }

      if (toolName === 'list_saved_papers') {
        const all = await readLibrary();
        const catFilter = args.category ? String(args.category).trim().toLowerCase() : '';
        const tagFilter = args.tag ? String(args.tag).trim().toLowerCase() : '';
        const filtered = all.filter((p) => {
          const catOk =
            !catFilter || p.categories.some((c) => c.toLowerCase() === catFilter);
          const tagOk = !tagFilter || p.tags.some((t) => t.toLowerCase() === tagFilter);
          return catOk && tagOk;
        });
        await logActivity(
          'ok',
          `Listed ${filtered.length} saved papers`,
          'list_saved_papers'
        );
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(filtered, null, 2),
              },
            ],
          },
        };
      }

      if (toolName === 'export_bibtex') {
        const rawId = args.arxiv_id ? normalizeArxivId(String(args.arxiv_id)) : '';
        if (rawId) {
          const saved = await readLibrary();
          const paper = saved.find((p) => p.id === rawId) || (await fetchPaperById(rawId));
          if (!paper) {
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32004, message: `Paper ${rawId} not found.` },
            };
          }
          await logActivity('ok', `Exported BibTeX for ${rawId}`, 'export_bibtex');
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: paperToBibtex(paper) }],
            },
          };
        }
        const saved = await readLibrary();
        await logActivity('ok', `Exported BibTeX for ${saved.length} papers`, 'export_bibtex');
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: papersToBibtexCollection(saved) }],
          },
        };
      }

      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Unknown tool: ${toolName}` },
      };
    }

    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    };
  } catch (err: unknown) {
    const msg = (err as Error).message || 'Internal MCP error';
    await logActivity('error', msg);
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: msg },
    };
  }
}
