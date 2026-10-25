import type { VendorCallRecord } from '@cs/core';
import { describe, expect, it, vi } from 'vitest';
import { createStadiaStaticClient, RANK_MAP_STYLE, STADIA_CACHEABLE_STATIC_USD } from './static-map';

const PNG = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
const scope = { agencyId: 'a1', clientId: 'c1' };
const q = { center: { lat: 33.9, lng: -84.3 }, zoom: 11, width: 640, height: 480 };
const ledgerOf = () => {
  const calls: VendorCallRecord[] = [];
  return { calls, ledger: { recordLlmCall: async () => {}, recordVendorCall: async (r: VendorCallRecord) => { calls.push(r); } } };
};
const png = () => new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } });
const asFetch = (f: unknown) => f as typeof globalThis.fetch;

describe('createStadiaStaticClient', () => {
  it('passes timeoutMs 10000, not a signal', async () => {
    const fetch = vi.fn(async (_u: string | URL | Request, _init?: unknown) => png());
    await createStadiaStaticClient({ apiKey: 'k', fetch: asFetch(fetch), ledger: ledgerOf().ledger }).fetchStatic(q, scope);
    const init = fetch.mock.calls[0]![1] as { timeoutMs?: number; signal?: unknown };
    expect(init.timeoutMs).toBe(10_000);
    expect(init.signal).toBeUndefined();
  });

  it('URL uses static_cacheable with centre, zoom, size@2x and manual_attribution, never logs the key', async () => {
    const fetch = vi.fn(async (_u: string | URL | Request) => png());
    const { ledger } = ledgerOf();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const bytes = await createStadiaStaticClient({ apiKey: 'SECRETKEY', fetch: asFetch(fetch), ledger }).fetchStatic(q, scope);
      expect(Array.from(bytes)).toEqual(Array.from(PNG));
      const url = new URL(String(fetch.mock.calls[0]![0]));
      expect(url.origin + url.pathname).toBe('https://tiles.stadiamaps.com/static_cacheable/osm_bright.png');
      expect(url.searchParams.get('center')).toBe('33.9,-84.3');
      expect(url.searchParams.get('zoom')).toBe('11');
      expect(url.searchParams.get('size')).toBe('640x480@2x');
      expect(url.searchParams.get('manual_attribution')).toBe('true');
      expect(url.searchParams.get('api_key')).toBe('SECRETKEY');
      expect(JSON.stringify([...log.mock.calls, ...err.mock.calls])).not.toContain('SECRETKEY');
    } finally { log.mockRestore(); err.mockRestore(); }
  });

  it('default style is the Google-like osm_bright (RANK_MAP_STYLE)', () => {
    expect(RANK_MAP_STYLE).toBe('osm_bright');
  });

  it('non-png response throws without the key in the message', async () => {
    const { ledger } = ledgerOf();
    const html = vi.fn(async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    await expect(createStadiaStaticClient({ apiKey: 'SECRETKEY', fetch: asFetch(html), ledger }).fetchStatic(q, scope)).rejects.toThrow(/image\/png/);
    const bad = vi.fn(async () => new Response('no', { status: 401 }));
    const e = await createStadiaStaticClient({ apiKey: 'SECRETKEY', fetch: asFetch(bad), ledger }).fetchStatic(q, scope).catch((x: Error) => x);
    expect((e as Error).message).toMatch(/401/);
    expect((e as Error).message).not.toContain('SECRETKEY');
  });

  it('network errors do not leak the key', async () => {
    const { ledger } = ledgerOf();
    const boom = vi.fn(async () => { throw new Error('fetch failed https://tiles.stadiamaps.com/x?api_key=SECRETKEY'); });
    const e = await createStadiaStaticClient({ apiKey: 'SECRETKEY', fetch: asFetch(boom), ledger }).fetchStatic(q, scope).catch((x: Error) => x);
    expect((e as Error).message).not.toContain('SECRETKEY');
  });

  it('ledgers one stadia call with client scope', async () => {
    const { ledger, calls } = ledgerOf();
    await createStadiaStaticClient({ apiKey: 'k', fetch: asFetch(async () => png()), ledger }).fetchStatic(q, scope);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ vendor: 'stadia', operation: 'static_cacheable', costUsd: STADIA_CACHEABLE_STATIC_USD, agencyId: 'a1', clientId: 'c1', ok: true, units: 1 });
  });
});
