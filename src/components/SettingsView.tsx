import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Globe,
  HardDriveDownload,
  Loader2,
  RefreshCw,
  Smartphone,
} from 'lucide-react';
import {
  DNS_PRESETS,
  formatBytes,
  parseCustomDnsInput,
  type DnsPreset,
  type NetworkConfig,
} from '../shared/network';
import { PWAInstallButton } from './PWAInstallButton';

interface DnsProbeResult {
  hostname: string;
  addresses: string[];
  latencyMs: number;
  ok: boolean;
  error?: string;
}

interface DesktopInfo {
  platform: string;
  arch: string;
  projectDir: string;
  targets: {
    linuxAppImage: string;
    windowsExeInstaller: string;
    windowsExePortable: string;
    macOsDmgArm64?: string;
    macOsDmgX64?: string;
  };
  artifacts: Array<{ name: string; sizeBytes: number }>;
}

export function SettingsView() {
  const [network, setNetwork] = useState<NetworkConfig>({
    dnsPreset: 'system',
    customDnsServers: [],
    useCustomDnsForArxiv: true,
    useCustomDnsForZotero: true,
  });
  const [customDnsText, setCustomDnsText] = useState('');
  const [effectiveServers, setEffectiveServers] = useState<string[]>([]);
  const [savingDns, setSavingDns] = useState(false);
  const [testingDns, setTestingDns] = useState(false);
  const [dnsMessage, setDnsMessage] = useState<{
    type: 'ok' | 'error';
    text: string;
  } | null>(null);
  const [probeResults, setProbeResults] = useState<{
    serversUsed: string[];
    results: DnsProbeResult[];
  } | null>(null);

  const [desktopInfo, setDesktopInfo] = useState<DesktopInfo | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/network/config')
      .then((r) => r.json())
      .then((data) => {
        if (data.config) {
          setNetwork(data.config);
          setCustomDnsText((data.config.customDnsServers || []).join(', '));
          setEffectiveServers(data.effectiveServers || []);
        }
      })
      .catch(() => {});

    fetch('/api/desktop/info')
      .then((r) => r.json())
      .then((data) => setDesktopInfo(data))
      .catch(() => {});
  }, []);

  const handleSaveDns = async (e: FormEvent) => {
    e.preventDefault();
    setDnsMessage(null);

    let parsedCustom = network.customDnsServers;
    if (network.dnsPreset === 'custom') {
      const parsed = parseCustomDnsInput(customDnsText);
      if (parsed.invalid.length > 0) {
        setDnsMessage({
          type: 'error',
          text: `Invalid DNS IP address: ${parsed.invalid.join(', ')}`,
        });
        return;
      }
      if (parsed.valid.length === 0) {
        setDnsMessage({
          type: 'error',
          text: 'Enter at least one valid IPv4 or IPv6 DNS server.',
        });
        return;
      }
      parsedCustom = parsed.valid;
    }

    setSavingDns(true);
    try {
      const res = await fetch('/api/network/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...network,
          customDnsServers: parsedCustom,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save DNS settings.');
      }
      setNetwork(data.config);
      setEffectiveServers(data.effectiveServers || []);
      setDnsMessage({
        type: 'ok',
        text:
          data.effectiveServers?.length > 0
            ? `Active DNS resolver set to ${data.effectiveServers.join(', ')}.`
            : 'Active DNS resolver set to System Default.',
      });
    } catch (err: unknown) {
      setDnsMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setSavingDns(false);
    }
  };

  const handleTestDns = async () => {
    setTestingDns(true);
    setDnsMessage(null);
    const parsed = parseCustomDnsInput(customDnsText);
    try {
      const res = await fetch('/api/network/test-dns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...network,
          customDnsServers:
            network.dnsPreset === 'custom' ? parsed.valid : network.customDnsServers,
        }),
      });
      const data = await res.json();
      setProbeResults(data);
    } catch (err: unknown) {
      setDnsMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setTestingDns(false);
    }
  };

  const copyCommand = async (key: string, cmd: string) => {
    await navigator.clipboard.writeText(cmd);
    setCopiedCmd(key);
    setTimeout(() => setCopiedCmd(null), 1600);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* GNOME / macOS Preferences Group 1: Network & DNS */}
      <section aria-labelledby="dns-heading" className="space-y-3">
        <div className="px-1">
          <h1 id="dns-heading" className="text-base font-semibold text-slate-900">
            Network &amp; DNS Resolver
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Override the system DNS servers used when arXivLab connects to arxiv.org and api.zotero.org.
          </p>
        </div>

        <form
          onSubmit={handleSaveDns}
          className="divide-y divide-slate-200/75 rounded-xl border border-black/[0.08] bg-white"
        >
          <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <label htmlFor="dns-preset-select" className="text-xs font-medium text-slate-900">
                DNS Provider
              </label>
              <p className="text-[11px] text-slate-500">
                {DNS_PRESETS.find((p) => p.id === network.dnsPreset)?.description}
              </p>
            </div>
            <select
              id="dns-preset-select"
              value={network.dnsPreset}
              onChange={(e) =>
                setNetwork((n) => ({ ...n, dnsPreset: e.target.value as DnsPreset }))
              }
              className="w-full rounded-lg border border-slate-200 bg-[#fafafa] px-3 py-1.5 text-xs font-medium text-slate-900 sm:w-64 focus:border-blue-600 focus:outline-none"
            >
              {DNS_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>

          {network.dnsPreset === 'custom' && (
            <div className="px-5 py-4">
              <label htmlFor="custom-dns-input" className="block text-xs font-medium text-slate-900">
                Custom Nameserver IPs (comma-separated)
              </label>
              <input
                id="custom-dns-input"
                type="text"
                value={customDnsText}
                onChange={(e) => setCustomDnsText(e.target.value)}
                placeholder="e.g. 1.1.1.1, 9.9.9.9"
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-[#fafafa] px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
          )}

          <div className="flex items-center justify-between px-5 py-3.5">
            <div>
              <span className="block text-xs font-medium text-slate-900">
                Use custom DNS for arxiv.org
              </span>
              <span className="text-[11px] text-slate-500">
                Applies to Atom search queries, HTML reader, and direct PDF downloads.
              </span>
            </div>
            <input
              type="checkbox"
              aria-label="Use custom DNS for arxiv.org"
              checked={network.useCustomDnsForArxiv}
              onChange={(e) =>
                setNetwork((n) => ({ ...n, useCustomDnsForArxiv: e.target.checked }))
              }
              className="h-4 w-4 rounded border-slate-300 text-blue-600"
            />
          </div>

          <div className="flex items-center justify-between px-5 py-3.5">
            <div>
              <span className="block text-xs font-medium text-slate-900">
                Use custom DNS for api.zotero.org
              </span>
              <span className="text-[11px] text-slate-500">
                Applies to Zotero Web API v3 verification and item syncing.
              </span>
            </div>
            <input
              type="checkbox"
              aria-label="Use custom DNS for api.zotero.org"
              checked={network.useCustomDnsForZotero}
              onChange={(e) =>
                setNetwork((n) => ({ ...n, useCustomDnsForZotero: e.target.checked }))
              }
              className="h-4 w-4 rounded border-slate-300 text-blue-600"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
            <span className="font-mono text-[11px] text-slate-500">
              Active resolver:{' '}
              {effectiveServers.length > 0 ? effectiveServers.join(', ') : 'System Default'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTestDns}
                disabled={testingDns}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {testingDns ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>Test DNS Lookup</span>
              </button>
              <button
                type="submit"
                disabled={savingDns}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                {savingDns && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                <span>Save DNS Settings</span>
              </button>
            </div>
          </div>

          {dnsMessage && (
            <div
              role="status"
              className={`flex items-center gap-2 px-5 py-3 text-xs ${
                dnsMessage.type === 'ok'
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-rose-50 text-rose-800'
              }`}
            >
              {dnsMessage.type === 'ok' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span>{dnsMessage.text}</span>
            </div>
          )}

          {probeResults && (
            <div className="bg-[#fafafa] px-5 py-3.5">
              <p className="font-mono text-[11px] text-slate-500">
                Probe resolver: {probeResults.serversUsed.join(', ')}
              </p>
              <ul className="mt-2 space-y-1.5 font-mono text-xs tabular-nums">
                {probeResults.results.map((r) => (
                  <li key={r.hostname} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-slate-800">
                      <Globe className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                      {r.hostname}
                    </span>
                    <span className={r.ok ? 'text-emerald-700' : 'text-rose-700'}>
                      {r.ok
                        ? `${r.addresses.slice(0, 2).join(', ')} · ${r.latencyMs}ms`
                        : `Failed (${r.error})`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>
      </section>

      {/* GNOME / macOS Preferences Group 2: Desktop Packages (.AppImage & .exe) */}
      <section aria-labelledby="desktop-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div>
            <h2 id="desktop-heading" className="text-base font-semibold text-slate-900">
              Desktop Installers (Linux AppImage, Windows EXE &amp; macOS DMG)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Package this workspace as a native Electron desktop application (v2.0.0) using the included builder configuration.
            </p>
          </div>
          <a
            href="/api/desktop/build-script"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Download build-desktop.sh</span>
          </a>
        </div>

        <div className="divide-y divide-slate-200/75 rounded-xl border border-black/[0.08] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="text-xs font-semibold text-slate-900">
                Linux AppImage (x86_64)
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                Target: {desktopInfo?.targets.linuxAppImage || 'arXivLab-2.0.0-x86_64.AppImage'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <code className="rounded-md bg-slate-100 px-2.5 py-1 font-mono text-[11px] text-slate-800">
                npm run dist:linux
              </code>
              <button
                type="button"
                onClick={() => copyCommand('linux', 'npm run dist:linux')}
                aria-label="Copy Linux AppImage build command"
                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
              >
                {copiedCmd === 'linux' ? (
                  <Check className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="text-xs font-semibold text-slate-900">
                Windows Executable (.exe NSIS &amp; Portable)
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                Targets: {desktopInfo?.targets.windowsExeInstaller || 'arXivLab-Setup-2.0.0.exe'} ·{' '}
                {desktopInfo?.targets.windowsExePortable || 'arXivLab-Portable-2.0.0.exe'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <code className="rounded-md bg-slate-100 px-2.5 py-1 font-mono text-[11px] text-slate-800">
                npm run dist:win
              </code>
              <button
                type="button"
                onClick={() => copyCommand('win', 'npm run dist:win')}
                aria-label="Copy Windows EXE build command"
                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
              >
                {copiedCmd === 'win' ? (
                  <Check className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="text-xs font-semibold text-slate-900">
                macOS Disk Image &amp; Archive (.dmg &amp; .zip, Apple Silicon + Intel)
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                Targets: {desktopInfo?.targets.macOsDmgArm64 || 'arXivLab-2.0.0-mac-arm64.dmg'} ·{' '}
                {desktopInfo?.targets.macOsDmgX64 || 'arXivLab-2.0.0-mac-x64.dmg'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <code className="rounded-md bg-slate-100 px-2.5 py-1 font-mono text-[11px] text-slate-800">
                npm run dist:mac
              </code>
              <button
                type="button"
                onClick={() => copyCommand('mac', 'npm run dist:mac')}
                aria-label="Copy macOS DMG build command"
                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
              >
                {copiedCmd === 'mac' ? (
                  <Check className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <div className="bg-[#fafafa] px-5 py-3.5 text-xs text-slate-600">
            {desktopInfo && desktopInfo.artifacts.length > 0 ? (
              <div className="space-y-1.5">
                <p className="font-medium text-slate-800">Built packages found in release/</p>
                <ul className="space-y-1 font-mono text-[11px]">
                  {desktopInfo.artifacts.map((a) => (
                    <li key={a.name} className="flex items-center gap-2 text-slate-700">
                      <HardDriveDownload className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                      <span>
                        {a.name} ({formatBytes(a.sizeBytes)})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="leading-relaxed">
                Electron wrapper (<span className="font-mono">electron/main.cjs</span>) and{' '}
                <span className="font-mono">electron-builder.yml</span> are ready in your workspace. Run{' '}
                <span className="font-mono text-slate-800">npm run dist:linux</span>,{' '}
                <span className="font-mono text-slate-800">npm run dist:win</span>, or{' '}
                <span className="font-mono text-slate-800">npm run dist:mac</span> (or trigger the GitHub Actions workflow) to output{' '}
                <span className="font-mono">.AppImage</span>, <span className="font-mono">.exe</span>, and{' '}
                <span className="font-mono">.dmg</span> installers into <span className="font-mono">release/</span>.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Group 3: Android Phone App & Google Play (.apk / .aab + PWA) */}
      <section aria-labelledby="android-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div>
            <h2 id="android-heading" className="text-base font-semibold text-slate-900">
              Android Phone App &amp; Google Play (.apk / .aab / PWA)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Install directly onto any Android phone as an app or package a Google Play App Bundle (.aab) via Capacitor.
            </p>
          </div>
          <PWAInstallButton />
        </div>

        <div className="divide-y divide-slate-200/75 rounded-xl border border-black/[0.08] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="flex items-start gap-3">
              <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold text-slate-900">
                  Android APK &amp; Google Play App Bundle (.aab)
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                  Targets: arXivLab-2.0.0-android.apk · arXivLab-2.0.0-playstore.aab
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <code className="rounded-md bg-slate-100 px-2.5 py-1 font-mono text-[11px] text-slate-800">
                npm run dist:android
              </code>
              <button
                type="button"
                onClick={() => copyCommand('android', 'npm run dist:android')}
                aria-label="Copy Android build command"
                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
              >
                {copiedCmd === 'android' ? (
                  <Check className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <div className="bg-[#fafafa] px-5 py-3.5 text-xs leading-relaxed text-slate-600">
            On Android browsers (Chrome/Edge), tap <strong className="text-slate-800">Install App</strong> or
            &ldquo;Add to Home Screen&rdquo; to launch arXivLab standalone offline/online. To publish on Google Play,
            run the GitHub Actions <span className="font-mono text-slate-800">build-android.yml</span> workflow
            (or <span className="font-mono text-slate-800">npm run dist:android</span>) and upload the signed{' '}
            <span className="font-mono">.aab</span> bundle in your Google Play Console (see{' '}
            <span className="font-mono">ANDROID_PLAY_STORE.md</span>).
          </div>
        </div>
      </section>
    </div>
  );
}
