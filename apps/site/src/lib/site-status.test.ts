// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSiteStatus } from './site-status';

const BODY = { pilotMode: true, counters: { rivalSitesWatched: 120, snapshotsThisWeek: 400, claimsChecked: 90, claimsDropped: null } };

function stubFetch(impl: (...args: unknown[]) => unknown) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('fetchSiteStatus', () => {
  it('parses the 17a shape', async () => {
    const fn = stubFetch(async () => new Response(JSON.stringify(BODY), { status: 200 }));
    expect(await fetchSiteStatus('https://app.test')).toEqual(BODY);
    expect(fn.mock.calls[0]?.[0]).toBe('https://app.test/api/site-status');
    expect(await (async () => {
      stubFetch(async () => new Response(JSON.stringify({ pilotMode: false, counters: null }), { status: 200 }));
      return fetchSiteStatus('https://app.test');
    })()).toEqual({ pilotMode: false, counters: null });
  });

  it('returns null on a bad body, non-2xx or network error', async () => {
    stubFetch(async () => new Response('{"pilotMode":"yes"}', { status: 200 }));
    expect(await fetchSiteStatus('https://app.test')).toBeNull();
    stubFetch(async () => new Response('not json', { status: 200 }));
    expect(await fetchSiteStatus('https://app.test')).toBeNull();
    stubFetch(async () => new Response(JSON.stringify(BODY), { status: 503 }));
    expect(await fetchSiteStatus('https://app.test')).toBeNull();
    stubFetch(async () => {
      throw new TypeError('network');
    });
    expect(await fetchSiteStatus('https://app.test')).toBeNull();
  });

  it('sends no credentials', async () => {
    const fn = stubFetch(async () => new Response(JSON.stringify(BODY), { status: 200 }));
    await fetchSiteStatus('https://app.test');
    expect((fn.mock.calls[0]?.[1] as RequestInit).credentials).toBe('omit');
  });
});
