import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatBytes,
  isValidDnsServerIp,
  parseCustomDnsInput,
  resolveEffectiveDnsServers,
} from './network';

test('isValidDnsServerIp validates IPv4 and IPv6 addresses strictly', () => {
  assert.equal(isValidDnsServerIp('1.1.1.1'), true);
  assert.equal(isValidDnsServerIp('8.8.4.4'), true);
  assert.equal(isValidDnsServerIp('2606:4700:4700::1111'), true);
  assert.equal(isValidDnsServerIp('999.1.1.1'), false);
  assert.equal(isValidDnsServerIp('not-an-ip'), false);
  assert.equal(isValidDnsServerIp(''), false);
});

test('parseCustomDnsInput separates valid and invalid servers', () => {
  const parsed = parseCustomDnsInput('1.1.1.1, 8.8.8.8 999.0.0.1 1.1.1.1');
  assert.deepEqual(parsed.valid, ['1.1.1.1', '8.8.8.8']);
  assert.deepEqual(parsed.invalid, ['999.0.0.1']);
});

test('resolveEffectiveDnsServers maps presets and custom servers', () => {
  assert.deepEqual(
    resolveEffectiveDnsServers({
      dnsPreset: 'cloudflare',
      customDnsServers: [],
      useCustomDnsForArxiv: true,
      useCustomDnsForZotero: true,
    }),
    ['1.1.1.1', '1.0.0.1']
  );

  assert.deepEqual(
    resolveEffectiveDnsServers({
      dnsPreset: 'system',
      customDnsServers: ['8.8.8.8'],
      useCustomDnsForArxiv: true,
      useCustomDnsForZotero: true,
    }),
    []
  );

  assert.deepEqual(
    resolveEffectiveDnsServers({
      dnsPreset: 'custom',
      customDnsServers: ['9.9.9.9', 'bad'],
      useCustomDnsForArxiv: true,
      useCustomDnsForZotero: true,
    }),
    ['9.9.9.9']
  );
});

test('formatBytes formats file sizes cleanly', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(1572864), '1.50 MB');
});
