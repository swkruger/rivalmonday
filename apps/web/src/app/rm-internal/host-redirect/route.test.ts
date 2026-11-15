import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearHostCache, HOST_REDIRECT_HEADER } from '@/server/hosts';
import * as route from './route';

const lookup = vi.hoisted(() => vi.fn());
vi.mock('@/server/env', () => ({ webEnv: () => ({ hostEnv: { appUrl: 'http://localhost:3101', neutralDomain: 'localhost', extraPlatformHosts: [] } }) }));
vi.mock('@/server/db', () => ({ dbs: () => ({ app: {}, service: {} }) }));
vi.mock('@/server/dev-guard', () => ({ activeEnvName: () => 'dev' }));
vi.mock('@cs/db', async (orig) => ({ ...(await orig<typeof import('@cs/db')>()), agencyByHostname: (_db: unknown, h: string) => lookup(h) }));
beforeEach(() => {
  clearHostCache();
  lookup.mockReset();
  lookup.mockImplementation(async (h: string) =>
    h === 'acme.localhost' ? { agencyId: 'a', canonical: false, canonicalOrigin: 'http://reports.acme.com:3101' }
    : h === 'reports.acme.com' ? { agencyId: 'a', canonical: true, canonicalOrigin: 'http://reports.acme.com:3101' } : null);
});

const { GET, HEAD, POST, DELETE } = route;
const req = (headers: Record<string, string> = {}, method = 'GET') => new Request('http://localhost:3101/rm-internal/host-redirect', { method, headers });
const to = (target: string, method = 'GET') => ({ [HOST_REDIRECT_HEADER]: target, method });

describe('internal host redirect route', () => {
  it('307 + no-store to exactly the target: the platform origin, the mcp origin, an agency host (fallback or live custom domain)', async () => {
    for (const target of ['http://localhost:3101/agency/settings?x=1', 'http://mcp.localhost:3101/mcp', 'http://acme.localhost:3101/c/x', 'http://reports.acme.com:3101/c/x?tab=1']) {
      const res = await GET(req({ [HOST_REDIRECT_HEADER]: target }));
      expect(res.status, target).toBe(307);
      expect(res.headers.get('location'), target).toBe(target);
      expect(res.headers.get('cache-control'), target).toBe('no-store');
    }
  });

  it('every redirecting method (a 307 keeps it), and no OPTIONS export', async () => {
    for (const [fn, m] of [[POST, 'POST'], [HEAD, 'HEAD'], [DELETE, 'DELETE']] as const) {
      const { method, ...h } = to('http://localhost:3101/agency', m);
      const res = await fn(req(h, method));
      expect(res.status, m).toBe(307);
      expect(res.headers.get('location'), m).toBe('http://localhost:3101/agency');
    }
    expect('OPTIONS' in route).toBe(false);
  });

  it('a target on no known host → 404 (defence in depth): https://evil.example/, a wrong port or scheme, an unknown <label>.localhost', async () => {
    for (const target of ['https://evil.example/', 'http://localhost:9999/agency', 'https://localhost:3101/agency', 'http://nobody.localhost:3101/c/x']) {
      const res = await GET(req({ [HOST_REDIRECT_HEADER]: target }));
      expect(res.status, target).toBe(404);
      expect(res.headers.get('location'), target).toBeNull();
    }
  });

  it('no target, a relative or non-http target → 404 + no-store', async () => {
    for (const h of [{}, { [HOST_REDIRECT_HEADER]: '/agency' }, { [HOST_REDIRECT_HEADER]: 'javascript:alert(1)' }, { [HOST_REDIRECT_HEADER]: 'not a url' }]) {
      const res = await GET(req(h as Record<string, string>));
      expect(res.status).toBe(404);
      expect(res.headers.get('location')).toBeNull();
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('a host lookup failure → 404', async () => {
    lookup.mockRejectedValueOnce(new Error('down'));
    expect((await GET(req({ [HOST_REDIRECT_HEADER]: 'http://acme.localhost:3101/c/x' }))).status).toBe(404);
  });
});
