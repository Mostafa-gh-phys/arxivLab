import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Play,
  RefreshCw,
} from 'lucide-react';
import {
  buildLocalStdioClientConfig,
  buildOnlineHttpClientConfig,
  getAllowedMcpTools,
} from '../shared/mcpProtocol';
import type { McpActivityEntry, McpConfig } from '../shared/types';

interface McpServerInfo {
  config: McpConfig;
  activity: McpActivityEntry[];
  projectDir: string;
  runtimeBaseUrl: string;
  dataDir: string;
}

const DEFAULT_TOOL_ARGS: Record<string, string> = {
  search_arxiv: JSON.stringify(
    {
      query: 'holographic',
      categories: ['hep-th'],
      max_results: 3,
    },
    null,
    2
  ),
  read_paper: JSON.stringify(
    {
      arxiv_id: 'hep-th/9711200',
      include_full_text: false,
    },
    null,
    2
  ),
  save_paper: JSON.stringify(
    {
      arxiv_id: 'hep-th/9711200',
      tags: ['mcp-agent', 'hep-th'],
      notes: 'Saved via MCP live sandbox.',
    },
    null,
    2
  ),
  list_saved_papers: JSON.stringify({}, null, 2),
  export_bibtex: JSON.stringify({ arxiv_id: 'hep-th/9711200' }, null, 2),
};

