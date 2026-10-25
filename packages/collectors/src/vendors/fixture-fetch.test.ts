import type { VendorCallRecord } from '@cs/core';
import { timedFetch } from '@cs/core/server';
import { describe, expect, it } from 'vitest';
import { searchGoogleAdvertisers } from './dataforseo-advertisers';
import { createDataForSeo, DFS_SANDBOX_URL } from './dataforseo';
import { createFixtureFetch, fixturePlaceId, zeroFixtureVendorCosts } from './fixture-fetch';
import { fetchMetaAdsScrapeCreators } from './scrapecreators';
import { fetchMetaAdsApify } from './apify';
import { searchMetaPages } from './meta-search';
import { createStadiaStaticClient } from '../rankings/static-map';
import { fetchGbpProfile } from '../gbp/collect-gbp';
import { mapsSearch } from '../local/maps';

const scope = { agencyId: null, clientId: null };
function ledger() {
  const records: VendorCallRecord[] = [];
  return { records, sink: { recordLlmCall: async () => {}, recordVendorCall: async (r: VendorCallRecord) => { records.push(r); } } };
}
const instant = () => createFixtureFetch({ latencyMs: () => 0 });

describe('createFixtureFetch', () => {
  it('DataForSEO round trip echoes tag and costs 0', async () => {
    const l = ledger();
    const ff = instant();
    const dfs = createDataForSeo({ login: 'fixture', password: 'fixture', ledger: l.sink, fetch: timedFetch(ff) });
    const placeId = fixturePlaceId('Acme Heating & Air');
    const [posted] = await dfs.post('/business_data/google/reviews/task_post', [{ place_id: placeId, location_code: 2840, language_code: 'en', depth: 100, sort_by: 'newest', tag: 'comp-1' }], scope);
    expect(posted).toMatchObject({ statusCode: 20100, tag: 'comp-1' });

    const [ready] = await dfs.get('/business_data/google/reviews/tasks_ready', scope);
    expect(ready!.result.map((r) => (r as { id: string }).id)).toEqual([posted!.id]);

    const [got] = await dfs.get(`/business_data/google/reviews/task_get/${posted!.id}`, scope);
    expect(got).toMatchObject({ id: posted!.id, statusCode: 20000, tag: 'comp-1' });
    const result = got!.result[0] as { title: string; place_id: string; items: { review_id: string }[] };
    expect(result.title).toBe('Acme Heating & Air');
    expect(result.place_id).toBe(placeId);
    expect(result.items.length).toBeGreaterThan(0);

    // Static across calls: the same task_get answers the same reviews; a fetched task leaves tasks_ready.
    const [again] = await dfs.get(`/business_data/google/reviews/task_get/${posted!.id}`, scope);
    expect(again!.result).toEqual(got!.result);
    const [readyAfter] = await dfs.get('/business_data/google/reviews/tasks_ready', scope);
    expect(readyAfter!.result).toEqual([]);

    expect(l.records.map((r) => r.costUsd)).toEqual([0, 0, 0, 0, 0]);
    expect(l.records.every((r) => r.ok)).toBe(true);
  });

  it('task_get works on a fresh fixture fetch instance for an id posted by another instance', async () => {
    const before = createDataForSeo({ login: 'f', password: 'f', ledger: ledger().sink, fetch: timedFetch(instant()) });
    const [posted] = await before.post('/business_data/google/reviews/task_post', [{ place_id: fixturePlaceId('Acme Heating'), location_code: 2840, language_code: 'en', depth: 100, sort_by: 'newest', tag: 'comp-7' }], scope);
    const [again] = await before.post('/business_data/google/reviews/task_post', [{ place_id: fixturePlaceId('Acme Heating'), tag: 'comp-7' }], scope);
    expect(again!.id).not.toBe(posted!.id); // vendor_task.external_task_id is unique
    // "Restart": a new instance answers task_get by id; its tasks_ready only lists tasks it was posted itself.
    const after = createDataForSeo({ login: 'f', password: 'f', ledger: ledger().sink, fetch: timedFetch(instant()) });
    const [got] = await after.get(`/business_data/google/reviews/task_get/${posted!.id}`, scope);
    expect(got).toMatchObject({ id: posted!.id, statusCode: 20000, tag: 'comp-7' });
    expect((got!.result[0] as { title: string }).title).toBe('Acme Heating');
    const [ready] = await after.get('/business_data/google/reviews/tasks_ready', scope);
    expect(ready!.result).toEqual([]);
    // An id of the wrong kind or a garbage id is a task-level 40400.
    const [wrongKind] = await after.get(`/serp/google/jobs/task_get/advanced/${posted!.id}`, scope);
    expect(wrongKind!.statusCode).toBe(40400);
    const [garbage] = await after.get('/business_data/google/reviews/task_get/fx_not-json', scope);
    expect(garbage!.statusCode).toBe(40400);
  });

  it('jobs task_get keeps the posted keyword as the employer name (sandbox host too)', async () => {
    const dfs = createDataForSeo({ login: 'f', password: 'f', baseUrl: DFS_SANDBOX_URL, ledger: ledger().sink, fetch: timedFetch(instant()) });
    const [t] = await dfs.post('/serp/google/jobs/task_post', [{ keyword: 'Acme Heating', location_code: 2840, language_code: 'en', depth: 20, tag: 'c9' }], scope);
    const [g] = await dfs.get(`/serp/google/jobs/task_get/advanced/${t!.id}`, scope);
    const items = (g!.result[0] as { items: { employer_name: string; job_id: string }[] }).items;
    expect(g!.tag).toBe('c9');
    expect(items.every((i) => i.employer_name === 'Acme Heating')).toBe(true);
  });

  it('live endpoints are templated by keyword / place and identical across calls', async () => {
    const ff = instant();
    const dfs = createDataForSeo({ login: 'f', password: 'f', ledger: ledger().sink, fetch: timedFetch(ff) });
    const profile = await fetchGbpProfile(dfs, { placeId: fixturePlaceId('Bright Smile Dental') }, scope);
    expect(profile).toMatchObject({ title: 'Bright Smile Dental', placeId: fixturePlaceId('Bright Smile Dental') });
    const a = await mapsSearch(dfs, { keyword: 'Bright Smile Dental', lat: 30.1, lng: -97.7 }, scope);
    const b = await mapsSearch(dfs, { keyword: 'Bright Smile Dental', lat: 30.1, lng: -97.7 }, scope);
    expect(a.places[0]!.title).toBe('Bright Smile Dental');
    expect(a.raw).toEqual(b.raw);
    const advertisers = await searchGoogleAdvertisers(dfs, { name: 'Bright Smile Dental', lat: 30.1, lng: -97.7 }, scope);
    expect(advertisers[0]).toMatchObject({ name: 'Bright Smile Dental' });
    const [pinned] = await dfs.post('/serp/google/ads_search/live/advanced', [{ advertiser_ids: [advertisers[0]!.id], location_code: 2840, depth: 120 }], scope);
    const ads = (pinned!.result[0] as { items: { advertiser_id: string }[] }).items;
    expect(ads.length).toBeGreaterThan(0);
    expect(ads.every((i) => i.advertiser_id === advertisers[0]!.id)).toBe(true);
  });

  it('Meta ads (ScrapeCreators, Apify, keyword search) answer at $0 for the requested page', async () => {
    const l = ledger();
    const fetch = timedFetch(instant());
    const sc = await fetchMetaAdsScrapeCreators({ apiKey: 'fixture', ledger: l.sink, fetch }, '1234567', scope);
    expect(sc.truncated).toBe(false);
    expect(sc.items.length).toBeGreaterThan(0);
    expect(sc.items.every((i) => (i as { page_id: string }).page_id === '1234567')).toBe(true);
    const ap = await fetchMetaAdsApify({ token: 'fixture', ledger: l.sink, fetch }, '1234567', scope);
    expect(ap.items).toEqual(sc.items);
    const search = await searchMetaPages({ apiKey: 'fixture', ledger: l.sink, fetch }, { name: 'Acme Heating', country: 'US' }, scope);
    expect(search.pages?.[0]).toMatchObject({ pageName: 'Acme Heating' });
  });

  it('Stadia answers a PNG', async () => {
    const maps = createStadiaStaticClient({ apiKey: 'fixture', ledger: ledger().sink, fetch: timedFetch(instant()) });
    const png = await maps.fetchStatic({ center: { lat: 30, lng: -97 }, zoom: 12, width: 600, height: 400 }, scope);
    expect([...png.slice(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
  });

  it('unknown URL → 599', async () => {
    const ff = instant();
    expect((await ff('https://example.com/anything')).status).toBe(599);
    expect((await ff('https://api.dataforseo.com/v3/serp/bing/organic/live/advanced', { method: 'POST', body: '[]' })).status).toBe(599);
    expect((await ff('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: '{}' })).status).toBe(599);
  });

  it('waits latencyMs before a known answer (an unknown URL answers at once)', async () => {
    const ff = createFixtureFetch({ latencyMs: () => 30 });
    const t0 = Date.now();
    await ff('https://tiles.stadiamaps.com/static_cacheable/osm_bright.png?center=1,1');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(25);
  });
});

describe('zeroFixtureVendorCosts', () => {
  it('records faked vendors at $0 and passes everything else through', async () => {
    const l = ledger();
    const z = zeroFixtureVendorCosts(l.sink);
    const base = { ...scope, operation: 'op', units: 1, latencyMs: 1, ok: true };
    await z.recordVendorCall({ ...base, vendor: 'stadia', costUsd: 0.06 });
    await z.recordVendorCall({ ...base, vendor: 'apify', costUsd: 0.02 });
    await z.recordVendorCall({ ...base, vendor: 'postmark', costUsd: 0.001 });
    expect(l.records.map((r) => [r.vendor, r.costUsd])).toEqual([['stadia', 0], ['apify', 0], ['postmark', 0.001]]);
  });
});
