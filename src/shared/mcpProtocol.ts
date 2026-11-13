import type { McpConfig, McpPermissionMode } from './types';

export interface McpToolDescriptor {
  name: string;
  description: string;
  requiresWrite: boolean;
  inputSchema: Record<string, unknown>;
}

export const MCP_TOOLS: McpToolDescriptor[] = [
  {
    name: 'search_arxiv',
    description:
      'Search arxiv.org directly by keyword, date range (YYYY-MM-DD), and arXiv categories such as hep-th, gr-qc, quant-ph, or cs.AI.',
    requiresWrite: false,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search keywords, title terms, author name, or arXiv ID.',
        },
        field: {
          type: 'string',
          enum: ['all', 'ti', 'au', 'abs', 'id'],
          description: 'Target arXiv field prefix.',
        },
        categories: {
          type: 'array',
          items: { type: 'string' },
          description: 'arXiv category codes, e.g. ["hep-th", "gr-qc"].',
        },
        date_from: {
          type: 'string',
          description: 'Earliest submission date in YYYY-MM-DD format.',
        },
        date_to: {
          type: 'string',
          description: 'Latest submission date in YYYY-MM-DD format.',
        },
        max_results: {
          type: 'number',
          description: 'Maximum results to return (1-30).',
        },
      },
      required: [],
    },
  },
  {
    name: 'read_paper',
    description:
      'Read full metadata, abstract, links, and extracted HTML/full-text sections for an arXiv paper ID (e.g. "2401.12345" or "hep-th/9711200").',
    requiresWrite: false,
    inputSchema: {
      type: 'object',
      properties: {
        arxiv_id: {
          type: 'string',
          description: 'Canonical arXiv ID or arXiv URL.',
        },
        include_full_text: {
          type: 'boolean',
          description: 'Attempt to fetch and extract readable full-text sections from arXiv HTML.',
        },
      },
      required: ['arxiv_id'],
    },
  },
  {
    name: 'save_paper',
    description:
      'Save an arXiv paper to the local Linux library (and optionally push to Zotero) with custom tags and research notes.',
    requiresWrite: true,
    inputSchema: {
      type: 'object',
      properties: {
        arxiv_id: {
          type: 'string',
          description: 'arXiv ID to fetch and save.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional user tags to attach.',
        },
        notes: {
          type: 'string',
          description: 'Optional research notes to store with the paper.',
        },
        sync_zotero: {
          type: 'boolean',
          description: 'Also push the saved paper to the configured Zotero library.',
        },
        download_pdf: {
          type: 'boolean',
          description: 'Download and cache the PDF file directly to local disk.',
        },
      },
      required: ['arxiv_id'],
    },
  },
  {
    name: 'list_saved_papers',
    description: 'List papers saved in the local Linux library, optionally filtered by category or tag.',
    requiresWrite: false,
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Filter by arXiv category such as hep-th.',
        },
        tag: {
          type: 'string',
          description: 'Filter by user tag.',
        },
      },
      required: [],
    },
  },
  {
    name: 'export_bibtex',
    description: 'Generate clean BibTeX citation entries for one arXiv ID or all saved papers.',
    requiresWrite: false,
    inputSchema: {
      type: 'object',
      properties: {
        arxiv_id: {
          type: 'string',
          description: 'Specific arXiv ID to format as BibTeX. If omitted, exports all saved papers.',
        },
      },
      required: [],
    },
  },
];

export function getAllowedMcpTools(permissionMode: McpPermissionMode): McpToolDescriptor[] {
  if (permissionMode === 'read_only') {
    return MCP_TOOLS.filter((t) => !t.requiresWrite);
  }
  return MCP_TOOLS;
}

export function isMcpToolAllowed(toolName: string, permissionMode: McpPermissionMode): boolean {
  const tool = MCP_TOOLS.find((t) => t.name === toolName);
  if (!tool) return false;
  if (permissionMode === 'read_only' && tool.requiresWrite) return false;
  return true;
}

export function buildLocalStdioClientConfig(projectDir: string): string {
  const config = {
    mcpServers: {
      arxivlab: {
        command: 'npx',
        args: ['tsx', `${projectDir}/mcp-stdio.ts`],
        env: {
          ARXIVLAB_BASE_URL: 'http://127.0.0.1:3000',
        },
      },
    },
  };
  return JSON.stringify(config, null, 2);
}

export function buildOnlineHttpClientConfig(baseUrl: string, mcpConfig: McpConfig): string {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const headers: Record<string, string> = {};
  if (mcpConfig.requireBearerToken && mcpConfig.bearerToken) {
    headers.Authorization = `Bearer ${mcpConfig.bearerToken}`;
  }
  const config = {
    mcpServers: {
      arxivlab_remote: {
        type: 'streamable-http',
        url: `${cleanBase}/mcp`,
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      },
      arxivlab_sse: {
        type: 'sse',
        url: `${cleanBase}/mcp/sse`,
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      },
    },
  };
  return JSON.stringify(config, null, 2);
}
