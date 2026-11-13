export type DnsPreset =
  | 'system'
  | 'cloudflare'
  | 'google'
  | 'quad9'
  | 'opendns'
  | 'custom';

export interface NetworkConfig {
  dnsPreset: DnsPreset;
  customDnsServers: string[];
  useCustomDnsForArxiv: boolean;
  useCustomDnsForZotero: boolean;
}

export interface DnsPresetInfo {
  id: DnsPreset;
  label: string;
  servers: string[];
  description: string;
}

export const DNS_PRESETS: DnsPresetInfo[] = [
  {
    id: 'system',
    label: 'System Default',
    servers: [],
    description: 'Use the operating system resolver (/etc/resolv.conf on Linux).',
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare (1.1.1.1)',
    servers: ['1.1.1.1', '1.0.0.1'],
    description: 'Fast privacy-focused public DNS.',
  },
  {
    id: 'google',
    label: 'Google Public DNS (8.8.8.8)',
    servers: ['8.8.8.8', '8.8.4.4'],
    description: 'Global anycast DNS resolver.',
  },
  {
    id: 'quad9',
    label: 'Quad9 (9.9.9.9)',
    servers: ['9.9.9.9', '149.112.112.112'],
    description: 'Security-filtering non-profit DNS.',
  },
  {
    id: 'opendns',
    label: 'OpenDNS (208.67.222.222)',
    servers: ['208.67.222.222', '208.67.220.220'],
    description: 'Cisco OpenDNS public resolver.',
  },
  {
    id: 'custom',
    label: 'Custom DNS Servers',
    servers: [],
    description: 'Specify one or more IPv4/IPv6 nameservers.',
  },
];

const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6_REGEX = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;

export function isValidDnsServerIp(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  return IPV4_REGEX.test(trimmed) || IPV6_REGEX.test(trimmed);
}

export function parseCustomDnsInput(raw: string): {
  valid: string[];
  invalid: string[];
} {
  const tokens = raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const token of tokens) {
    if (isValidDnsServerIp(token)) {
      if (!valid.includes(token)) valid.push(token);
    } else {
      invalid.push(token);
    }
  }
  return { valid, invalid };
}

export function resolveEffectiveDnsServers(config: NetworkConfig): string[] {
  if (config.dnsPreset === 'system') return [];
  if (config.dnsPreset === 'custom') {
    return (config.customDnsServers || []).filter(isValidDnsServerIp);
  }
  const preset = DNS_PRESETS.find((p) => p.id === config.dnsPreset);
  return preset ? [...preset.servers] : [];
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
