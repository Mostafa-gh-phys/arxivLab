import dns from 'node:dns';
import { Resolver } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import { resolveEffectiveDnsServers, type NetworkConfig } from '../shared/network';

export interface DnsFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  dnsServers?: string[];
}

export interface DnsFetchResponse {
  status: number;
  statusText: string;
  headers: http.IncomingHttpHeaders;
  bodyBuffer: Buffer;
  text: () => string;
  json: <T = unknown>() => T;
}

function createCustomLookup(servers: string[]): LookupFunction {
  const resolver = new Resolver();
  resolver.setServers(servers);

  return ((hostname, options, callback) => {
    const family =
      typeof options === 'object' && options !== null ? options.family : options;
    const wantAll = typeof options === 'object' && options !== null && Boolean(options.all);

    const handleAddresses = (addresses: string[], resolvedFamily: 4 | 6) => {
      if (wantAll) {
        callback(
          null,
          addresses.map((address) => ({ address, family: resolvedFamily }))
        );
      } else {
        callback(null, addresses[0], resolvedFamily);
      }
    };

    if (family === 6) {
      resolver
        .resolve6(hostname)
        .then((addrs) => handleAddresses(addrs, 6))
        .catch((err) => callback(err as NodeJS.ErrnoException, '', 6));
      return;
    }

    resolver
      .resolve4(hostname)
      .then((addrs) => {
        if (addrs.length > 0) {
          handleAddresses(addrs, 4);
        } else {
          return resolver.resolve6(hostname).then((v6) => handleAddresses(v6, 6));
        }
      })
      .catch(() => {
        // Fallback to AAAA if A fails, else OS lookup error
        resolver
          .resolve6(hostname)
          .then((v6) => handleAddresses(v6, 6))
          .catch((err) => callback(err as NodeJS.ErrnoException, '', 4));
      });
  }) as LookupFunction;
}

export async function dnsAwareRequest(
  rawUrl: string,
  options: DnsFetchOptions = {},
  redirectCount = 0
): Promise<DnsFetchResponse> {
  if (redirectCount > 5) {
    throw new Error('Too many HTTP redirects while fetching resource.');
  }

  const parsed = new URL(rawUrl);
  const isHttps = parsed.protocol === 'https:';
  const transport = isHttps ? https : http;
  const servers = options.dnsServers || [];
  const timeoutMs = options.timeoutMs ?? 15000;

  const isLoopback =
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === 'localhost' ||
    parsed.hostname === '::1';

  const lookup = !isLoopback && servers.length > 0 ? createCustomLookup(servers) : undefined;

  const bodyBuffer =
    options.body !== undefined ? Buffer.from(options.body, 'utf-8') : undefined;
  const headers: Record<string, string> = { ...(options.headers || {}) };
  if (
    bodyBuffer !== undefined &&
    !Object.keys(headers).some((k) => k.toLowerCase() === 'content-length')
  ) {
    headers['Content-Length'] = String(bodyBuffer.byteLength);
  }

  return new Promise<DnsFetchResponse>((resolve, reject) => {
    const req = transport.request(
      parsed,
      {
        method: options.method || 'GET',
        headers,
        timeout: timeoutMs,
        ...(lookup ? { lookup } : {}),
      },
      (res) => {
        const status = res.statusCode || 0;
        const location = res.headers.location;
        if (
          location &&
          status >= 300 &&
          status < 400 &&
          (options.method || 'GET').toUpperCase() === 'GET'
        ) {
          res.resume();
          const nextUrl = new URL(location, parsed).toString();
          dnsAwareRequest(nextUrl, options, redirectCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          const responseBuffer = Buffer.concat(chunks);
          resolve({
            status,
            statusText: res.statusMessage || '',
            headers: res.headers,
            bodyBuffer: responseBuffer,
            text: () => responseBuffer.toString('utf-8'),
            json: <T = unknown>() => JSON.parse(responseBuffer.toString('utf-8')) as T,
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms (${parsed.hostname})`));
    });
    req.on('error', reject);

    if (bodyBuffer !== undefined) {
      req.write(bodyBuffer);
    }
    req.end();
  });
}

export function getDnsServersForTarget(
  network: NetworkConfig,
  target: 'arxiv' | 'zotero'
): string[] {
  if (target === 'arxiv' && !network.useCustomDnsForArxiv) return [];
  if (target === 'zotero' && !network.useCustomDnsForZotero) return [];
  return resolveEffectiveDnsServers(network);
}

export interface DnsProbeResult {
  hostname: string;
  addresses: string[];
  latencyMs: number;
  ok: boolean;
  error?: string;
}

export async function testDnsResolution(
  network: NetworkConfig,
  hostnames: string[] = ['export.arxiv.org', 'api.zotero.org']
): Promise<{
  serversUsed: string[];
  results: DnsProbeResult[];
}> {
  const servers = resolveEffectiveDnsServers(network);
  const results: DnsProbeResult[] = [];

  for (const hostname of hostnames) {
    const start = Date.now();
    try {
      if (servers.length > 0) {
        const resolver = new Resolver();
        resolver.setServers(servers);
        const addresses = await resolver.resolve4(hostname);
        results.push({
          hostname,
          addresses,
          latencyMs: Math.max(1, Date.now() - start),
          ok: addresses.length > 0,
        });
      } else {
        const lookupRes = await dns.promises.lookup(hostname, { all: true });
        results.push({
          hostname,
          addresses: lookupRes.map((r) => r.address),
          latencyMs: Math.max(1, Date.now() - start),
          ok: lookupRes.length > 0,
        });
      }
    } catch (err: unknown) {
      results.push({
        hostname,
        addresses: [],
        latencyMs: Math.max(1, Date.now() - start),
        ok: false,
        error: (err as Error).message,
      });
    }
  }

  return {
    serversUsed: servers.length > 0 ? servers : ['System Default'],
    results,
  };
}
