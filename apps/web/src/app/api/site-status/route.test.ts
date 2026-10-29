import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ status: vi.fn() }));
vi.mock('@cs/tools', () => ({ siteStatus: (...a: unknown[]) => m.status(...a) }));
vi.mock('@/server/tools', () => ({ toolDeps: () => ({ service: 'svc' }) }));
const { GET, dynamic } = await import('./route');

beforeEach(() => { m.status.mockReset(); });

describe('GET /api/site-status', () => {
  it('sets cache and ACAO headers', async () => {
    const body = { pilotMode: true, counters: { rivalSitesWatched: 80, snapshotsThisWeek: null, claimsChecked: null, claimsDropped: null } };
    m.status.mockResolvedValue(body);
    const res = await GET();
    expect(dynamic).toBe('force-dynamic');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=300, stale-while-revalidate=60');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await res.json()).toEqual(body);
    expect(m.status.mock.calls[0]![0]).toBe('svc');
  });

  it('counters null when the query throws', async () => {
    // siteStatus swallows query errors itself; the route must still answer with the null shape if it ever throws.
    m.status.mockImplementation(() => { throw new Error('boom'); });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await GET();
    spy.mockRestore();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pilotMode: false, counters: null });
  });
});
