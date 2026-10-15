import { describe, expect, it } from 'vitest';
import { dfsTask, fakeDfs } from '../../test/fake-dfs';
import { mapsSearch, parseMapsItems } from './maps';

const result = [{
  items: [
    { type: 'maps_search', rank_absolute: 1, title: 'Smith HVAC', domain: 'smithhvac.example', url: 'https://smithhvac.example/', place_id: 'p1', cid: '111', rating: { value: 4.6, votes_count: 210 }, category: 'HVAC contractor', address: '1 Main St', latitude: 33.9, longitude: -84.3 },
    { type: 'maps_paid_item', rank_absolute: 2, title: 'Ad Co' },
    { type: 'maps_search', rank_absolute: 3, title: 'No Site Plumbing', place_id: 'p3' },
    { type: 'maps_search', title: 42 },
  ],
}];

describe('parseMapsItems', () => {
  it('keeps organic places, tolerates missing fields, skips malformed items', () => {
    expect(parseMapsItems(result)).toEqual([
      { placeId: 'p1', cid: '111', title: 'Smith HVAC', domain: 'smithhvac.example', url: 'https://smithhvac.example/', rank: 1, rating: 4.6, votes: 210, category: 'HVAC contractor', address: '1 Main St', lat: 33.9, lng: -84.3 },
      { placeId: 'p3', cid: null, title: 'No Site Plumbing', domain: null, url: null, rank: 3, rating: null, votes: null, category: null, address: null, lat: null, lng: null },
    ]);
  });
});

describe('mapsSearch', () => {
  it('queries the live maps endpoint with a coordinate', async () => {
    const dfs = fakeDfs(() => [dfsTask(result)]);
    const r = await mapsSearch(dfs, { keyword: 'ac repair', lat: 33.9, lng: -84.3 }, { agencyId: null, clientId: null });
    expect(r.places).toHaveLength(2);
    expect(dfs.calls[0]).toEqual({
      method: 'POST', path: '/serp/google/maps/live/advanced',
      body: [{ keyword: 'ac repair', location_coordinate: '33.9,-84.3,14z', language_code: 'en', depth: 20 }], scope: { agencyId: null, clientId: null },
    });
  });

  it('throws a typed VendorError when the task itself carries an API-level error', async () => {
    const dfs = fakeDfs(() => [dfsTask([], { statusCode: 40202, statusMessage: 'Too many requests' })]);
    await expect(mapsSearch(dfs, { keyword: 'ac repair', lat: 33.9, lng: -84.3 }, { agencyId: null, clientId: null })).rejects.toMatchObject({
      name: 'VendorError', vendor: 'dataforseo', code: 40202, retryable: true,
    });
  });

  it('40102 -> empty success (nobody ranks here), not a throw', async () => {
    const dfs = fakeDfs(() => [dfsTask(null, { statusCode: 40102, statusMessage: 'No Search Results.' })]);
    expect(await mapsSearch(dfs, { keyword: 'ac repair', lat: 33.9, lng: -84.3 }, { agencyId: null, clientId: null })).toEqual({ places: [], raw: [] });
  });

  it('throws a non-retryable VendorError when no task comes back (never an empty "nobody ranks" result)', async () => {
    const dfs = fakeDfs(() => []);
    await expect(mapsSearch(dfs, { keyword: 'ac repair', lat: 33.9, lng: -84.3 }, { agencyId: null, clientId: null })).rejects.toMatchObject({
      name: 'VendorError', vendor: 'dataforseo', code: null, message: 'empty task', retryable: false,
    });
  });
});

describe('parseMapsItems richer fields', () => {
  it('parses additional categories, phone, claimed flag and coordinates; null categories become []', () => {
    const rich = [{ items: [
      { type: 'maps_search', rank_absolute: 1, title: 'A', category: 'Dentist', additional_categories: ['Cosmetic dentist'], phone: '+15125550100', is_claimed: true, latitude: 30.1, longitude: -97.7, work_hours: { current_status: 'close' } },
      { type: 'maps_search', rank_absolute: 2, title: 'B', additional_categories: null, is_claimed: false },
    ] }];
    const [a, b] = parseMapsItems(rich);
    expect(a).toMatchObject({ category: 'Dentist', additionalCategories: ['Cosmetic dentist'], phone: '+15125550100', isClaimed: true, lat: 30.1, lng: -97.7 });
    expect(a?.closed).toBeFalsy(); // current_status 'close' = closed for the day, not permanently closed
    expect(b).toMatchObject({ additionalCategories: [], isClaimed: false });
  });

  it.each([
    ['closed_forever', true], ['close', false], ['closed', false], ['temporarily_closed', false],
  ])('current_status %s -> closed %s', (status, closed) => {
    const [p] = parseMapsItems([{ items: [{ type: 'maps_search', rank_absolute: 1, title: 'X', work_hours: { current_status: status } }] }]);
    expect(Boolean(p?.closed)).toBe(closed);
  });

  it('accepts an item-level current_status', () => {
    const [p] = parseMapsItems([{ items: [{ type: 'maps_search', rank_absolute: 1, title: 'X', current_status: 'closed_forever' }] }]);
    expect(p?.closed).toBe(true);
  });
});
