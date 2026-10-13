import { describe, expect, it } from 'vitest';
import { isPublicAddress, isPublicHttpUrl } from './public-url';

describe('isPublicHttpUrl', () => {
  it.each(['https://example.com/a', 'http://www.example.co.uk/x?y=1', 'https://8.8.8.8/', 'https://[2606:4700::1111]/'])('allows %s', (u) => {
    expect(isPublicHttpUrl(u)).toBe(true);
  });
  it.each([
    'ftp://example.com', 'file:///etc/passwd', 'data:text/html,x', 'javascript:alert(1)', 'not a url',
    'http://localhost:3000', 'http://foo.localhost', 'http://intranet', 'http://db.internal', 'http://printer.local', 'http://example.com.local.',
    'http://127.0.0.1', 'http://127.1.2.3', 'http://2130706433', 'http://0x7f.0.0.1', 'http://10.0.0.5', 'http://172.16.0.1', 'http://172.31.255.255', 'http://192.168.1.1',
    'http://169.254.169.254/latest/meta-data', 'http://100.64.0.1', 'http://0.0.0.0', 'http://224.0.0.1', 'http://255.255.255.255',
    'http://[::1]/', 'http://[::]/', 'http://[fc00::1]/', 'http://[fd12::1]/', 'http://[fe80::1]/', 'http://[::ffff:127.0.0.1]/', 'http://[::ffff:10.0.0.1]/', 'http://[::ffff:a9fe:a9fe]/', 'http://[ff02::1]/',
    'https://user:pass@example.com/', 'https://user@example.com/',
  ])('rejects %s', (u) => {
    expect(isPublicHttpUrl(u)).toBe(false);
  });
});

describe('isPublicAddress', () => {
  it('classifies resolved addresses', () => {
    expect(isPublicAddress('93.184.216.34')).toBe(true);
    expect(isPublicAddress('2606:4700::1111')).toBe(true);
    expect(isPublicAddress('::ffff:8.8.8.8')).toBe(true);
    for (const a of ['10.0.0.5', '127.0.0.1', '169.254.169.254', '::1', 'fe80::1', '::ffff:192.168.0.1', 'garbage']) expect(isPublicAddress(a)).toBe(false);
  });
});
