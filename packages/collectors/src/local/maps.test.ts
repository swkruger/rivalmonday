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
      body: [{ keyword: 'ac repair', location_coordinate: '33.9,-84.3,14z', language_code: 'en', depth: 20 }],
    });
  });

  it('throws a typed VendorError when the task itself carries an API-level error', async () => {
    const dfs = fakeDfs(() => [dfsTask([], { statusCode: 40202, statusMessage: 'Too many requests' })]);
    await expect(mapsSearch(dfs, { keyword: 'ac repair', lat: 33.9, lng: -84.3 }, { agencyId: null, clientId: null })).rejects.toMatchObject({
      name: 'VendorError', vendor: 'dataforseo', code: 40202, retryable: true,
    });
  });

  it('throws a non-retryable VendorError when no task comes back (never an empty "nobody ranks" result)', async () => {
    const dfs = fakeDfs(() => []);
    await expect(mapsSearch(dfs, { keyword: 'ac repair', lat: 33.9, lng: -84.3 }, { agencyId: null, clientId: null })).rejects.toMatchObject({
      name: 'VendorError', vendor: 'dataforseo', code: null, message: 'empty task', retryable: false,
    });
  });
});
