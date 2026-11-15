import { describe, expect, it } from 'vitest';
import { HOST_REDIRECT_HEADER } from '@/server/hosts';
import { DELETE, GET, HEAD, POST } from './route';

const req = (headers: Record<string, string> = {}, method = 'GET') => new Request('http://localhost:3101/rm-internal/host-redirect', { method, headers });

describe('internal host redirect route', () => {
  it('307 + no-store to exactly the proxy-set target, absolute', async () => {
    const res = await GET(req({ [HOST_REDIRECT_HEADER]: 'http://localhost:3101/agency/settings?x=1' }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3101/agency/settings?x=1');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('every method (a 307 keeps it)', async () => {
    for (const [fn, m] of [[POST, 'POST'], [HEAD, 'HEAD'], [DELETE, 'DELETE']] as const) {
      const res = await fn(req({ [HOST_REDIRECT_HEADER]: 'https://reports.acme.com/c/x' }, m));
      expect(res.status, m).toBe(307);
      expect(res.headers.get('location'), m).toBe('https://reports.acme.com/c/x');
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
});
