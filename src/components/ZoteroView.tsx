import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Send,
} from 'lucide-react';
import { papersToBibtexCollection } from '../shared/citations';
import type { SavedPaper, ZoteroCollection, ZoteroConfig } from '../shared/types';

interface ZoteroViewProps {
  papers: SavedPaper[];
  onPapersUpdated: (papers: SavedPaper[]) => void;
}

export function ZoteroView({ papers, onPapersUpdated }: ZoteroViewProps) {
  const [config, setConfig] = useState<ZoteroConfig>({
    mode: 'web_api',
    userId: '',
    apiKey: '',
    defaultCollectionKey: '',
    localEndpoint: 'http://127.0.0.1:23119',
    autoSyncOnSave: false,
  });
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [collections, setCollections] = useState<ZoteroCollection[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [savingConfig, setSavingConfig] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'ok' | 'error';
    text: string;
  } | null>(null);
  const [showBibtexPreview, setShowBibtexPreview] = useState(false);

  useEffect(() => {
    fetch('/api/zotero/config')
      .then((r) => r.json())
      .then((data) => {
        if (data.config) {
          setConfig(data.config);
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveConfig = async (e: FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (config.mode === 'web_api') {
      if (!config.userId.trim()) {
        setStatusMessage({
          type: 'error',
          text: 'Zotero User ID is required for Web API v3 mode.',
        });
        return;
      }
      if (!apiKeyInput.trim() && !config.hasApiKey) {
        setStatusMessage({
          type: 'error',
          text: 'Zotero API Key is required for Web API v3 mode.',
        });
        return;
      }
    }

    setSavingConfig(true);
    try {
      const res = await fetch('/api/zotero/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          ...(apiKeyInput.trim() ? { apiKey: apiKeyInput.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save Zotero configuration.');
      }
      setConfig(data.config);
      setApiKeyInput('');
      setStatusMessage({ type: 'ok', text: 'Zotero settings saved to Linux config.' });
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/zotero/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          ...(apiKeyInput.trim() ? { apiKey: apiKeyInput.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatusMessage({ type: 'error', text: data.message || 'Verification failed.' });
        return;
      }
      setCollections(data.collections || []);
      setStatusMessage({ type: 'ok', text: data.message });
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setVerifying(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePushSelected = async () => {
    const idsToPush =
      selectedIds.size > 0 ? Array.from(selectedIds) : papers.map((p) => p.id);
    if (idsToPush.length === 0) {
      setStatusMessage({ type: 'error', text: 'Save at least one paper before syncing.' });
      return;
    }

    setSyncing(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/zotero/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paperIds: idsToPush,
          collectionKey: config.defaultCollectionKey,
        }),
      });
      const data = await res.json();
      if (Array.isArray(data.papers)) {
        onPapersUpdated(data.papers);
      }
      setStatusMessage({
        type: data.ok ? 'ok' : 'error',
        text: data.message || 'Sync finished.',
      });
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setSyncing(false);
    }
  };

  const selectedPapers =
    selectedIds.size > 0 ? papers.filter((p) => selectedIds.has(p.id)) : papers;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left Connection Configuration */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5">
        <h1 className="text-base font-semibold text-slate-900">Zotero Connection</h1>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Connect directly to Zotero Cloud (Web API v3) or a running Linux Zotero Desktop instance, or export BibTeX/RIS bundles.
        </p>

        {/* Mode Switch */}
        <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setConfig((c) => ({ ...c, mode: 'web_api' }))}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              config.mode === 'web_api'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Zotero Web API v3
          </button>
          <button
            type="button"
            onClick={() => setConfig((c) => ({ ...c, mode: 'local_desktop' }))}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              config.mode === 'local_desktop'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Local Desktop (:23119)
          </button>
        </div>

        <form onSubmit={handleSaveConfig} className="mt-5 space-y-4">
          {config.mode === 'web_api' ? (
            <>
              <div>
                <label
                  htmlFor="zotero-user-id"
                  className="block text-xs font-medium text-slate-700"
                >
                  Zotero User ID
                </label>
                <input
                  id="zotero-user-id"
                  type="text"
                  value={config.userId}
                  onChange={(e) => setConfig((c) => ({ ...c, userId: e.target.value }))}
                  placeholder="Numeric User ID (from zotero.org/settings/keys)"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="zotero-api-key"
                  className="block text-xs font-medium text-slate-700"
                >
                  Zotero Private API Key
                </label>
                <input
                  id="zotero-api-key"
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={
                    config.hasApiKey
                      ? `Stored (${config.apiKey}) — enter new key to replace`
                      : 'Enter key with library write permission'
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="zotero-collection"
                  className="block text-xs font-medium text-slate-700"
                >
                  Target Collection Key (Optional)
                </label>
                {collections.length > 0 ? (
                  <select
                    id="zotero-collection"
                    value={config.defaultCollectionKey}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, defaultCollectionKey: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
                  >
                    <option value="">My Library (Root)</option>
                    {collections.map((col) => (
                      <option key={col.key} value={col.key}>
                        {col.name} ({col.key})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="zotero-collection"
                    type="text"
                    value={config.defaultCollectionKey}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, defaultCollectionKey: e.target.value }))
                    }
                    placeholder="Verify connection to load collections, or enter key"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
                  />
                )}
              </div>
            </>
          ) : (
            <div>
              <label
                htmlFor="zotero-local-endpoint"
                className="block text-xs font-medium text-slate-700"
              >
                Local Zotero Desktop Connector URL
              </label>
              <input
                id="zotero-local-endpoint"
                type="text"
                value={config.localEndpoint}
                onChange={(e) => setConfig((c) => ({ ...c, localEndpoint: e.target.value }))}
                placeholder="http://127.0.0.1:23119"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
              />
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                Requires Zotero Desktop running on the same computer (default port 23119) with an open library/collection. If accessing arXivLab via a remote cloud URL, use Zotero Web API v3 instead.
              </p>
            </div>
          )}

          <label className="flex items-center gap-2.5 pt-1 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={config.autoSyncOnSave}
              onChange={(e) =>
                setConfig((c) => ({ ...c, autoSyncOnSave: e.target.checked }))
              }
              className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-700"
            />
            <span>Automatically push papers to Zotero when saved</span>
          </label>

          {statusMessage && (
            <div
              role="status"
              className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${
                statusMessage.type === 'ok'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-rose-200 bg-rose-50 text-rose-800'
              }`}
            >
              {statusMessage.type === 'ok' ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="submit"
              disabled={savingConfig}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
            >
              {savingConfig && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              <span>Save Settings</span>
            </button>
            <button
              type="button"
              onClick={handleVerify}
              disabled={verifying}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {verifying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>Verify Connection</span>
            </button>
          </div>
        </form>
      </section>

      {/* Right Sync Queue & BibTeX/RIS Export */}
      <section className="rounded-xl border border-slate-200 bg-white lg:col-span-7">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Sync Queue &amp; Zotero Import Export
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
              {selectedIds.size > 0
                ? `${selectedIds.size} selected`
                : `All ${papers.length} saved papers ready`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowBibtexPreview((v) => !v)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {showBibtexPreview ? 'Hide BibTeX' : 'Preview BibTeX'}
            </button>
            <a
              href="/api/library/export?format=ris"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>.ris</span>
            </a>
            <button
              type="button"
              onClick={handlePushSelected}
              disabled={syncing || papers.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {syncing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>Push to Zotero</span>
            </button>
          </div>
        </div>

        {showBibtexPreview && (
          <div className="border-b border-slate-200 bg-slate-50 p-4">
            <pre className="max-h-56 overflow-auto font-mono text-[11px] leading-relaxed text-slate-800">
              {papersToBibtexCollection(selectedPapers)}
            </pre>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
              <tr>
                <th className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Select all saved papers for Zotero sync"
                    checked={papers.length > 0 && selectedIds.size === papers.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(new Set(papers.map((p) => p.id)));
                      } else {
                        setSelectedIds(new Set());
                      }
                    }}
                    className="h-3.5 w-3.5 rounded border-slate-300"
                  />
                </th>
                <th className="px-3 py-2.5">Paper</th>
                <th className="px-3 py-2.5">arXiv ID</th>
                <th className="px-4 py-2.5 text-right">Zotero Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {papers.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${p.title}`}
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      className="h-3.5 w-3.5 rounded border-slate-300"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-serif font-medium text-slate-900">{p.title}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {p.primaryCategory} · {p.authors[0]}
                    </p>
                  </td>
                  <td className="px-3 py-3 font-mono text-[11px] text-slate-600 tabular-nums whitespace-nowrap">
                    {p.id}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[11px] tabular-nums whitespace-nowrap">
                    {p.zoteroItemKey ? (
                      <span className="font-medium text-emerald-700">
                        Synced ({p.zoteroItemKey})
                      </span>
                    ) : (
                      <span className="text-slate-500">Not synced</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
