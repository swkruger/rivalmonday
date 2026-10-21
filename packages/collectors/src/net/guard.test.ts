import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BOT_TOKEN } from '../web/user-agent';
import { assertPublicUrl, createGuardedFetchText, defaultFetchText, guardedFetchText, isPublicAddress, isPublicHttpUrl, type LookupFn, SsrfBlockedError } from './guard';

describe('isPublicHttpUrl', () => {
  it.each(['https://example.com/a', 'http://www.example.co.uk/x?y=1', 'https://8.8.8.8/', 'https://[2606:4700::1111]/'])('allows %s', (u) => {
    expect(isPublicHttpUrl(u)).toBe(true);
  });
  it.each([
    'ftp://example.com', 'file:///etc/passwd', 'data:text/html,x', 'javascript:alert(1)', 'not a url',
    'http://localhost:3000', 'http://foo.localhost', 'http://intranet', 'http://db.internal', 'http://printer.local', 'http://example.com.local.',
    'http://127.0.0.1', 'http://127.1.2.3', 'http://2130706433', 'http://2130706433/', 'http://0x7f.0.0.1', 'http://10.0.0.5', 'http://172.16.0.1', 'http://172.31.255.255', 'http://192.168.1.1',
    // Hex, octal and short IPv4 forms: WHATWG URL parsing normalises them to dotted 127.0.0.1.
    'http://0x7f.1/', 'http://0177.0.0.1/', 'http://127.1/', 'http://0x7f000001/', 'http://017700000001/',
    'http://169.254.169.254/latest/meta-data', 'http://100.64.0.1', 'http://0.0.0.0', 'http://224.0.0.1', 'http://255.255.255.255',
    'http://[::1]/', 'http://[::]/', 'http://[fc00::1]/', 'http://[fd12::1]/', 'http://[fe80::1]/', 'http://[::ffff:127.0.0.1]/', 'http://[::ffff:10.0.0.1]/', 'http://[::ffff:a9fe:a9fe]/', 'http://[ff02::1]/',
    'http://[::ffff:0:127.0.0.1]/', 'http://[::ffff:0:8.8.8.8]/', 'http://[64:ff9b::7f00:1]/', 'http://[2002:7f00:1::]/', 'http://[2002:c0a8:101::1]/',
    'https://user:pass@example.com/', 'https://user@example.com/',
  ])('rejects %s', (u) => {
    expect(isPublicHttpUrl(u)).toBe(false);
  });
});

describe('isPublicAddress', () => {
  it.each([
    ['93.184.216.34', true],
    ['8.8.8.8', true],
    ['2606:4700::1111', true],
    ['::ffff:8.8.8.8', true], // IPv4-mapped: judged by its IPv4
    ['64:ff9b::808:808', true], // NAT64 of 8.8.8.8
    ['2002:808:808::1', true], // 6to4 of 8.8.8.8
    ['10.0.0.5', false],
    ['127.0.0.1', false],
    ['0.0.0.0', false],
    ['169.254.169.254', false], // link-local / cloud metadata
    ['100.64.0.1', false], // CGNAT
    ['100.127.255.254', false], // CGNAT upper end
    ['172.16.0.1', false],
    ['192.168.0.1', false],
    ['::1', false],
    ['::', false],
    ['fe80::1', false], // link-local
    ['fe80::1%eth0', false],
    ['fc00::1', false], // ULA
    ['fd12:3456::1', false], // ULA
    ['ff02::1', false], // multicast
    ['::ffff:127.0.0.1', false], // mapped loopback
    ['::ffff:7f00:1', false], // mapped loopback, hex form
    ['::ffff:192.168.0.1', false],
    ['::ffff:0:127.0.0.1', false], // SIIT ::ffff:0:0:0/96
    ['::ffff:0:8.8.8.8', false], // SIIT is never public, whatever it embeds
    ['::ffff:0:7f00:1', false],
    ['::127.0.0.1', false], // IPv4-compatible (deprecated) ::/96
    ['64:ff9b::7f00:1', false], // NAT64 of 127.0.0.1
    ['64:ff9b::a00:5', false], // NAT64 of 10.0.0.5
    ['2002:7f00:1::', false], // 6to4 of 127.0.0.1
    ['2002:a9fe:a9fe::1', false], // 6to4 of 169.254.169.254
    ['64:ff9b:1::a00:5', false], // local-use NAT64 64:ff9b:1::/48
    ['64:ff9b:1:ffff::1', false],
    ['fec0::1', false], // deprecated site-local fec0::/10
    ['feff::1', false],
    ['2001::1', false], // Teredo 2001::/32
    ['2001:0:4136:e378:8000:63bf:3fff:fdd2', false],
    ['2001:db8::1', false], // documentation 2001:db8::/32
    ['2001:db8:ffff::1', false],
    ['2001:4860:4860::8888', true], // a real 2001: address stays public
    ['192.0.2.10', false], // TEST-NET-1
    ['198.51.100.7', false], // TEST-NET-2
    ['203.0.113.200', false], // TEST-NET-3
    ['192.88.99.1', false], // 6to4 relay anycast
    ['192.0.3.1', true],
    ['198.51.101.1', true],
    ['203.0.114.1', true],
    ['2130706433', false], // decimal host is not an address literal
    ['garbage', false],
    ['', false],
  ])('%s → %s', (addr, expected) => {
    expect(isPublicAddress(addr)).toBe(expected);
  });
});

