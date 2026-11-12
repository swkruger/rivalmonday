import { describe, expect, it } from 'vitest';
import { dfsTask, fakeDfs } from '../../test/fake-dfs';
import { VendorError } from '../vendors/dataforseo';
import stage1 from '../citations/__fixtures__/citation-stage1.json';
import fixture from './__fixtures__/serp-venue-panel.json';
import live from './__fixtures__/serp-live.json';
import withLsa from './__fixtures__/serp-local-services.json';
import { gotoTarget, organicHost, parseSerp, SERP_CALL_USD, serpSearch } from './serp';

const liveResult = (live as { tasks: { result: unknown[] }[] }).tasks[0]!.result;
const stage1Result = (stage1 as { tasks: { result: unknown[] }[] }).tasks[0]!.result;

describe('parseSerp', () => {
  it('reads <= 10 organic items with ranks and domains from a live response, and no Local Services block', () => {
    const r = parseSerp(liveResult);
    expect(r.organic).toHaveLength(8);
    expect(r.organic.map((o) => o.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(r.organic[0]).toMatchObject({ rank: 1, domain: 'yelp.com' });
    expect(r.organic.every((o) => typeof o.title === 'string')).toBe(true);
    expect(r.localServices).toBeNull();
  });

  it('reads Local Services provider names, ratings and votes when the block is present', () => {
    const r = parseSerp(withLsa);
    expect(r.localServices).toEqual({
      title: 'Local Services ads',
      providers: [{ name: 'Cool Air Pros', rating: 4.9, votes: 212 }, { name: 'Breeze HVAC', rating: null, votes: null }],
    });
    expect(r.organic).toEqual([{ rank: 1, domain: 'coolairpros.example', url: 'https://coolairpros.example/ac', title: 'AC repair | Cool Air Pros', description: null, listingUrl: null }]);
  });

  it('caps at 10 organic items and tolerates junk', () => {
    const items = Array.from({ length: 14 }, (_, i) => ({ type: 'organic', rank_group: i + 1, domain: `d${i}.example` }));
    expect(parseSerp([{ items }]).organic).toHaveLength(10);
    expect(parseSerp(null)).toEqual({ organic: [], localServices: null, knowledge: null });
    expect(parseSerp([{ items: [{ type: 'organic' }, 5] }]).organic).toEqual([]);
  });
});

describe('parseSerp real host (goto-wrapped results)', () => {
  const r = parseSerp(stage1Result, 20);
  const at = (rank: number) => r.organic.find((o) => o.rank === rank)!;

  it('reads the host and path from a URL breadcrumb (www stripped)', () => {
    expect(at(1)).toMatchObject({ domain: 'angi.com', listingUrl: 'https://angi.com/TX/Granbury' });
    expect(at(5)).toMatchObject({ domain: 'bbb.org', listingUrl: 'https://bbb.org/granbury/category/plumber' });
  });

  it('drops the path of a truncated crumb', () => {
    expect(at(3)).toMatchObject({ domain: 'yelp.com', listingUrl: 'https://yelp.com' });
    expect(at(6)).toMatchObject({ domain: 'mapquest.com', listingUrl: 'https://mapquest.com' });
  });

  it('maps a non-URL crumb through website_name, and keeps the vendor domain when unmapped', () => {
    expect(at(2)).toMatchObject({ domain: 'facebook.com' });
    expect(at(10)).toMatchObject({ domain: 'chamberofcommerce.com', listingUrl: 'https://chamberofcommerce.com' });
    const unmapped = parseSerp([{ items: [{ type: 'organic', rank_group: 1, domain: 'google.com', breadcrumb: '5 reviews', website_name: 'Someone Else' }] }]).organic[0]!;
    expect(unmapped).toMatchObject({ domain: 'google.com', listingUrl: null });
  });

  it('keeps description and honours max 20 (default stays 10)', () => {
    expect(at(1).description).toMatch(/^See reviews for/);
    expect(r.organic).toHaveLength(19);
    expect(parseSerp(stage1Result).organic).toHaveLength(10);
    expect(parseSerp(stage1Result, 3).organic).toHaveLength(3);
  });

  it('gives the 18b-2 live fixture real hosts, none left on google.com', () => {
    const live18 = parseSerp(liveResult);
    expect(live18.organic.map((o) => o.domain)).toEqual(['yelp.com', 'aireserv.com', 'comfortexpertsinc.com', 'ellibeeac.com', 'facebook.com', 'airmasters-inc.com', 'angi.com', 'actexasmade.com']);
    expect(live18.organic.some((o) => o.domain === 'google.com')).toBe(false);
  });

  it('organicHost takes only the host from a separator-less crumb', () => {
    expect(organicHost({ breadcrumb: 'https://example.com/foo' }).host).toBe('example.com');
    expect(organicHost({ breadcrumb: 'https://example.com:8080 › x' }).host).toBe('example.com');
  });

  it('organicHost ignores a Object.prototype website_name', () => {
    expect(organicHost({ breadcrumb: null, website_name: 'constructor' })).toEqual({ host: null, path: null });
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

describe('parseSerp knowledge panel (18d)', () => {
  const venue = (fixture as { tasks: { result: unknown[] }[] }).tasks[0]!.result;
  const panel = (items: unknown[]) => [{ items: [{ type: 'knowledge_graph', title: 'X Hall', items }] }];
  const row = (n: number) => ({ type: 'knowledge_graph_list_element', title: `E${n}`, subtitle: 'Fri', url: null });

  it('reads the panel title and Events rows from the fixture', () => {
    const k = parseSerp(venue).knowledge!;
    expect(k.title).toBe('Mohawk Austin');
    expect(k.events).toHaveLength(3);
    expect(k.events[0]).toEqual({ title: 'Hot Tuna: Electric Set', subtitle: 'Wed, Nov 11, 7:30 PM', url: 'https://www.mohawkaustin.com/events/hot-tuna' });
    expect(k.events[1]).toMatchObject({ title: 'Sunday Soul Social', subtitle: 'Fri, Nov 13, 8:00 PM', url: 'https://www.mohawkaustin.com/events/soul-social' });
    expect(parseSerp(venue).organic.length).toBeGreaterThan(0);
  });
  it('RF1: no knowledge_graph gives knowledge null', () => {
    expect(parseSerp(liveResult).knowledge).toBeNull();
  });
  it('a panel with only a Menu list has no events', () => {
    expect(parseSerp(panel([{ type: 'knowledge_graph_list_item', title: 'Menu', items: [row(1)] }])).knowledge).toEqual({ title: 'X Hall', events: [] });
  });
  it('ignores a 4th row, rows without a title, and matches "events" case-insensitively', () => {
    const rows = [{ subtitle: 'x' }, row(1), row(2), row(3), row(4)];
    const k = parseSerp(panel([{ type: 'knowledge_graph_list_item', title: 'EVENTS', items: rows }])).knowledge!;
    expect(k.events.map((e) => e.title)).toEqual(['E1', 'E2', 'E3']);
  });
  it('keeps a plain http(s) url, drops other schemes', () => {
    const rows = [{ title: 'A', url: 'https://x.example/e' }, { title: 'B', url: 'javascript:alert(1)' }];
    const k = parseSerp(panel([{ type: 'knowledge_graph_list_item', title: 'Events', items: rows }])).knowledge!;
    expect(k.events.map((e) => e.url)).toEqual(['https://x.example/e', null]);
  });
});

describe('gotoTarget', () => {
  it('decodes the target', () => {
    expect(gotoTarget('https://www.google.com/goto?url=https%3A%2F%2Fmohawkaustin.com%2Fe%2F1')).toBe('https://mohawkaustin.com/e/1');
  });
  it('rejects non-http targets and non-goto urls', () => {
    expect(gotoTarget('https://www.google.com/goto?url=javascript%3Aalert(1)')).toBeNull();
    expect(gotoTarget('https://example.com/goto?url=https%3A%2F%2Fa.example')).toBeNull();
    expect(gotoTarget(null)).toBeNull();
    expect(gotoTarget('not a url')).toBeNull();
  });
});
