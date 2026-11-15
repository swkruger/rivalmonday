import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';
import { clearHostCache, HOST_REDIRECT_HEADER, HOST_REDIRECT_PATH } from './server/hosts';

const AGENCY = '11111111-1111-4111-8111-111111111111';
const lookup = vi.hoisted(() => vi.fn());
vi.mock('./server/env', () => ({ webEnv: () => ({ hostEnv: { appUrl: 'https://app.example', neutralDomain: 'neutral.example', extraPlatformHosts: [] } }) }));
vi.mock('./server/db', () => ({ dbs: () => ({ app: {}, service: {} }) }));
vi.mock('@cs/db', async (orig) => ({ ...(await orig<typeof import('@cs/db')>()), agencyByHostname: (_db: unknown, h: string) => lookup(h) }));
beforeEach(() => {
  clearHostCache();
  lookup.mockReset();
  lookup.mockImplementation(async (h: string) =>
    h === 'acme.neutral.example' ? { agencyId: AGENCY, canonical: true, canonicalOrigin: 'https://acme.neutral.example' }
    : h === 'old.neutral.example' ? { agencyId: AGENCY, canonical: false, canonicalOrigin: 'https://reports.acme.com' } : null);
});

type Init = ConstructorParameters<typeof NextRequest>[1];
const onHost = (host: string, p: string, init?: Init) => {
  const headers = new Headers(init?.headers);
  headers.set('host', host);
  return proxy(new NextRequest(`https://${host}${p}`, { ...init, headers }));
};
const run = (p: string, init?: Init) => onHost('app.example', p, init);

