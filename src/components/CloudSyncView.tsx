import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  Download,
  FileJson,
  FolderSync,
  HardDrive,
  Loader2,
  LogOut,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  getDriveAccessToken,
  initDriveAuth,
  signInWithGoogleDrive,
  signOutGoogleDrive,
} from '../client/googleDriveAuth';
import {
  deleteDriveFileById,
  listDriveLibraryFiles,
  pullLibraryFromGoogleDrive,
  pushLibraryToGoogleDrive,
  type DriveFileItem,
} from '../client/googleDriveClient';
import { formatBytes } from '../shared/network';
import type { CustomCloudConfig, SavedPaper } from '../shared/types';

interface CloudSyncViewProps {
  papers: SavedPaper[];
  onPapersUpdated: (papers: SavedPaper[]) => void;
}

type PendingConfirmAction =
  | {
      kind: 'drive_push';
      title: string;
      description: string;
      confirmLabel: string;
      danger?: boolean;
    }
  | {
      kind: 'drive_delete';
      title: string;
      description: string;
      confirmLabel: string;
      danger: true;
      fileId: string;
      fileName: string;
    }
  | {
      kind: 'custom_push';
      title: string;
      description: string;
      confirmLabel: string;
      danger?: boolean;
    };

export function CloudSyncView({ papers, onPapersUpdated }: CloudSyncViewProps) {
  // Google Drive Auth & State
  const [driveUser, setDriveUser] = useState<User | null>(null);
  const [hasDriveToken, setHasDriveToken] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [driveIncludePdfs, setDriveIncludePdfs] = useState(true);
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [loadingDriveFiles, setLoadingDriveFiles] = useState(false);
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveNotice, setDriveNotice] = useState<{ type: 'ok' | 'error'; text: string } | null>(
    null
  );

  // Custom Cloud Storage (WebDAV / Custom HTTP)
  const [customConfig, setCustomConfig] = useState<CustomCloudConfig>({
    provider: 'webdav',
    endpointUrl: '',
    remotePath: '/arXivLab',
    username: '',
    passwordOrToken: '',
    includeCachedPdfs: true,
  });
  const [savingCustom, setSavingCustom] = useState(false);
  const [testingCustom, setTestingCustom] = useState(false);
  const [syncingCustom, setSyncingCustom] = useState(false);
  const [customNotice, setCustomNotice] = useState<{ type: 'ok' | 'error'; text: string } | null>(
    null
  );

  // Explicit Confirmation Modal (mandatory before mutating remote Google Drive / Cloud files)
  const [confirmAction, setConfirmAction] = useState<PendingConfirmAction | null>(null);

  const jsonImportInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const unsub = initDriveAuth(
      (user, token) => {
        setDriveUser(user);
        setHasDriveToken(Boolean(token));
      },
      () => {
        setDriveUser(null);
        setHasDriveToken(false);
        setDriveFiles([]);
      }
    );

    fetch('/api/cloud/config')
      .then((r) => r.json())
      .then((data) => {
        if (data.config) {
          setCustomConfig(data.config);
        }
      })
      .catch(() => {});

    return () => unsub();
  }, []);

  const refreshDriveFiles = async (tokenOverride?: string) => {
    const token = tokenOverride || getDriveAccessToken();
    if (!token) {
      setHasDriveToken(false);
      return;
    }
    setLoadingDriveFiles(true);
    try {
      const res = await listDriveLibraryFiles(token);
      setDriveFiles(res.files);
    } catch (err: unknown) {
      setDriveNotice({ type: 'error', text: (err as Error).message });
      if ((err as Error).message.includes('expired')) {
        setHasDriveToken(false);
      }
    } finally {
      setLoadingDriveFiles(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    setDriveNotice(null);
    try {
      const { user, accessToken } = await signInWithGoogleDrive();
      setDriveUser(user);
      setHasDriveToken(Boolean(accessToken));
      setDriveNotice({
        type: 'ok',
        text: `Connected to Google Drive as ${user.email || user.displayName || 'Google user'}.`,
      });
      await refreshDriveFiles(accessToken);
    } catch (err: unknown) {
      setDriveNotice({
        type: 'error',
        text: (err as Error).message || 'Google sign-in cancelled or failed.',
      });
    } finally {
      setSigningIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await signOutGoogleDrive();
    setDriveUser(null);
    setHasDriveToken(false);
    setDriveFiles([]);
    setDriveNotice({ type: 'ok', text: 'Signed out from Google Drive.' });
  };

  const executeDrivePush = async () => {
    const token = getDriveAccessToken();
    if (!token) {
      setHasDriveToken(false);
      setDriveNotice({ type: 'error', text: 'Please sign in with Google Drive first.' });
      return;
    }
    setDriveBusy(true);
    setDriveNotice(null);
    try {
      const result = await pushLibraryToGoogleDrive(token, papers, driveIncludePdfs);
      setDriveNotice({
        type: 'ok',
        text: `Synced ${papers.length} library records${
          result.uploadedPdfs > 0 ? ` and ${result.uploadedPdfs} cached PDFs` : ''
        } to Google Drive folder "arXivLab Library".`,
      });
      await refreshDriveFiles(token);
    } catch (err: unknown) {
      setDriveNotice({ type: 'error', text: (err as Error).message });
    } finally {
      setDriveBusy(false);
    }
  };

  const handleDrivePull = async () => {
    const token = getDriveAccessToken();
    if (!token) {
      setHasDriveToken(false);
      setDriveNotice({ type: 'error', text: 'Please sign in with Google Drive first.' });
      return;
    }
    setDriveBusy(true);
    setDriveNotice(null);
    try {
      const remote = await pullLibraryFromGoogleDrive(token);
      const res = await fetch('/api/library/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ papers: remote.papers }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to merge pulled Drive papers.');
      }
      if (Array.isArray(data.papers)) {
        onPapersUpdated(data.papers);
      }
      setDriveNotice({
        type: 'ok',
        text: `Restored from ${remote.fileName}: ${data.added} new papers added, ${data.updated} merged.`,
      });
    } catch (err: unknown) {
      setDriveNotice({ type: 'error', text: (err as Error).message });
    } finally {
      setDriveBusy(false);
    }
  };

  const executeDriveDelete = async (fileId: string, fileName: string) => {
    const token = getDriveAccessToken();
    if (!token) {
      setHasDriveToken(false);
      return;
    }
    setDriveBusy(true);
    setDriveNotice(null);
    try {
      await deleteDriveFileById(token, fileId);
      setDriveNotice({ type: 'ok', text: `Deleted "${fileName}" from Google Drive.` });
      await refreshDriveFiles(token);
    } catch (err: unknown) {
      setDriveNotice({ type: 'error', text: (err as Error).message });
    } finally {
      setDriveBusy(false);
    }
  };

  const handleSaveCustomConfig = async (e: FormEvent) => {
    e.preventDefault();
    setSavingCustom(true);
    setCustomNotice(null);
    try {
      const res = await fetch('/api/cloud/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customConfig),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save custom cloud configuration.');
      }
      setCustomConfig(data.config);
      setCustomNotice({ type: 'ok', text: 'Custom cloud storage settings saved.' });
    } catch (err: unknown) {
      setCustomNotice({ type: 'error', text: (err as Error).message });
    } finally {
      setSavingCustom(false);
    }
  };

  const handleTestCustomConnection = async () => {
    setTestingCustom(true);
    setCustomNotice(null);
    try {
      const res = await fetch('/api/cloud/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customConfig),
      });
      const data = await res.json();
      setCustomNotice({
        type: res.ok && data.ok ? 'ok' : 'error',
        text: data.message || (res.ok ? 'Connected' : 'Connection test failed.'),
      });
    } catch (err: unknown) {
      setCustomNotice({ type: 'error', text: (err as Error).message });
    } finally {
      setTestingCustom(false);
    }
  };

  const executeCustomPush = async () => {
    setSyncingCustom(true);
    setCustomNotice(null);
    try {
      const res = await fetch('/api/cloud/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customConfig),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Remote push failed.');
      }
      if (data.config) {
        setCustomConfig(data.config);
      }
      setCustomNotice({ type: 'ok', text: data.message });
    } catch (err: unknown) {
      setCustomNotice({ type: 'error', text: (err as Error).message });
    } finally {
      setSyncingCustom(false);
    }
  };

  const handleCustomPull = async () => {
    setSyncingCustom(true);
    setCustomNotice(null);
    try {
      const res = await fetch('/api/cloud/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customConfig),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Remote pull failed.');
      }
      if (Array.isArray(data.papers)) {
        onPapersUpdated(data.papers);
      }
      setCustomNotice({
        type: 'ok',
        text: `Pulled remote manifest: ${data.added} new papers added, ${data.updated} merged (${data.total} total).`,
      });
    } catch (err: unknown) {
      setCustomNotice({ type: 'error', text: (err as Error).message });
    } finally {
      setSyncingCustom(false);
    }
  };

  const handleImportSnapshotFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { papers?: SavedPaper[] } | SavedPaper[];
      const incoming = Array.isArray(parsed)
        ? parsed
        : parsed && Array.isArray(parsed.papers)
          ? parsed.papers
          : [];
      if (incoming.length === 0) {
        throw new Error('Selected JSON file contains no saved arXivLab papers.');
      }
      const res = await fetch('/api/library/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ papers: incoming }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Snapshot import failed.');
      }
      if (Array.isArray(data.papers)) {
        onPapersUpdated(data.papers);
      }
      setCustomNotice({
        type: 'ok',
        text: `Imported ${file.name}: ${data.added} new papers added, ${data.updated} merged.`,
      });
    } catch (err: unknown) {
      setCustomNotice({ type: 'error', text: (err as Error).message });
    }
  };

  const cachedPdfCount = papers.filter((p) => p.pdfCached).length;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Section 1: Google Drive Cloud Sync */}
      <section aria-labelledby="gdrive-heading" className="space-y-3">
        <div className="px-1">
          <h1 id="gdrive-heading" className="text-base font-semibold text-slate-900">
            Google Drive Sync
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Back up and restore your saved paper library, notes, tags, and cached PDFs in a dedicated{' '}
            <span className="font-mono text-slate-700">arXivLab Library</span> folder in Google Drive.
          </p>
        </div>

        <div className="rounded-xl border border-black/[0.08] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
            {driveUser && hasDriveToken ? (
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                  <Cloud className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-900">
                    {driveUser.displayName || 'Google Drive Connected'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {driveUser.email || 'Active session'} · {papers.length} local papers ({cachedPdfCount} cached PDFs)
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-xs font-semibold text-slate-900">
                  {driveUser ? 'Reconnect Google Drive session' : 'Connect your Google account'}
                </p>
                <p className="text-[11px] text-slate-500">
                  arXivLab only accesses the library files and folder it creates in your Google Drive.
                </p>
              </div>
            )}

            <div className="flex items-center gap-2">
              {driveUser && hasDriveToken ? (
                <button
                  type="button"
                  onClick={handleGoogleSignOut}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Sign Out</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={signingIn}
                  className="gsi-material-button inline-flex items-center gap-2.5 rounded-md border border-[#747775] bg-white px-4 py-2 text-xs font-medium text-[#1f1f1f] shadow-xs transition-colors hover:bg-[#f8f9fa] disabled:opacity-60"
                >
                  {signingIn ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-600" aria-hidden="true" />
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                    </svg>
                  )}
                  <span>Sign in with Google</span>
                </button>
              )}
            </div>
          </div>

          {driveUser && hasDriveToken && (
            <div className="space-y-4 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={driveIncludePdfs}
                    onChange={(e) => setDriveIncludePdfs(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                  />
                  <span>Also upload locally cached PDFs ({cachedPdfCount} ready)</span>
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void refreshDriveFiles()}
                    disabled={loadingDriveFiles || driveBusy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${loadingDriveFiles ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                    <span>Refresh</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDrivePull}
                    disabled={driveBusy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                    <span>Pull &amp; Merge</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setConfirmAction({
                        kind: 'drive_push',
                        title: 'Sync Library to Google Drive?',
                        description: `This will upload or overwrite "arxivlab-library.json" (${papers.length} papers)${
                          driveIncludePdfs && cachedPdfCount > 0
                            ? ` and upload up to ${cachedPdfCount} cached PDF file(s)`
                            : ''
                        } inside your Google Drive "arXivLab Library" folder.`,
                        confirmLabel: 'Confirm Sync to Drive',
                      })
                    }
                    disabled={driveBusy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {driveBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>Sync Library to Drive</span>
                  </button>
                </div>
              </div>

              {driveFiles.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-[#fafafa]">
                  <div className="border-b border-slate-200 px-3.5 py-2 text-[11px] font-semibold text-slate-600">
                    Files in Google Drive / arXivLab Library
                  </div>
                  <ul className="divide-y divide-slate-200/80">
                    {driveFiles.map((file) => (
                      <li
                        key={file.id}
                        className="flex items-center justify-between gap-3 px-3.5 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-mono text-slate-800">{file.name}</p>
                          <p className="text-[11px] text-slate-500">
                            {file.size ? formatBytes(Number(file.size)) : 'Folder'}
                            {file.modifiedTime
                              ? ` · Updated ${new Date(file.modifiedTime).toLocaleString()}`
                              : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmAction({
                              kind: 'drive_delete',
                              title: `Delete "${file.name}" from Google Drive?`,
                              description:
                                'This permanently deletes the file or folder from your Google Drive account.',
                              confirmLabel: 'Delete from Drive',
                              danger: true,
                              fileId: file.id,
                              fileName: file.name,
                            })
                          }
                          aria-label={`Delete ${file.name} from Google Drive`}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {driveNotice && (
            <div
              role="status"
              className={`flex items-center gap-2 border-t px-5 py-3 text-xs ${
                driveNotice.type === 'ok'
                  ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
                  : 'border-rose-100 bg-rose-50 text-rose-800'
              }`}
            >
              {driveNotice.type === 'ok' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span>{driveNotice.text}</span>
            </div>
          )}
        </div>
      </section>

      {/* Section 2: Custom Cloud Storage (WebDAV / Nextcloud / OwnCloud / Custom HTTP) */}
      <section aria-labelledby="custom-cloud-heading" className="space-y-3">
        <div className="px-1">
          <h2 id="custom-cloud-heading" className="text-base font-semibold text-slate-900">
            Custom Cloud Storage (WebDAV / Nextcloud / HTTP)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Sync your library manifest and cached PDFs with any self-hosted WebDAV server (Nextcloud, ownCloud, Synology) or custom HTTP backup endpoint.
          </p>
        </div>

        <form
          onSubmit={handleSaveCustomConfig}
          className="divide-y divide-slate-200/75 rounded-xl border border-black/[0.08] bg-white"
        >
          <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <label htmlFor="cloud-provider" className="text-xs font-medium text-slate-900">
                Storage Protocol
              </label>
              <p className="text-[11px] text-slate-500">
                WebDAV supports folders + PDFs; Custom HTTP uploads/downloads the JSON library manifest.
              </p>
            </div>
            <select
              id="cloud-provider"
              value={customConfig.provider}
              onChange={(e) =>
                setCustomConfig((c) => ({
                  ...c,
                  provider: e.target.value === 'custom_http' ? 'custom_http' : 'webdav',
                }))
              }
              className="w-full rounded-lg border border-slate-200 bg-[#fafafa] px-3 py-1.5 text-xs font-medium text-slate-900 sm:w-64 focus:border-blue-600 focus:outline-none"
            >
              <option value="webdav">WebDAV (Nextcloud / ownCloud / NAS)</option>
              <option value="custom_http">Custom HTTP / Presigned JSON URL</option>
            </select>
          </div>

          <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
            <div className={customConfig.provider === 'custom_http' ? 'sm:col-span-2' : ''}>
              <label htmlFor="cloud-endpoint" className="block text-xs font-medium text-slate-800">
                Endpoint URL
              </label>
              <input
                id="cloud-endpoint"
                type="url"
                value={customConfig.endpointUrl}
                onChange={(e) =>
                  setCustomConfig((c) => ({ ...c, endpointUrl: e.target.value }))
                }
                placeholder={
                  customConfig.provider === 'webdav'
                    ? 'https://cloud.example.org/remote.php/dav/files/user'
                    : 'https://storage.example.org/arxivlab-library.json'
                }
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-[#fafafa] px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            {customConfig.provider === 'webdav' && (
              <div>
                <label htmlFor="cloud-folder" className="block text-xs font-medium text-slate-800">
                  Remote Folder Path
                </label>
                <input
                  id="cloud-folder"
                  type="text"
                  value={customConfig.remotePath}
                  onChange={(e) =>
                    setCustomConfig((c) => ({ ...c, remotePath: e.target.value }))
                  }
                  placeholder="/arXivLab"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-[#fafafa] px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
            )}

            {customConfig.provider === 'webdav' && (
              <div>
                <label htmlFor="cloud-username" className="block text-xs font-medium text-slate-800">
                  Username
                </label>
                <input
                  id="cloud-username"
                  type="text"
                  value={customConfig.username}
                  onChange={(e) =>
                    setCustomConfig((c) => ({ ...c, username: e.target.value }))
                  }
                  placeholder="researcher"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-[#fafafa] px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
            )}

            <div className={customConfig.provider === 'custom_http' ? 'sm:col-span-2' : ''}>
              <label htmlFor="cloud-secret" className="block text-xs font-medium text-slate-800">
                {customConfig.provider === 'webdav'
                  ? 'App Password / Password'
                  : 'Bearer Token (optional)'}
              </label>
              <input
                id="cloud-secret"
                type="password"
                value={customConfig.passwordOrToken}
                onChange={(e) =>
                  setCustomConfig((c) => ({ ...c, passwordOrToken: e.target.value }))
                }
                placeholder={customConfig.hasSecret ? 'Saved secret (leave unchanged)' : '••••••••'}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-[#fafafa] px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          {customConfig.provider === 'webdav' && (
            <div className="flex items-center justify-between px-5 py-3.5">
              <div>
                <span className="block text-xs font-medium text-slate-900">
                  Sync locally cached PDFs to WebDAV /pdfs
                </span>
                <span className="text-[11px] text-slate-500">
                  Uploads any PDFs already cached in this workstation alongside the library JSON.
                </span>
              </div>
              <input
                type="checkbox"
                checked={customConfig.includeCachedPdfs}
                onChange={(e) =>
                  setCustomConfig((c) => ({ ...c, includeCachedPdfs: e.target.checked }))
                }
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
            <span className="font-mono text-[11px] text-slate-500">
              {customConfig.lastSyncedAt
                ? `Last synced: ${new Date(customConfig.lastSyncedAt).toLocaleString()}`
                : 'Not yet synced to custom storage'}
            </span>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={savingCustom}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {savingCustom && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                <span>Save Config</span>
              </button>
              <button
                type="button"
                onClick={handleTestCustomConnection}
                disabled={testingCustom}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {testingCustom ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <HardDrive className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>Test</span>
              </button>
              <button
                type="button"
                onClick={handleCustomPull}
                disabled={syncingCustom}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                <span>Pull</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setConfirmAction({
                    kind: 'custom_push',
                    title: 'Push Library to Custom Storage?',
                    description: `This will upload and overwrite the remote backup manifest (${papers.length} papers) at ${
                      customConfig.endpointUrl || 'the configured endpoint'
                    }.`,
                    confirmLabel: 'Confirm Upload',
                  })
                }
                disabled={syncingCustom}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                {syncingCustom ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <FolderSync className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>Push Library</span>
              </button>
            </div>
          </div>

          {customNotice && (
            <div
              role="status"
              className={`flex items-center gap-2 px-5 py-3 text-xs ${
                customNotice.type === 'ok'
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-rose-50 text-rose-800'
              }`}
            >
              {customNotice.type === 'ok' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span>{customNotice.text}</span>
            </div>
          )}
        </form>
      </section>

      {/* Section 3: Portable Library Snapshot (for Dropbox, iCloud, OneDrive, Syncthing local folders) */}
      <section aria-labelledby="snapshot-heading" className="space-y-3">
        <div className="px-1">
          <h2 id="snapshot-heading" className="text-base font-semibold text-slate-900">
            Portable Library Snapshot
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Export or merge a full JSON library backup for syncing across machines via Syncthing, Dropbox, iCloud Drive, or OneDrive folders.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-black/[0.08] bg-white px-5 py-4">
          <div className="flex items-center gap-3">
            <FileJson className="h-5 w-5 text-blue-600" aria-hidden="true" />
            <div>
              <p className="text-xs font-semibold text-slate-900">
                arxivlab-library.json ({papers.length} papers)
              </p>
              <p className="text-[11px] text-slate-500">
                Includes full metadata, INSPIRE document tags, notes, and Zotero keys.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/api/library/export?format=json"
              download="arxivlab-library.json"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Export Snapshot</span>
            </a>

            <input
              ref={jsonImportInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportSnapshotFile}
              className="sr-only"
            />
            <button
              type="button"
              onClick={() => jsonImportInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Import &amp; Merge JSON</span>
            </button>
          </div>
        </div>
      </section>

      {/* Mandatory Explicit Confirmation Dialog before modifying/deleting remote files */}
      {confirmAction && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="cloud-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-xl border border-black/[0.08] bg-white p-5 shadow-2xl">
            <h3 id="cloud-confirm-title" className="text-sm font-semibold text-slate-900">
              {confirmAction.title}
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              {confirmAction.description}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const action = confirmAction;
                  setConfirmAction(null);
                  if (action.kind === 'drive_push') {
                    await executeDrivePush();
                  } else if (action.kind === 'drive_delete') {
                    await executeDriveDelete(action.fileId, action.fileName);
                  } else if (action.kind === 'custom_push') {
                    await executeCustomPush();
                  }
                }}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white ${
                  confirmAction.danger
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {confirmAction.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
