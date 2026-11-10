import { describe, expect, it } from 'vitest';
import { dfsTask, fakeDfs } from '../../test/fake-dfs';
import { VendorError } from '../vendors/dataforseo';
import live from './__fixtures__/serp-live.json';
import withLsa from './__fixtures__/serp-local-services.json';
import { parseSerp, SERP_CALL_USD, serpSearch } from './serp';

const liveResult = (live as { tasks: { result: unknown[] }[] }).tasks[0]!.result;

describe('parseSerp', () => {
  it('reads <= 10 organic items with ranks and domains from a live response, and no Local Services block', () => {
    const r = parseSerp(liveResult);
    expect(r.organic).toHaveLength(8);
    expect(r.organic.map((o) => o.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(r.organic[0]).toMatchObject({ rank: 1, domain: 'google.com' });
    expect(r.organic.every((o) => typeof o.title === 'string')).toBe(true);
    expect(r.localServices).toBeNull();
  });

  it('reads Local Services provider names, ratings and votes when the block is present', () => {
    const r = parseSerp(withLsa);
    expect(r.localServices).toEqual({
      title: 'Local Services ads',
      providers: [{ name: 'Cool Air Pros', rating: 4.9, votes: 212 }, { name: 'Breeze HVAC', rating: null, votes: null }],
    });
    expect(r.organic).toEqual([{ rank: 1, domain: 'coolairpros.example', url: 'https://coolairpros.example/ac', title: 'AC repair | Cool Air Pros' }]);
  });

  it('caps at 10 organic items and tolerates junk', () => {
    const items = Array.from({ length: 14 }, (_, i) => ({ type: 'organic', rank_group: i + 1, domain: `d${i}.example` }));
    expect(parseSerp([{ items }]).organic).toHaveLength(10);
    expect(parseSerp(null)).toEqual({ organic: [], localServices: null });
    expect(parseSerp([{ items: [{ type: 'organic' }, 5] }]).organic).toEqual([]);
  });
});

describe('serpSearch', () => {
  const scope = { agencyId: null, clientId: null };
  it('posts the live endpoint with a clamped radius in metres, depth 10, and returns raw', async () => {
    const dfs = fakeDfs(() => [dfsTask(liveResult)]);
    const r = await serpSearch(dfs, { keyword: 'ac repair', lat: 30.1, lng: -97.2, radiusM: 400_000 }, scope);
    expect(dfs.calls[0]).toMatchObject({ path: '/serp/google/organic/live/advanced', body: [{ keyword: 'ac repair', location_coordinate: '30.1,-97.2,199999', language_code: 'en', depth: 10 }] });
    expect(r.organic).toHaveLength(8);
    expect(r.raw).toBe(liveResult);
    expect(SERP_CALL_USD).toBe(0.002);
  });

  it('throws VendorError on a failed task or no task', async () => {
    await expect(serpSearch(fakeDfs(() => [dfsTask(null, { statusCode: 50000, statusMessage: 'x' })]), { keyword: 'k', lat: 1, lng: 2, radiusM: 5000 }, scope)).rejects.toBeInstanceOf(VendorError);
    await expect(serpSearch(fakeDfs(() => []), { keyword: 'k', lat: 1, lng: 2, radiusM: 5000 }, scope)).rejects.toBeInstanceOf(VendorError);
  });
});