describe('proxy', () => {
  it('lets /api/ask/* through without cookies (the route answers 404 itself)', async () => {
    const res = await run('/api/ask/turn', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('lets both Stripe webhooks through without cookies (they authenticate by signature)', async () => {
    for (const p of ['/api/stripe/webhook', '/api/stripe/connect-webhook']) {
      const res = await run(p, { method: 'POST' });
      expect(res.status, p).toBe(200);
      expect(res.headers.get('location'), p).toBeNull();
    }
    expect((await run('/api/stripe/connect-webhook/x')).headers.get('location')).toContain('/sign-in');
  });

  it('lets the Phase 10 public pages through without cookies, but not /onboarding', async () => {
    for (const p of ['/sign-up', '/sign-up/problem', '/join/rm_inv_abc', '/u/token', '/files/logo/abc']) {
      expect((await run(p)).headers.get('location'), p).toBeNull();
    }
    for (const p of ['/onboarding', '/onboarding/start', '/signup', '/joinx']) expect((await run(p)).headers.get('location'), p).toContain('/sign-in');
  });

  it('lets the public onboarding images through without cookies (the next/image optimizer fetches them cookie-less)', async () => {
    for (const p of ['/onboarding/client-done.webp', '/onboarding/signup.webp']) expect((await run(p)).headers.get('location'), p).toBeNull();
    for (const p of ['/onboarding/start', '/onboarding/x.webp/y', '/onboarding/sub/x.webp']) expect((await run(p)).headers.get('location'), p).toContain('/sign-in');
  });

  it('lets the Phase 11c public intake pages through without cookies', async () => {
    for (const p of ['/start', '/start/smith-co', '/start/verify/tok', '/start/verify', '/start/v/11111111-1111-4111-8111-111111111111']) {
      expect((await run(p)).headers.get('location'), p).toBeNull();
    }
    for (const p of ['/startx', '/starter']) expect((await run(p)).headers.get('location'), p).toContain('/sign-in');
  });

  it('lets the Phase 17a waitlist and sample paths through without cookies, with no referrer on token URLs', async () => {
    for (const p of ['/api/waitlist', '/api/site-status', '/waitlist/confirm/tok', '/waitlist/confirmed', '/sample/abc']) {
      expect((await run(p)).headers.get('location'), p).toBeNull();
    }
    for (const p of ['/waitlist/confirm/tok', '/sample/abc']) expect((await run(p)).headers.get('referrer-policy'), p).toBe('no-referrer');
    expect((await run('/waitlist/confirmed')).headers.get('referrer-policy')).toBeNull();
    for (const p of ['/api/waitlist/x', '/waitlist', '/samples/a']) expect((await run(p)).headers.get('location'), p).toContain('/sign-in');
  });

  it('sends no referrer from the token-bearing intake URLs (preview and verify link)', async () => {
    for (const p of ['/start/v/11111111-1111-4111-8111-111111111111', '/start/verify/tok']) expect((await run(p)).headers.get('referrer-policy'), p).toBe('no-referrer');
    for (const p of ['/start', '/start/smith-co', '/sign-in']) expect((await run(p)).headers.get('referrer-policy'), p).toBeNull();
  });

  it('still redirects other cookie-less paths to sign-in', async () => {
    for (const p of ['/api/askx', '/c/x/ask', '/api/other']) expect((await run(p)).headers.get('location'), p).toContain('/sign-in');
  });

  it('replaces a client-sent x-rm-path with the real path', async () => {
    for (const p of ['/agency', '/sign-in']) {
      const res = await run(p, { headers: { 'x-rm-path': '/platform/agencies/x', cookie: 'better-auth.session_token=t' } });
      expect(res.headers.get('x-middleware-request-x-rm-path'), p).toBe(p);
    }
  });

  it('lets /bot and /robots.txt through without cookies, but nothing that merely starts like them', async () => {
    for (const p of ['/bot', '/robots.txt']) expect((await run(p)).headers.get('location'), p).toBeNull();
    for (const p of ['/bots', '/botx', '/bot-admin', '/bot/x', '/robots.txt/x']) expect((await run(p)).headers.get('location'), p).toContain('/sign-in');
  });

  it('lets the tab icon through without cookies, so signed-out pages show it too', async () => {
    expect((await run('/icon.svg')).headers.get('location')).toBeNull();
    for (const p of ['/icon.svg/x', '/icons.svg', '/icon']) expect((await run(p)).headers.get('location'), p).toContain('/sign-in');
  });

  it('client-sent x-rm-host-* are replaced', async () => {
    const forged = { 'x-rm-host-kind': 'platform', 'x-rm-host-agency': '22222222-2222-4222-8222-222222222222', 'x-rm-origin': 'https://evil.example', cookie: 'better-auth.session_token=t' };
    const a = await onHost('acme.neutral.example', '/c/x', { headers: forged });
    expect(a.headers.get('x-middleware-request-x-rm-host-kind')).toBe('agency');
    expect(a.headers.get('x-middleware-request-x-rm-host-agency')).toBe(AGENCY);
    expect(a.headers.get('x-middleware-request-x-rm-origin')).toBe('https://acme.neutral.example');
    const p = await run('/agency', { headers: forged });
    expect(p.headers.get('x-middleware-request-x-rm-host-kind')).toBe('platform');
    expect(p.headers.get('x-middleware-request-x-rm-host-agency')).toBeNull();
    expect(p.headers.get('x-middleware-request-x-rm-origin')).toBe('https://app.example');
    const m = await onHost('mcp.neutral.example', '/mcp', { method: 'POST', headers: forged });
    expect(m.headers.get('x-middleware-request-x-rm-host-kind')).toBe('mcp');
    expect(m.headers.get('x-middleware-request-x-rm-host-agency')).toBeNull();
    expect(m.headers.get('x-middleware-request-x-rm-origin')).toBe('https://mcp.neutral.example');
  });

  it('404 for unknown host carries no-store', async () => {
    for (const [host, p] of [['nobody.example', '/'], ['nobody.example', '/sign-in'], ['acme.neutral.example', '/sign-up'], ['mcp.neutral.example', '/agency']]) {
      const res = await onHost(host!, p!);
      expect(res.status, `${host}${p}`).toBe(404);
      expect(res.headers.get('cache-control'), `${host}${p}`).toBe('no-store');
      expect(await res.text()).toBe('Not found');
    }
    expect((await onHost('nobody.example', '/health')).status).toBe(200);
  });

  it('platform /mcp is 404 (and its OAuth pages and metadata), served on the mcp host instead', async () => {
    for (const p of ['/mcp', '/oauth/consent', '/.well-known/oauth-protected-resource', '/.well-known/oauth-authorization-server/api/auth']) {
      const res = await run(p, { method: p === '/mcp' ? 'POST' : 'GET' });
      expect(res.status, p).toBe(404);
      expect(res.headers.get('cache-control'), p).toBe('no-store');
    }
    const m = await onHost('mcp.neutral.example', '/mcp', { method: 'POST' });
    expect(m.status).toBe(200);
    expect(m.headers.get('location')).toBeNull();
  });

  it('agency host /mcp is 404', async () => {
    for (const p of ['/mcp', '/.well-known/oauth-protected-resource', '/oauth/consent']) {
      const res = await onHost('acme.neutral.example', p, { method: p === '/mcp' ? 'POST' : 'GET', headers: { cookie: 'better-auth.session_token=t' } });
      expect(res.status, p).toBe(404);
    }
  });

  it('cross-host redirects are rewritten to the internal redirect route with the target in a proxy-set header (self-hosted Next relativises a middleware Location)', async () => {
    const staff = await onHost('acme.neutral.example', '/agency/clients?x=1', { headers: { cookie: 'better-auth.session_token=t' } });
    expect(staff.headers.get('location')).toBeNull();
    expect(new URL(staff.headers.get('x-middleware-rewrite')!).pathname).toBe(HOST_REDIRECT_PATH);
    expect(staff.headers.get(`x-middleware-request-${HOST_REDIRECT_HEADER}`)).toBe('https://app.example/agency/clients?x=1');
    // POST too (a 307 keeps the method), with no session cookie at all.
    const post = await onHost('acme.neutral.example', '/agency/x', { method: 'POST' });
    expect(post.headers.get(`x-middleware-request-${HOST_REDIRECT_HEADER}`)).toBe('https://app.example/agency/x');
    const canon = await onHost('old.neutral.example', '/c/x?tab=1');
    expect(new URL(canon.headers.get('x-middleware-rewrite')!).pathname).toBe(HOST_REDIRECT_PATH);
    expect(canon.headers.get(`x-middleware-request-${HOST_REDIRECT_HEADER}`)).toBe('https://reports.acme.com/c/x?tab=1');
  });

  it('a client-sent redirect-target header is dropped and never reaches a page', async () => {
    const forged = { [HOST_REDIRECT_HEADER]: 'https://evil.example/x', cookie: 'better-auth.session_token=t' };
    for (const [host, p] of [['app.example', '/agency'], ['acme.neutral.example', '/c/x'], ['acme.neutral.example', '/sign-in']]) {
      const res = await onHost(host!, p!, { headers: forged });
      expect(res.headers.get('x-middleware-rewrite'), `${host}${p}`).toBeNull();
      expect(res.headers.get(`x-middleware-request-${HOST_REDIRECT_HEADER}`), `${host}${p}`).toBeNull();
    }
    // On a redirecting path the proxy's own target wins.
    const staff = await onHost('acme.neutral.example', '/agency', { headers: forged });
    expect(staff.headers.get(`x-middleware-request-${HOST_REDIRECT_HEADER}`)).toBe('https://app.example/agency');
  });

  it('a direct request to the internal redirect path is 404 on every host', async () => {
    for (const host of ['app.example', 'acme.neutral.example', 'mcp.neutral.example', 'nobody.example']) {
      for (const p of [HOST_REDIRECT_PATH, `${HOST_REDIRECT_PATH}/x`, '/rm-internal']) {
        const res = await onHost(host, p, { headers: { [HOST_REDIRECT_HEADER]: 'https://evil.example/', cookie: 'better-auth.session_token=t' } });
        expect(res.status, `${host}${p}`).toBe(404);
        expect(res.headers.get('x-middleware-rewrite'), `${host}${p}`).toBeNull();
      }
    }
  });

  it('/health short-circuits before the host lookup and gets no host headers', async () => {
    for (const host of ['nobody.example', 'acme.neutral.example', 'app.example']) {
      const res = await onHost(host, '/health', { headers: { 'x-rm-host-kind': 'platform', 'x-rm-origin': 'https://evil.example' } });
      expect(res.status, host).toBe(200);
      expect(res.headers.get('x-middleware-request-x-rm-host-kind'), host).toBeNull();
      expect(res.headers.get('x-middleware-request-x-rm-origin'), host).toBeNull();
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it('a host lookup error fails closed: plain 404 + no-store, and the failure is not cached', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      lookup.mockRejectedValueOnce(new Error('connection refused'));
      const res = await onHost('acme.neutral.example', '/c/x', { headers: { cookie: 'better-auth.session_token=t' } });
      expect(res.status).toBe(404);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(await res.text()).toBe('Not found');
      const again = await onHost('acme.neutral.example', '/c/x', { headers: { cookie: 'better-auth.session_token=t' } });
      expect(again.status).toBe(200);
      expect(again.headers.get('x-middleware-request-x-rm-host-agency')).toBe(AGENCY);
      expect(lookup).toHaveBeenCalledTimes(2);
    } finally {
      logged.mockRestore();
    }
  });

  it('keeps the sign-in redirect on the agency host', async () => {
    const res = await onHost('acme.neutral.example', '/c/x');
    expect(new URL(res.headers.get('location')!).origin).toBe('https://acme.neutral.example');
    expect(res.headers.get('location')).toContain('/sign-in');
  });
});