export function McpModeView({ onLibraryMutated }: { onLibraryMutated: () => Promise<void> }) {
  const [info, setInfo] = useState<McpServerInfo | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);

  // Sandbox state
  const [selectedTool, setSelectedTool] = useState<string>('list_saved_papers');
  const [toolArgsText, setToolArgsText] = useState<string>(DEFAULT_TOOL_ARGS.list_saved_papers);
  const [runningTest, setRunningTest] = useState(false);
  const [testResponse, setTestResponse] = useState<string | null>(null);

  const loadInfo = async () => {
    const res = await fetch('/api/mcp/config');
    const data = (await res.json()) as McpServerInfo;
    setInfo(data);
  };

  useEffect(() => {
    loadInfo().catch(() => {});
  }, []);

  if (!info) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-8 text-xs text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-blue-700" aria-hidden="true" />
        <span>Loading MCP server configuration...</span>
      </div>
    );
  }

  const { config } = info;
  const allowedTools = getAllowedMcpTools(config.permissionMode);

  const updateConfig = async (patch: Partial<McpConfig>) => {
    setSavingPolicy(true);
    try {
      const res = await fetch('/api/mcp/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (data.config) {
        setInfo((prev) => (prev ? { ...prev, config: data.config } : prev));
      }
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleRotateToken = async () => {
    const res = await fetch('/api/mcp/rotate-token', { method: 'POST' });
    const data = await res.json();
    if (data.config) {
      setInfo((prev) => (prev ? { ...prev, config: data.config } : prev));
    }
  };

  const copyText = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1600);
  };

  const handleSelectTool = (toolName: string) => {
    setSelectedTool(toolName);
    setToolArgsText(DEFAULT_TOOL_ARGS[toolName] || '{}');
  };

  const handleRunTest = async (rpcMethod: 'tools/list' | 'resources/list' | 'tools/call') => {
    setRunningTest(true);
    setTestResponse(null);
    try {
      let params: Record<string, unknown> = {};
      if (rpcMethod === 'tools/call') {
        const parsedArgs = JSON.parse(toolArgsText || '{}');
        params = { name: selectedTool, arguments: parsedArgs };
      }
      const res = await fetch('/api/mcp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: rpcMethod,
          params,
        }),
      });
      const data = await res.json();
      setTestResponse(JSON.stringify(data.response, null, 2));
      if (Array.isArray(data.activity)) {
        setInfo((prev) => (prev ? { ...prev, activity: data.activity } : prev));
      }
      if (selectedTool === 'save_paper' && rpcMethod === 'tools/call') {
        await onLibraryMutated();
      }
    } catch (err: unknown) {
      setTestResponse(JSON.stringify({ error: (err as Error).message }, null, 2));
    } finally {
      setRunningTest(false);
    }
  };

  const localConfigSnippet = buildLocalStdioClientConfig(info.projectDir);
  const onlineConfigSnippet = buildOnlineHttpClientConfig(info.runtimeBaseUrl, config);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left MCP Mode & Permissions */}
      <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5">
        <div>
          <h1 className="text-base font-semibold text-slate-900">
            MCP Connection Mode
          </h1>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Expose arXiv search, full-text reading, and Linux library saving to local desktop agents (Stdio) or online remote agents (HTTP / SSE).
          </p>
        </div>

        {/* Transport Mode Switch */}
        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-slate-700">Agent Transport Mode</span>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => updateConfig({ transportMode: 'local_stdio' })}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                config.transportMode === 'local_stdio'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Local Linux (Stdio)
            </button>
            <button
              type="button"
              onClick={() => updateConfig({ transportMode: 'online_http' })}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                config.transportMode === 'online_http'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Online (HTTP / SSE)
            </button>
          </div>
        </div>

        {/* Agent Capability Policy */}
        <div className="space-y-1.5 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-700">Agent Access Policy</span>
            {savingPolicy && (
              <span className="text-[11px] text-slate-400">Saving...</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => updateConfig({ permissionMode: 'read_save' })}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                config.permissionMode === 'read_save'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Read &amp; Save
            </button>
            <button
              type="button"
              onClick={() => updateConfig({ permissionMode: 'read_only' })}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                config.permissionMode === 'read_only'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Read-Only
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            Active tools ({allowedTools.length}): {allowedTools.map((t) => t.name).join(', ')}
          </p>
        </div>

        {/* Security & Sync Toggles */}
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <label className="flex items-center gap-2.5 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={config.requireBearerToken}
              onChange={(e) => updateConfig({ requireBearerToken: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-blue-700"
            />
            <span>Require Bearer token on online HTTP/SSE endpoints</span>
          </label>

          {config.requireBearerToken && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-slate-600">Bearer Token</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowToken((v) => !v)}
                    aria-label={showToken ? 'Hide Bearer token' : 'Reveal Bearer token'}
                    className="rounded p-1 text-slate-500 hover:bg-white hover:text-slate-900"
                  >
                    {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={handleRotateToken}
                    aria-label="Rotate Bearer token"
                    className="rounded p-1 text-slate-500 hover:bg-white hover:text-slate-900"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => copyText('token', config.bearerToken)}
                    aria-label="Copy Bearer token"
                    className="rounded p-1 text-slate-500 hover:bg-white hover:text-slate-900"
                  >
                    {copiedKey === 'token' ? (
                      <Check className="h-3.5 w-3.5 text-emerald-700" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
              <p className="mt-1 break-all font-mono text-[11px] text-slate-800">
                {showToken ? config.bearerToken : `${config.bearerToken.slice(0, 8)}••••••••••••`}
              </p>
            </div>
          )}

          <label className="flex items-center gap-2.5 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={config.allowZoteroPushFromAgent}
              onChange={(e) =>
                updateConfig({ allowZoteroPushFromAgent: e.target.checked })
              }
              className="h-4 w-4 rounded border-slate-300 text-blue-700"
            />
            <span>Allow agents to forward saved papers to Zotero</span>
          </label>

          <label className="flex items-center gap-2.5 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={config.cacheFullTextOnAgentRead}
              onChange={(e) =>
                updateConfig({ cacheFullTextOnAgentRead: e.target.checked })
              }
              className="h-4 w-4 rounded border-slate-300 text-blue-700"
            />
            <span>Cache arXiv HTML sections on Linux disk when read</span>
          </label>
        </div>

        {/* Client Configuration Output */}
        <div className="space-y-2 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-900">
              {config.transportMode === 'local_stdio'
                ? 'Linux Stdio Client Config (Claude Desktop / Cursor)'
                : 'Online HTTP & SSE Client Config'}
            </span>
            <button
              type="button"
              onClick={() =>
                copyText(
                  'client-config',
                  config.transportMode === 'local_stdio'
                    ? localConfigSnippet
                    : onlineConfigSnippet
                )
              }
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
            >
              {copiedKey === 'client-config' ? (
                <Check className="h-3 w-3 text-emerald-700" aria-hidden="true" />
              ) : (
                <Copy className="h-3 w-3" aria-hidden="true" />
              )}
              <span>{copiedKey === 'client-config' ? 'Copied' : 'Copy JSON'}</span>
            </button>
          </div>
          <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-800">
            {config.transportMode === 'local_stdio'
              ? localConfigSnippet
              : onlineConfigSnippet}
          </pre>
          <p className="font-mono text-[11px] text-slate-500">
            {config.transportMode === 'local_stdio'
              ? `Linux stdio entrypoint: ${info.projectDir}/mcp-stdio.ts`
              : `Streamable HTTP: ${info.runtimeBaseUrl}/mcp · SSE: ${info.runtimeBaseUrl}/mcp/sse`}
          </p>
        </div>
      </section>

      {/* Right Live MCP Tool Sandbox & Activity Log */}
      <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Live MCP Protocol Inspector
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Execute real JSON-RPC 2.0 calls against the active MCP server handler.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleRunTest('tools/list')}
              disabled={runningTest}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-mono text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              tools/list
            </button>
            <button
              type="button"
              onClick={() => handleRunTest('resources/list')}
              disabled={runningTest}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-mono text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              resources/list
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="mcp-tool-select" className="block text-xs font-medium text-slate-700">
              MCP Tool
            </label>
            <select
              id="mcp-tool-select"
              value={selectedTool}
              onChange={(e) => handleSelectTool(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
            >
              <option value="list_saved_papers">list_saved_papers</option>
              <option value="search_arxiv">search_arxiv</option>
              <option value="read_paper">read_paper</option>
              <option value="save_paper">save_paper</option>
              <option value="export_bibtex">export_bibtex</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => handleRunTest('tools/call')}
              disabled={runningTest}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {runningTest ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>Execute tools/call</span>
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="mcp-args-json" className="block text-xs font-medium text-slate-700">
            Tool Arguments (JSON)
          </label>
          <textarea
            id="mcp-args-json"
            rows={4}
            value={toolArgsText}
            onChange={(e) => setToolArgsText(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
          />
        </div>

        {testResponse && (
          <div>
            <span className="block text-xs font-medium text-slate-700">
              JSON-RPC 2.0 Response
            </span>
            <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-900 p-3.5 font-mono text-[11px] leading-relaxed text-slate-100">
              {testResponse}
            </pre>
          </div>
        )}

        {/* Recent Real MCP Activity */}
        <div className="border-t border-slate-200 pt-4">
          <h3 className="text-xs font-semibold text-slate-900">Recent Agent Requests</h3>
          {info.activity.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">
              No MCP requests recorded yet. Run a tool call above or connect an external agent.
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-[11px] text-slate-500">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Method</th>
                    <th className="py-2 pr-3 font-medium">Transport</th>
                    <th className="py-2 pr-3 font-medium">Summary</th>
                    <th className="py-2 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {info.activity.slice(0, 8).map((item) => (
                    <tr key={item.id}>
                      <td className="py-2 pr-3 text-slate-800">
                        {item.toolName || item.method}
                      </td>
                      <td className="py-2 pr-3 text-slate-500">{item.transport}</td>
                      <td className="py-2 pr-3 font-sans text-slate-700">{item.summary}</td>
                      <td className="py-2 text-right tabular-nums">
                        <span
                          className={
                            item.status === 'ok'
                              ? 'text-emerald-700'
                              : item.status === 'denied'
                                ? 'text-amber-700'
                                : 'text-rose-700'
                          }
                        >
                          {item.status} ({item.durationMs}ms)
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
