import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ status: vi.fn() }));
vi.mock('@cs/tools', () => ({ siteStatus: (...a: unknown[]) => m.status(...a) }));
vi.mock('@/server/tools', () => ({ toolDeps: () => ({ service: 'svc' }) }));
const { GET, dynamic } = await import('./route');

let clock = Date.parse('2026-10-28T12:00:00Z');
beforeEach(() => {
  m.status.mockReset();
  vi.useFakeTimers();
  clock += 10 * 60_000; // past the 60 s memo of the previous test
  vi.setSystemTime(clock);
});
afterEach(() => vi.useRealTimers());

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

  it('memoises a good answer for 60 s, then asks again', async () => {
    const body = { pilotMode: true, counters: { rivalSitesWatched: 80, snapshotsThisWeek: null, claimsChecked: null, claimsDropped: null } };
    m.status.mockResolvedValue(body);
    await GET();
    vi.setSystemTime(clock + 59_000);
    await GET();
    expect(m.status).toHaveBeenCalledTimes(1);
    vi.setSystemTime(clock + 61_000);
    await GET();
    expect(m.status).toHaveBeenCalledTimes(2);
  });

  it('degraded answer (counters null) is no-store and not memoised', async () => {
    m.status.mockResolvedValue({ pilotMode: true, counters: null });
    const res = await GET();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    await GET();
    expect(m.status).toHaveBeenCalledTimes(2);
  });
});
