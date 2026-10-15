import type { VendorCallRecord } from '@cs/core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { dfsTask, fakeDfs } from '../../test/fake-dfs';
import { createDataForSeo } from './dataforseo';
import { searchGoogleAdvertisers } from './dataforseo-advertisers';

const env = JSON.parse(readFileSync(fileURLToPath(new URL('../../test/fixtures/vendors/dfs-ads-advertisers-live.json', import.meta.url)), 'utf8')) as { tasks: { result: unknown[] }[] };
const scope = { agencyId: 'ag', clientId: 'cl' };

describe('searchGoogleAdvertisers', () => {
  it('returns only ads_advertiser rows from the live fixture, mapped, and posts keyword + lat,lng', async () => {
    const dfs = fakeDfs(() => [dfsTask(env.tasks[0]!.result)]);
    const out = await searchGoogleAdvertisers(dfs, { name: 'Aire Serv', lat: 31.5, lng: -97.2 }, scope);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]).toEqual({ id: 'AR12961730039652548609', name: 'Aire Care Services', domain: null, verified: true });
    expect(out.every((a) => a.id.startsWith('AR'))).toBe(true);
    expect(dfs.calls[0]).toMatchObject({ method: 'POST', path: '/serp/google/ads_advertisers/live/advanced' });
    expect(dfs.calls[0]!.body![0]).toMatchObject({ keyword: 'Aire Serv', location_coordinate: '31.5,-97.2' });
  });

  it('40102 -> []', async () => {
    const dfs = fakeDfs(() => [dfsTask(null, { statusCode: 40102, statusMessage: 'No Search Results.' })]);
    expect(await searchGoogleAdvertisers(dfs, { name: 'x', lat: 1, lng: 2 }, scope)).toEqual([]);
  });

  it('ledger receives agency and client ids', async () => {
    const records: VendorCallRecord[] = [];
    const ledger = { recordLlmCall: async () => {}, recordVendorCall: async (r: VendorCallRecord) => { records.push(r); } };
    const body = { status_code: 20000, status_message: 'Ok.', cost: 0.01, tasks: [{ id: 't', status_code: 20000, status_message: 'Ok.', result: [] }] };
    const fetch = (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof globalThis.fetch;
    const dfs = createDataForSeo({ login: 'l', password: 'p', ledger, fetch });
    await searchGoogleAdvertisers(dfs, { name: 'x', lat: 1, lng: 2 }, scope);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ agencyId: 'ag', clientId: 'cl', vendor: 'dataforseo' });
  });
});
