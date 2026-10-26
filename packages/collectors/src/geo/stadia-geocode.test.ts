import type { VendorCallRecord } from '@cs/core';
import { describe, expect, it, vi } from 'vitest';
import live from './stadia-geocode.fixture.json';
import { createStadiaGeocoder, STADIA_GEOCODE_USD } from './stadia-geocode';

const scope = { agencyId: 'a1', clientId: null };
const ledgerOf = () => {
  const calls: VendorCallRecord[] = [];
  return { calls, ledger: { recordLlmCall: async () => {}, recordVendorCall: async (r: VendorCallRecord) => { calls.push(r); } } };
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const asFetch = (f: unknown) => f as typeof globalThis.fetch;

describe('createStadiaGeocoder', () => {
  it('parses first feature', async () => {
    const fetch = vi.fn(async (_u: string | URL | Request, _init?: unknown) => json(live));
    const geocode = createStadiaGeocoder({ apiKey: 'k', fetch: asFetch(fetch), ledger: ledgerOf().ledger });
    const p = await geocode({ city: 'Round Rock', region: 'TX', postalCode: '78664' }, scope);
    expect(p).toEqual({ lat: 30.501927, lng: -97.647251, label: '78664, Round Rock, TX, USA', precision: 'postalcode' });
    const url = new URL(String(fetch.mock.calls[0]![0]));
    expect(url.origin + url.pathname).toBe('https://api.stadiamaps.com/geocoding/v1/search');
    expect(url.searchParams.get('text')).toBe('Round Rock, TX, 78664');
    expect(url.searchParams.get('boundary.country')).toBe('US');
    expect(url.searchParams.get('size')).toBe('1');
    expect((fetch.mock.calls[0]![1] as { timeoutMs?: number }).timeoutMs).toBe(10_000);
  });

  it('maps layers to precision', async () => {
    const of = (layer: string) => json({ features: [{ geometry: { coordinates: [-97, 30] }, properties: { layer, label: 'x' } }] });
    const run = async (layer: string) => (await createStadiaGeocoder({ apiKey: 'k', fetch: asFetch(async () => of(layer)), ledger: ledgerOf().ledger })({ text: 'x' }, scope))!.precision;
    expect(await run('address')).toBe('address');
    expect(await run('venue')).toBe('address');
    expect(await run('locality')).toBe('locality');
  });

  it('returns null on empty', async () => {
    const { ledger, calls } = ledgerOf();
    const geocode = createStadiaGeocoder({ apiKey: 'k', fetch: asFetch(async () => json({ features: [] })), ledger });
    expect(await geocode({ text: 'nowhere' }, scope)).toBeNull();
    expect(calls[0]!.ok).toBe(true);
  });

  it('strips key from errors', async () => {
    const { ledger } = ledgerOf();
    const boom = createStadiaGeocoder({ apiKey: 'SECRETKEY', fetch: asFetch(async () => { throw new Error('failed https://api.stadiamaps.com/x?api_key=SECRETKEY&text=a'); }), ledger });
    const err = await boom({ text: 'a' }, scope).catch((e: Error) => e);
    expect(String((err as Error).message)).not.toContain('SECRETKEY');
    const http = createStadiaGeocoder({ apiKey: 'SECRETKEY', fetch: asFetch(async () => json({}, 503)), ledger });
    const err2 = await http({ text: 'a' }, scope).catch((e: Error) => e);
    expect(String((err2 as Error).message)).toContain('503');
    expect(String((err2 as Error).message)).not.toContain('SECRETKEY');
  });

  it('records a vendor call', async () => {
    const { ledger, calls } = ledgerOf();
    await createStadiaGeocoder({ apiKey: 'k', fetch: asFetch(async () => json(live)), ledger })({ text: 'Round Rock' }, scope);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ agencyId: 'a1', clientId: null, vendor: 'stadia', operation: 'geocode', units: 1, costUsd: STADIA_GEOCODE_USD, ok: true });
  });

  it('ledgers a failure with ok false', async () => {
    const { ledger, calls } = ledgerOf();
    await createStadiaGeocoder({ apiKey: 'k', fetch: asFetch(async () => json({}, 500)), ledger })({ text: 'a' }, scope).catch(() => {});
    expect(calls[0]!.ok).toBe(false);
  });
});
