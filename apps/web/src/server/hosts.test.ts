import type { HostEnv } from '@cs/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearHostCache, type HostInfo, hostnameOf, requestOriginFor, resolveHost, routeForHost } from './hosts';

const env: HostEnv = { appUrl: 'https://app.example', neutralDomain: 'neutral.example', extraPlatformHosts: ['web-abc.vercel.app'] };
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const PLATFORM = 'https://app.example';
const agencyHit = { agencyId: A, canonical: true, canonicalOrigin: 'https://acme.neutral.example' };
const agency: HostInfo = { kind: 'agency', ...agencyHit };

function resolver(map: Record<string, typeof agencyHit | null> = {}, e: HostEnv = env) {
  const lookup = vi.fn(async (h: string) => map[h] ?? null);
  let t = 1_000_000;
  const clock = { set: (v: number) => void (t = v) };
  const run = (host: string | null) => resolveHost(host, { env: e, envName: 'dev', lookup, now: () => t });
  return { lookup, clock, run };
}
const route = (host: HostInfo | null, pathname: string, method = 'GET', search = '') => routeForHost(host, { pathname, search, method }, PLATFORM);

beforeEach(() => clearHostCache());

describe('resolveHost', () => {
  it('platform, mcp, fallback agency, live custom, unknown', async () => {
    const custom = { agencyId: B, canonical: true, canonicalOrigin: 'https://reports.bravo.com' };
    const { run, lookup } = resolver({ 'acme.neutral.example': agencyHit, 'reports.bravo.com': custom });
    expect(await run('app.example')).toEqual({ kind: 'platform' });
    expect(await run('mcp.neutral.example')).toEqual({ kind: 'mcp' });
    expect(await run('acme.neutral.example')).toEqual({ kind: 'agency', ...agencyHit });
    expect(await run('reports.bravo.com')).toEqual({ kind: 'agency', ...custom });
    expect(await run('nobody.example')).toBeNull();
    expect(await run(null)).toBeNull();
    expect(lookup).not.toHaveBeenCalledWith('app.example');
    expect(lookup).not.toHaveBeenCalledWith('mcp.neutral.example');
  });

  it('VERCEL_URL host is platform', async () => {
    const { run, lookup } = resolver();
    expect(await run('web-abc.vercel.app')).toEqual({ kind: 'platform' });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('staging: <slug>.staging.rivalmonday.app is agency, staging.rivalmonday.app is platform, mcp.staging.rivalmonday.app is mcp', async () => {
    const staging: HostEnv = { appUrl: 'https://staging.rivalmonday.app', neutralDomain: 'staging.rivalmonday.app', extraPlatformHosts: [] };
    const hit = { agencyId: A, canonical: true, canonicalOrigin: 'https://acme.staging.rivalmonday.app' };
    const { run } = resolver({ 'acme.staging.rivalmonday.app': hit }, staging);
    expect(await run('acme.staging.rivalmonday.app')).toEqual({ kind: 'agency', ...hit });
    expect(await run('staging.rivalmonday.app')).toEqual({ kind: 'platform' });
    expect(await run('mcp.staging.rivalmonday.app')).toEqual({ kind: 'mcp' });
  });

  it('cache hit within 60 s skips lookup, refreshes after', async () => {
    const { run, lookup, clock } = resolver({ 'acme.neutral.example': agencyHit });
    await run('acme.neutral.example');
    clock.set(1_000_000 + 59_999);
    await run('acme.neutral.example');
    expect(lookup).toHaveBeenCalledTimes(1);
    clock.set(1_000_000 + 60_000);
    await run('acme.neutral.example');
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('negative result cached', async () => {
    const { run, lookup } = resolver();
    expect(await run('nobody.example')).toBeNull();
    expect(await run('NOBODY.example:443')).toBeNull();
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('a failed lookup throws and is not cached (the next request retries)', async () => {
    const { run, lookup } = resolver({ 'acme.neutral.example': agencyHit });
    lookup.mockRejectedValueOnce(new Error('db down'));
    await expect(run('acme.neutral.example')).rejects.toThrow('db down');
    expect(await run('acme.neutral.example')).toEqual({ kind: 'agency', ...agencyHit });
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('cache never exceeds 2000 entries', async () => {
    const { run, lookup } = resolver();
    for (let i = 0; i < 2001; i++) await run(`h${i}.example`);
    expect(lookup).toHaveBeenCalledTimes(2001);
    // The oldest entry was evicted (looked up again); the newest is still cached.
    await run('h2000.example');
    expect(lookup).toHaveBeenCalledTimes(2001);
    await run('h0.example');
    expect(lookup).toHaveBeenCalledTimes(2002);
    // Re-adding h0 evicted h1; h2..h2000 (1999 entries) plus h0 = 2000.
    await run('h1.example');
    expect(lookup).toHaveBeenCalledTimes(2003);
  });
});

describe('hostnameOf', () => {
  it('hostnameOf strips port and trailing dot, rejects junk', () => {
    expect(hostnameOf('Acme.Neutral.Example:3101')).toBe('acme.neutral.example');
    expect(hostnameOf('acme.neutral.example.')).toBe('acme.neutral.example');
    expect(hostnameOf('acme.neutral.example.:443')).toBe('acme.neutral.example');
    expect(hostnameOf(' localhost ')).toBe('localhost');
    for (const junk of [null, '', 'a b', 'evil.com/x', 'user@evil.com', '[::1]:80', 'a.com:123456', 'a.com:x', 'é.com']) expect(hostnameOf(junk), String(junk)).toBeNull();
  });
});

describe('routeForHost', () => {
  it('unknown host → not_found except /health', () => {
    expect(route(null, '/health')).toEqual({ kind: 'next' });
    for (const p of ['/', '/sign-in', '/c/x', '/api/auth/x', '/healthz']) expect(route(null, p), p).toEqual({ kind: 'not_found' });
  });

  it('mcp host allows only its paths', () => {
    const mcp: HostInfo = { kind: 'mcp' };
    for (const p of ['/mcp', '/oauth/consent', '/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource/mcp', '/api/auth/oauth2/token', '/sign-in', '/sign-in/check-email', '/_next/static/x.js', '/link-expired', '/neutral-icon.svg', '/health']) {
      expect(route(mcp, p), p).toEqual({ kind: 'next' });
    }
    for (const p of ['/', '/agency', '/c/x', '/mcp/x', '/start/acme', '/.well-known/other', '/files/logo/x/y.png', '/sign-up']) expect(route(mcp, p), p).toEqual({ kind: 'not_found' });
  });

  it('/neutral-icon.svg allowed on mcp', () => {
    expect(route({ kind: 'mcp' }, '/neutral-icon.svg')).toEqual({ kind: 'next' });
  });

  it('/brand/* is 404 off-platform', () => {
    const agency: HostInfo = { kind: 'agency', agencyId: 'a', canonical: true, canonicalOrigin: 'https://a.neutral.example' };
    for (const h of [agency, { kind: 'mcp' } as HostInfo]) for (const p of ['/brand/rm-mark.svg', '/brand/x']) expect(route(h, p), p).toEqual({ kind: 'not_found' });
    expect(route({ kind: 'platform' }, '/brand/rm-mark.svg')).toEqual({ kind: 'next' });
    expect(route(agency, '/neutral-icon.svg')).toEqual({ kind: 'next' });
  });

  it('/favicon.ico 404 on agency and mcp hosts, next on platform', () => {
    const agency: HostInfo = { kind: 'agency', agencyId: 'a', canonical: true, canonicalOrigin: 'https://a.neutral.example' };
    expect(route(agency, '/favicon.ico')).toEqual({ kind: 'not_found' });
    expect(route({ kind: 'mcp' }, '/favicon.ico')).toEqual({ kind: 'not_found' });
    expect(route({ kind: 'platform' }, '/favicon.ico')).toEqual({ kind: 'next' });
  });

  it('platform host passes everything else', () => {
    for (const p of ['/', '/agency/x', '/start', '/bot', '/mcpx', '/oauthx', '/sign-in', '/api/auth/get-session']) expect(route({ kind: 'platform' }, p), p).toEqual({ kind: 'next' });
  });

  it('platform /mcp is 404 (Task 8: MCP, its OAuth pages and metadata live only on the mcp host)', () => {
    for (const p of ['/mcp', '/mcp/', '/mcp/x', '/oauth/consent', '/oauth', '/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-authorization-server/api/auth']) {
      expect(route({ kind: 'platform' }, p, 'POST'), p).toEqual({ kind: 'not_found' });
    }
  });

  it('agency host denies /mcp, /sign-up, /join, /u/x, /bot, /api/stripe/webhook, /api/postmark/webhook, /api/waitlist, /api/site-status, /waitlist/confirm/x, /sample/x, /start', () => {
    for (const p of ['/mcp', '/sign-up', '/join', '/join/rm_inv_x', '/u/x', '/bot', '/api/stripe/webhook', '/api/stripe/connect-webhook', '/api/postmark/webhook', '/api/waitlist', '/api/site-status', '/waitlist/confirm/x', '/sample/x', '/start', '/start/', '/.well-known/oauth-authorization-server', '/oauth/consent', '/support/end', '/dev-panel/env']) {
      expect(route(agency, p), p).toEqual({ kind: 'not_found' });
    }
  });

  it('agency host allows /start/acme, /start/v/x, /start/verify/x, /api/ask/turn, /files/evidence/c/e, /c/x/setup', () => {
    for (const p of ['/start/acme', '/start/v/x', '/start/verify/x', '/api/ask/turn', '/files/evidence/c/e', '/c/x/setup', '/sign-in', '/dev-panel/sign-in/tok', '/l/tok', '/']) {
      expect(route(agency, p), p).toEqual({ kind: 'next' });
    }
    expect(route(agency, '/api/ask/turn', 'POST')).toEqual({ kind: 'next' });
  });

  it('agency host redirects /agency/x?y and /onboarding/steps to the platform, but not /onboarding/client-done.webp', () => {
    expect(route(agency, '/agency/x', 'GET', '?y')).toEqual({ kind: 'redirect', to: 'https://app.example/agency/x?y' });
    expect(route(agency, '/onboarding/steps')).toEqual({ kind: 'redirect', to: 'https://app.example/onboarding/steps' });
    expect(route(agency, '/onboarding')).toEqual({ kind: 'redirect', to: 'https://app.example/onboarding' });
    expect(route(agency, '/platform/agencies')).toEqual({ kind: 'redirect', to: 'https://app.example/platform/agencies' });
    expect(route(agency, '/onboarding/client-done.webp')).toEqual({ kind: 'next' });
    expect(route(agency, '/agencyx')).toEqual({ kind: 'next' });
  });

  it("another agency's logo → not_found, own logo → next, /files/logo/clients/x/y → next", () => {
    expect(route(agency, `/files/logo/${B}/logo.png`)).toEqual({ kind: 'not_found' });
    expect(route(agency, `/files/logo/${A}/logo.png`)).toEqual({ kind: 'next' });
    expect(route(agency, '/files/logo/clients/x/y')).toEqual({ kind: 'next' });
  });

  it('non-canonical GET → canonical origin, POST → next', () => {
    const fallback: HostInfo = { kind: 'agency', agencyId: A, canonical: false, canonicalOrigin: 'https://reports.acme.com' };
    expect(route(fallback, '/c/x', 'GET', '?a=1')).toEqual({ kind: 'redirect', to: 'https://reports.acme.com/c/x?a=1' });
    expect(route(fallback, '/c/x', 'HEAD')).toEqual({ kind: 'redirect', to: 'https://reports.acme.com/c/x' });
    expect(route(fallback, '/c/x', 'POST')).toEqual({ kind: 'next' });
    // Staff paths go to the platform, never to the custom host.
    expect(route(fallback, '/agency', 'GET')).toEqual({ kind: 'redirect', to: 'https://app.example/agency' });
  });
});

describe('requestOriginFor', () => {
  it('platform → APP_URL origin, mcp → mcp origin, agency → the validated hostname with APP_URL scheme and port', () => {
    const dev: HostEnv = { appUrl: 'http://localhost:3101', neutralDomain: 'localhost', extraPlatformHosts: ['web-abc.vercel.app'] };
    expect(requestOriginFor({ kind: 'platform' }, 'web-abc.vercel.app', dev)).toBe('http://localhost:3101');
    expect(requestOriginFor({ kind: 'mcp' }, 'mcp.localhost', dev)).toBe('http://mcp.localhost:3101');
    expect(requestOriginFor(agency, 'acme.localhost', dev)).toBe('http://acme.localhost:3101');
    expect(requestOriginFor(agency, 'reports.acme.com', env)).toBe('https://reports.acme.com');
  });
});