const lookupOf = (addrs: string[] | Error): LookupFn => vi.fn(async () => {
  if (addrs instanceof Error) throw addrs;
  return addrs;
});

describe('assertPublicUrl', () => {
  it('passes a host whose every address is public', async () => {
    await expect(assertPublicUrl('https://example.com/a', lookupOf(['93.184.216.34', '2606:4700::1111']))).resolves.toBeUndefined();
  });

  it('rejects a host resolving to one private + one public address', async () => {
    await expect(assertPublicUrl('https://example.com/a', lookupOf(['93.184.216.34', '10.0.0.5']))).rejects.toBeInstanceOf(SsrfBlockedError);
    await expect(assertPublicUrl('https://example.com/a', lookupOf(['::ffff:127.0.0.1', '93.184.216.34']))).rejects.toMatchObject({ code: 'ssrf_blocked' });
  });

  it('rejects a host with no addresses', async () => {
    await expect(assertPublicUrl('https://example.com/a', lookupOf([]))).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it('rejects a non-public URL without a lookup', async () => {
    const lookup = lookupOf(['93.184.216.34']);
    for (const u of ['http://2130706433/', 'http://127.1/', 'http://[64:ff9b::7f00:1]/', 'file:///etc/passwd', 'http://localhost/']) {
      await expect(assertPublicUrl(u, lookup)).rejects.toBeInstanceOf(SsrfBlockedError);
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it('does not resolve a public IP literal', async () => {
    const lookup = lookupOf(['10.0.0.5']);
    await expect(assertPublicUrl('https://8.8.8.8/', lookup)).resolves.toBeUndefined();
    await expect(assertPublicUrl('https://[2606:4700::1111]/', lookup)).resolves.toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();
  });

  it('lets a lookup failure propagate as an ordinary error, not ssrf_blocked', async () => {
    const err = await assertPublicUrl('https://nx.example/', lookupOf(new Error('ENOTFOUND nx.example'))).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(SsrfBlockedError);
    expect((err as Error).message).toContain('ENOTFOUND');
  });
});

type FakeRes = { status: number; location?: string; body?: string };
function fakeFetch(routes: Record<string, FakeRes>) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    expect(init?.redirect).toBe('manual');
    const r = routes[url];
    if (!r) throw new Error(`unexpected fetch ${url}`);
    return new Response(r.status === 304 ? null : (r.body ?? ''), { status: r.status, headers: r.location ? { location: r.location } : {} });
  });
}
const publicLookup = lookupOf(['93.184.216.34']);
const guardWith = (fetch: ReturnType<typeof fakeFetch>, lookup: LookupFn = publicLookup) =>
  createGuardedFetchText({ fetch: fetch as unknown as typeof globalThis.fetch, assertUrl: (u) => assertPublicUrl(u, lookup) });

describe('guardedFetchText', () => {
  it('follows relative redirects, checking every hop, and reports the final URL', async () => {
    const f = fakeFetch({
      'https://site.example/a': { status: 301, location: '/b' },
      'https://site.example/b': { status: 302, location: 'https://www.site.example/c' },
      'https://www.site.example/c': { status: 200, body: 'hello' },
    });
    const lookup = lookupOf(['93.184.216.34']);
    await expect(guardWith(f, lookup)('https://site.example/a')).resolves.toEqual({ status: 200, body: 'hello', finalUrl: 'https://www.site.example/c' });
    expect(f).toHaveBeenCalledTimes(3);
    expect(lookup).toHaveBeenCalledTimes(3);
    const headers = f.mock.calls[2]![1]!.headers as Record<string, string>;
    expect(headers['user-agent']).toContain(BOT_TOKEN);
    expect(headers.accept).toContain('text/plain');
  });

  it('stops at a redirect to 127.0.0.1', async () => {
    const f = fakeFetch({ 'https://site.example/a': { status: 302, location: 'http://127.0.0.1:8080/admin' } });
    await expect(guardWith(f)('https://site.example/a')).rejects.toBeInstanceOf(SsrfBlockedError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it.each(['http://2130706433/', 'http://[::ffff:127.0.0.1]/', 'http://0x7f.1/', 'http://169.254.169.254/latest/meta-data'])('stops at a redirect to %s', async (to) => {
    const f = fakeFetch({ 'https://site.example/a': { status: 307, location: to } });
    await expect(guardWith(f)('https://site.example/a')).rejects.toBeInstanceOf(SsrfBlockedError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('stops at a redirect to a host that resolves privately', async () => {
    const f = fakeFetch({ 'https://site.example/a': { status: 302, location: 'https://evil.example/' } });
    const lookup: LookupFn = async (host) => (host === 'evil.example' ? ['93.184.216.34', '10.0.0.5'] : ['93.184.216.34']);
    await expect(guardWith(f, lookup)('https://site.example/a')).rejects.toBeInstanceOf(SsrfBlockedError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('refuses a private start URL without fetching', async () => {
    const f = fakeFetch({});
    await expect(guardWith(f)('http://127.0.0.1/')).rejects.toBeInstanceOf(SsrfBlockedError);
    expect(f).not.toHaveBeenCalled();
  });

  it('stops after 5 hops', async () => {
    const routes: Record<string, FakeRes> = {};
    for (let i = 0; i < 10; i++) routes[`https://site.example/${i}`] = { status: 302, location: `/${i + 1}` };
    const f = fakeFetch(routes);
    await expect(guardWith(f)('https://site.example/0')).rejects.toThrow(/redirect/i);
    expect(f).toHaveBeenCalledTimes(6); // the start URL + 5 followed redirects
  });

  it('follows exactly 5 redirects', async () => {
    const routes: Record<string, FakeRes> = {};
    for (let i = 0; i < 5; i++) routes[`https://site.example/${i}`] = { status: 302, location: `/${i + 1}` };
    routes['https://site.example/5'] = { status: 200, body: 'end' };
    await expect(guardWith(fakeFetch(routes))('https://site.example/0')).resolves.toMatchObject({ status: 200, body: 'end', finalUrl: 'https://site.example/5' });
  });

  it('returns a 3xx without a Location as is', async () => {
    const f = fakeFetch({ 'https://site.example/a': { status: 304 } });
    await expect(guardWith(f)('https://site.example/a')).resolves.toEqual({ status: 304, body: '', finalUrl: 'https://site.example/a' });
  });

  it('is the default fetchText', () => {
    expect(defaultFetchText).toBe(guardedFetchText);
  });
});

describe('guardedFetchText against a real socket', () => {
  const BIG_BODY_SIZE = 2 * 1024 * 1024; // 2 MB, well over the 512 KB cap
  const MAX_BODY = 512 * 1024;
  let server: http.Server;
  let baseUrl: string;
  let lastUserAgent: string | undefined;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      lastUserAgent = req.headers['user-agent'];
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('x'.repeat(BIG_BODY_SIZE));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('expected a bound TCP address');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it('refuses the local fixture by default (it is 127.0.0.1)', async () => {
    await expect(guardedFetchText(baseUrl)).rejects.toBeInstanceOf(SsrfBlockedError);
    expect(lastUserAgent).toBeUndefined();
  });

  it('caps the body at 512 KB even when the server sends more, and sends the bot user agent', async () => {
    const permissive = createGuardedFetchText({ assertUrl: async () => {} });
    const result = await permissive(baseUrl);
    expect(result.status).toBe(200);
    expect(result.body.length).toBeLessThanOrEqual(MAX_BODY);
    expect(lastUserAgent).toContain(BOT_TOKEN);
  });
});
