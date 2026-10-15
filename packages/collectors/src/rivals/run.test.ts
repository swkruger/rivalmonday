import type { VendorCallRecord } from '@cs/core';
import { client, competitorSuggestion, discoveryRun, review, vendorTask } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import type { DiscoveryConfig, VerticalPack } from '@cs/verticals';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dfsTask, fakeDfs } from '../../test/fake-dfs';
import { collectReadyReviews } from '../reviews/collect';
import { VendorError } from '../vendors/errors';
import { finaliseRivalSearch, type RivalSearchDeps, runRivalSearch, sweepRivalRuns } from './run';
import { area, pack as basePack } from './test/helpers';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
afterEach(() => vi.restoreAllMocks());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(client).set({ keywords: [], serviceArea: area, placeId: 'p-self' }).where(eq(client.id, IDS.clientA2));
});

const NOW = new Date('2026-10-14T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const { lat, lng } = area.center;

type Item = Record<string, unknown>;
const place = (o: { placeId: string; title: string; rank: number; category?: string; votes?: number | null; domain?: string | null; dLat?: number; status?: string; claimed?: boolean }): Item => ({
  type: 'maps_search', title: o.title, rank_absolute: o.rank, place_id: o.placeId, cid: `cid-${o.placeId}`,
  category: o.category ?? 'Dentist', domain: o.domain === undefined ? `${o.placeId}.example` : o.domain,
  rating: o.votes === null ? null : { value: 4.5, votes_count: o.votes ?? 50 },
  latitude: lat + (o.dLat ?? 0), longitude: lng, address_info: { city: 'Granbury' }, is_claimed: o.claimed ?? true,
  work_hours: { current_status: o.status ?? 'open' },
});
const MAPS: Item[] = [
  place({ placeId: 'p-park', title: 'Granbury Park Dental', rank: 1, domain: 'granburypark.com' }),
  place({ placeId: 'p-arch', title: 'Archstone Dental', rank: 2 }),
  place({ placeId: 'p-ortho', title: 'Smile Ortho', rank: 3, category: 'Orthodontist' }),
  place({ placeId: 'p-dg', title: 'Dollar General', rank: 4, category: 'Discount store' }),
  place({ placeId: 'p-self', title: 'Our Own Dental', rank: 5 }),
  place({ placeId: 'p-closed', title: 'Gone Dental', rank: 6, status: 'closed_forever' }),
  place({ placeId: 'p-far', title: 'Far Away Dental', rank: 7, dLat: 1 }),
  place({ placeId: 'p-thin', title: 'Thin Dental', rank: 8, votes: null, domain: null }),
  place({ placeId: 'p-minor', title: 'Minor Dental', rank: 15, claimed: false }),
];

type VendorOpts = {
  mapsFails?: (n: number) => boolean; metaDown?: boolean; before?: (path: string) => Promise<void>;
  /** Extra Maps places, advertisers per keyword and Meta ad rows per query (on top of the defaults). */
  extraPlaces?: Item[]; advertisers?: Record<string, Item[]>; metaRows?: Record<string, Item[]>;
};
function vendors(opts: VendorOpts = {}) {
  let mapsCalls = 0;
  const dfs = fakeDfs(async (_m, path, body) => {
    await opts.before?.(path);
    const t = body?.[0] ?? {};
    if (path === '/serp/google/maps/live/advanced') {
      mapsCalls++;
      if (opts.mapsFails?.(mapsCalls)) throw new VendorError('dataforseo', 50000, 'boom', true);
      return [dfsTask([{ items: [...MAPS, ...(opts.extraPlaces ?? [])] }])];
    }
    if (path === '/serp/google/ads_advertisers/live/advanced') {
      const extra = opts.advertisers?.[String(t.keyword)];
      if (extra) return [dfsTask([{ items: extra }])];
      if (t.keyword !== 'Granbury Park Dental') return [dfsTask(null, { statusCode: 40102, statusMessage: 'No Search Results.' })];
      return [dfsTask([{ items: [
        { type: 'ads_advertiser', advertiser_id: 'AR1', title: 'Granbury Park Dental', domain: 'granburypark.com', verified: true },
        { type: 'ads_advertiser', advertiser_id: 'AR2', title: 'Granbury Park Dental Group', domain: null, verified: false },
      ] }])];
    }
    if (path === '/serp/google/ads_search/live/advanced') {
      if (!Array.isArray(t.advertiser_ids)) return [dfsTask(null, { statusCode: 40102, statusMessage: 'No Search Results.' })];
      const cr = (id: string, first: number) => ({ type: 'ads_search', creative_id: id, advertiser_id: 'AR1', title: 'Granbury Park Dental', first_shown: daysAgo(first), last_shown: daysAgo(1) });
      return [dfsTask([{ items: [cr('c1', 5), cr('c2', 10), cr('c3', 200)] }])];
    }
    if (path === '/business_data/google/reviews/task_post') {
      return (body ?? []).map((b) => dfsTask([], { id: randomUUID(), statusCode: 20100, statusMessage: 'Task Created.', tag: String(b.tag) }));
    }
    throw new Error(`unexpected ${path}`);
  });
  const records: VendorCallRecord[] = [];
  const ledger = { recordLlmCall: async () => {}, recordVendorCall: async (r: VendorCallRecord) => { records.push(r); } };
  const fetch = (async (u: string | URL | Request) => {
    if (opts.metaDown) return new Response('{}', { status: 500 });
    const q = new URL(String(u)).searchParams.get('query');
    const rows = q === 'Granbury Park Dental' ? Array.from({ length: 4 }, () => ({ page_id: 'pg1', page_name: 'Granbury Park Dental', is_active: true })) : (opts.metaRows?.[q ?? ''] ?? []);
    return new Response(JSON.stringify({ success: true, searchResults: rows }), { status: 200 });
  }) as typeof globalThis.fetch;
  return { dfs, records, meta: { apiKey: 'k', ledger, fetch }, mapsCalls: () => mapsCalls };
}

function deps(v: ReturnType<typeof vendors>, discovery: DiscoveryConfig = basePack): RivalSearchDeps {
  return { db: dbs.service, dfs: v.dfs, meta: v.meta, packs: async () => ({ discovery }) as unknown as VerticalPack, now: () => NOW };
}
async function newRun() {
  const [r] = await dbs.owner.insert(discoveryRun).values({ agencyId: IDS.agencyA, clientId: IDS.clientA2, trigger: 'manual' }).returning();
  return r!.id;
}
const runRow = async (id: string) => (await dbs.service.select().from(discoveryRun).where(eq(discoveryRun.id, id)))[0]!;
const suggestions = async () => {
  const rows = await dbs.service.select().from(competitorSuggestion).where(eq(competitorSuggestion.clientId, IDS.clientA2));
  return new Map(rows.map((r) => [r.placeId, r]));
};

describe('runRivalSearch', () => {
  it('full run produces tiers and hidden counts', async () => {
    const v = vendors();
    const runId = await newRun();
    expect(await runRivalSearch(deps(v), runId)).toEqual({ status: 'finalising' });

    const run = await runRow(runId);
    expect(run).toMatchObject({ status: 'finalising', keywords: ['dentist'], gridSize: 5, kept: 4 });
    expect(run.hidden).toEqual({ wrong_category: 1, outside_area: 1, self: 1, closed: 1, thin: 1 });
    expect(run.progress).toMatchObject({ searchesDone: 25, searchesTotal: 25, checksDone: 4, checksTotal: 4 });
    expect((run.progress as { hiddenList?: unknown[] }).hiddenList).toContainEqual({ name: 'Dollar General', reason: 'wrong_category' });
    expect(run.costUsd).toBeGreaterThan(0);
    expect(run.costUsd).toBeLessThanOrEqual(basePack.cost_cap_usd);
    // Every vendor call carries the run's real scope.
    const scope = { agencyId: IDS.agencyA, clientId: IDS.clientA2 };
    expect(v.dfs.calls.length).toBeGreaterThan(25);
    expect(v.dfs.calls.every((c) => c.scope?.agencyId === scope.agencyId && c.scope?.clientId === scope.clientId)).toBe(true);
    expect(v.records.length).toBe(4);
    expect(v.records.every((r) => r.agencyId === scope.agencyId && r.clientId === scope.clientId)).toBe(true);

    const tasks = await dbs.service.select().from(vendorTask);
    expect(tasks).toHaveLength(4);
    expect(tasks.every((t) => t.suggestionId && !t.competitorId && t.kind === 'google_reviews')).toBe(true);
    const posted = v.dfs.calls.find((c) => c.path === '/business_data/google/reviews/task_post')!;
    expect(posted.body?.[0]).toMatchObject({ depth: 20, sort_by: 'newest', tag: expect.stringMatching(new RegExp(`^discovery:${runId}:p-`)) });

    // Review samples land via the vendor poll: patch signals, never write review rows, then finalise.
    const finalised: string[] = [];
    const items = [
      { review_id: 'r1', timestamp: daysAgo(3), owner_answer: 'Thanks!' },
      { review_id: 'r2', timestamp: daysAgo(20) },
      { review_id: 'r3', timestamp: daysAgo(60), owner_answer: 'Thank you' },
      { review_id: 'r4', timestamp: daysAgo(200) },
    ];
    const poll = fakeDfs((_m, path) => (path.endsWith('/tasks_ready')
      ? [dfsTask(tasks.map((t) => ({ id: t.externalTaskId })))]
      : [dfsTask([{ items }], { id: path.split('/').pop()! })]));
    await collectReadyReviews({
      db: dbs.service, store: createMemoryStore(), dfs: poll, salt: 's', now: () => NOW,
      onSuggestionReviews: async (id) => { finalised.push(id); await finaliseRivalSearch(deps(v), id, { force: false }); },
    });
    expect(await dbs.service.select().from(review)).toHaveLength(0);
    expect(finalised.every((id) => id === runId)).toBe(true);
    expect((await runRow(runId)).status).toBe('done');
    expect((await runRow(runId)).finishedAt).not.toBeNull();

    const s = await suggestions();
    expect([...s.keys()].sort()).toEqual(['p-arch', 'p-minor', 'p-ortho', 'p-park']);
    const park = s.get('p-park')!;
    expect(park).toMatchObject({ runId, tier: 'top', category: 'Dentist', status: 'suggested' });
    expect(park.signals).toMatchObject({
      reviews30d: 2, reviews90d: 3, replyRate: 2 / 3, googleAdsActive: 3, googleAdsNew30d: 2, googleAccount: 'matched',
      metaPage: 'matched', metaAdsActive: 4, chain: false, categoryMatch: 'main', claimed: true,
      presence: { searches: 25, appeared: 25, bestRank: 1 },
    });
    expect(park.adMatches).toEqual(expect.arrayContaining([
      { platform: 'google', accountId: 'AR1', name: 'Granbury Park Dental', strength: 'strong' },
      { platform: 'meta', accountId: 'pg1', name: 'Granbury Park Dental', strength: 'strong' },
    ]));
    expect(s.get('p-arch')).toMatchObject({ tier: 'watch' });
    expect(s.get('p-arch')!.signals).toMatchObject({ googleAccount: 'none', googleAdsActive: 0, metaPage: 'none', metaAdsActive: 0 });
    expect(s.get('p-ortho')!.signals).toMatchObject({ categoryMatch: 'related' });
    expect(s.get('p-minor')).toMatchObject({ tier: 'minor' });
  });

  it('a single-location franchise ("<brand> of <city>") gets the brand ad accounts as weak, never auto-attached', async () => {
    const v = vendors({
      extraPlaces: [place({ placeId: 'p-aspen', title: 'Aspen Dental of Granbury', rank: 9, domain: null })],
      advertisers: { 'Aspen Dental of Granbury': [{ type: 'ads_advertiser', advertiser_id: 'AR9', title: 'Aspen Dental', domain: null, verified: true }] },
      metaRows: { 'Aspen Dental of Granbury': [{ page_id: 'pg9', page_name: 'Aspen Dental', is_active: true }] },
    });
    const runId = await newRun();
    await runRivalSearch(deps(v), runId);
    const aspen = (await suggestions()).get('p-aspen')!;
    // One location in the raw results: the run's chain detection says no chain.
    expect(aspen.signals).toMatchObject({ chain: false, googleAccount: 'possible', googleAdsActive: null, metaPage: 'possible', metaAdsActive: null });
    expect(aspen.adMatches).toEqual([
      { platform: 'google', accountId: 'AR9', name: 'Aspen Dental', strength: 'weak' },
      { platform: 'meta', accountId: 'pg9', name: 'Aspen Dental', strength: 'weak' },
    ]);
  });

  it('cost cap shrinks grid to 5×5', async () => {
    const v = vendors();
    const runId = await newRun();
    await runRivalSearch(deps(v, { ...basePack, grid: { size: 7, fallback_size: 5 }, cost_cap_usd: 0.35 }), runId);
    expect(v.mapsCalls()).toBe(25);
    expect(await runRow(runId)).toMatchObject({ gridSize: 5 });
    expect((await runRow(runId)).costUsd).toBeLessThanOrEqual(0.35);
  });

  it('cost cap drops keywords from the end after the fallback grid', async () => {
    await dbs.owner.update(client).set({ keywords: ['emergency dentist', 'implants'] }).where(eq(client.id, IDS.clientA2));
    const v = vendors();
    const runId = await newRun();
    await runRivalSearch(deps(v, { ...basePack, grid: { size: 5, fallback_size: 3 }, cost_cap_usd: 0.305 }), runId);
    // 3 keywords x 9 = 27 searches + 20 shortlist estimate = 0.336 > cap; 2 keywords x 9 = 0.318 > cap; 1 keyword = 0.3.
    expect(await runRow(runId)).toMatchObject({ gridSize: 3, keywords: ['emergency dentist'] });
    expect(v.mapsCalls()).toBe(9);
  });

  it('under 50% searches → failed, old suggestions kept', async () => {
    await dbs.owner.insert(competitorSuggestion).values({ agencyId: IDS.agencyA, clientId: IDS.clientA2, name: 'Old Rival', placeId: 'p-old', appearances: 3, overlapScore: 0.4 });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const v = vendors({ mapsFails: (n) => n % 5 !== 0 }); // 20 % succeed
    const runId = await newRun();
    expect(await runRivalSearch(deps(v), runId)).toEqual({ status: 'failed' });
    expect(await runRow(runId)).toMatchObject({ status: 'failed', error: 'search_failed' });
    expect((await runRow(runId)).finishedAt).not.toBeNull();
    const s = await suggestions();
    expect([...s.keys()]).toEqual(['p-old']);
    expect(s.get('p-old')).toMatchObject({ name: 'Old Rival', runId: null, overlapScore: 0.4 });
  });

  it('missing service area → failed missing_profile', async () => {
    await dbs.owner.update(client).set({ serviceArea: null }).where(eq(client.id, IDS.clientA2));
    const runId = await newRun();
    expect(await runRivalSearch(deps(vendors()), runId)).toEqual({ status: 'failed' });
    expect(await runRow(runId)).toMatchObject({ status: 'failed', error: 'missing_profile' });
  });

  it('dismissed suggestion stays dismissed', async () => {
    await dbs.owner.insert(competitorSuggestion).values({ agencyId: IDS.agencyA, clientId: IDS.clientA2, name: 'Granbury Park Dental', placeId: 'p-park', appearances: 1, overlapScore: 0.1, status: 'dismissed' });
    const runId = await newRun();
    await runRivalSearch(deps(vendors()), runId);
    const park = (await suggestions()).get('p-park')!;
    expect(park).toMatchObject({ status: 'dismissed', runId, appearances: 25 });
    expect(park.overlap).toBeGreaterThan(0.9);
  });

  it('Meta outage → metaPage null, tier still computed', async () => {
    const v = vendors({ metaDown: true });
    const runId = await newRun();
    await runRivalSearch(deps(v), runId);
    expect(await finaliseRivalSearch(deps(v), runId, { force: true })).toBe('done');
    const park = (await suggestions()).get('p-park')!;
    expect(park.signals).toMatchObject({ metaPage: null, metaAdsActive: null, googleAdsActive: 3 });
    expect(park.tier).not.toBeNull();
    expect(park.activity).not.toBeNull();
    expect(park.adMatches.some((m) => m.platform === 'meta')).toBe(false);
  });

  it('force finalise leaves reviews null', async () => {
    const v = vendors();
    const runId = await newRun();
    await runRivalSearch(deps(v), runId);
    expect(await finaliseRivalSearch(deps(v), runId, { force: false })).toBe('waiting');
    expect((await runRow(runId)).status).toBe('finalising');
    expect(await finaliseRivalSearch(deps(v), runId, { force: true })).toBe('done');
    expect(await runRow(runId)).toMatchObject({ status: 'done' });
    for (const s of (await suggestions()).values()) {
      expect(s.signals).toMatchObject({ reviews30d: null, reviews90d: null, replyRate: null });
      expect(s.tier).not.toBeNull();
    }
  });

  it('dismissed suggestion is not shortlisted', async () => {
    await dbs.owner.insert(competitorSuggestion).values({ agencyId: IDS.agencyA, clientId: IDS.clientA2, name: 'Granbury Park Dental', placeId: 'p-park', appearances: 1, overlapScore: 0.1, status: 'dismissed' });
    const v = vendors();
    const runId = await newRun();
    await runRivalSearch(deps(v), runId);
    const run = await runRow(runId);
    expect(run.progress).toMatchObject({ checksTotal: 3 });
    const park = (await suggestions()).get('p-park')!;
    expect(run.progress.shortlistIds).not.toContain(park.id);
    expect(park.signals).toMatchObject({ reviews30d: null, googleAdsActive: null });
    expect(v.dfs.calls.some((c) => c.path === '/serp/google/ads_advertisers/live/advanced' && c.body?.[0]?.keyword === 'Granbury Park Dental')).toBe(false);
  });

  it('stores the shortlist ids in progress and finalise uses them', async () => {
    const v = vendors();
    const runId = await newRun();
    await runRivalSearch(deps(v), runId);
    const s = await suggestions();
    const run = await runRow(runId);
    expect(run.progress.shortlistIds).toEqual(['p-park', 'p-arch', 'p-ortho', 'p-minor'].map((p) => s.get(p)!.id));
    // Finalise recomputes only the stored shortlist, never a re-derived one.
    await dbs.service.update(discoveryRun).set({ progress: { ...run.progress, shortlistIds: [s.get('p-park')!.id] } }).where(eq(discoveryRun.id, runId));
    expect(await finaliseRivalSearch(deps(v), runId, { force: true })).toBe('done');
    const after = await suggestions();
    expect(after.get('p-park')!.activity).not.toBeNull();
    expect(after.get('p-arch')).toMatchObject({ activity: null, tier: 'minor' });
  });

  it('still over the cost cap after shrinking → failed cost_cap, no vendor calls', async () => {
    const v = vendors();
    const runId = await newRun();
    expect(await runRivalSearch(deps(v, { ...basePack, cost_cap_usd: 0.01 }), runId)).toEqual({ status: 'failed' });
    expect(await runRow(runId)).toMatchObject({ status: 'failed', error: 'cost_cap' });
    expect(v.dfs.calls).toHaveLength(0);
    expect(v.records).toHaveLength(0);
  });

  it('force finalise that throws marks the run failed internal_error', async () => {
    const v = vendors();
    const runId = await newRun();
    await runRivalSearch(deps(v), runId);
    const broken = { ...deps(v), packs: async () => { throw new Error('pack gone'); } };
    await expect(finaliseRivalSearch(broken, runId, { force: true })).rejects.toThrow('pack gone');
    expect(await runRow(runId)).toMatchObject({ status: 'failed', error: 'internal_error' });
  });

  async function pollSample(v: ReturnType<typeof vendors>, suggestionId: string, tag: string, onRun: (id: string) => Promise<void>) {
    const [t] = await dbs.service.select().from(vendorTask).where(eq(vendorTask.suggestionId, suggestionId));
    const items = [{ review_id: 'r1', timestamp: daysAgo(3) }, { review_id: 'r2', timestamp: daysAgo(10), owner_answer: 'Thanks' }];
    const poll = fakeDfs((_m, path) => (path.endsWith('/tasks_ready')
      ? [dfsTask([{ id: t!.externalTaskId }])]
      : [dfsTask([{ items }], { id: t!.externalTaskId, tag })]));
    await collectReadyReviews({ db: dbs.service, store: createMemoryStore(), dfs: poll, salt: 's', now: () => NOW, onSuggestionReviews: onRun });
    return (await dbs.service.select().from(vendorTask).where(eq(vendorTask.id, t!.id)))[0]!;
  }

  it('late same-run sample after done re-computes Activity and Tier', async () => {
    const v = vendors();
    const runId = await newRun();
    await runRivalSearch(deps(v), runId);
    await finaliseRivalSearch(deps(v), runId, { force: true });
    const before = (await suggestions()).get('p-park')!;
    expect(before.activity).toBe(1);
    const task = await pollSample(v, before.id, `discovery:${runId}:p-park`, async (id) => { await finaliseRivalSearch(deps(v), id, { force: false }); });
    expect(task.status).toBe('done');
    const after = (await suggestions()).get('p-park')!;
    expect(after.signals).toMatchObject({ reviews30d: 2, reviews90d: 2, replyRate: 0.5 });
    expect(after.activity).toBeCloseTo(0.85, 5);
    expect((await runRow(runId)).status).toBe('done');
  });

  it('a sample whose tag names an older run leaves signals unchanged and the task done', async () => {
    const v = vendors();
    const runId = await newRun();
    await runRivalSearch(deps(v), runId);
    await finaliseRivalSearch(deps(v), runId, { force: true });
    const before = (await suggestions()).get('p-park')!;
    const onRun = vi.fn(async () => {});
    const task = await pollSample(v, before.id, `discovery:${randomUUID()}:p-park`, onRun);
    expect(task.status).toBe('done');
    expect(onRun).not.toHaveBeenCalled();
    const after = (await suggestions()).get('p-park')!;
    expect(after.signals).toEqual(before.signals);
    expect(after.activity).toBe(before.activity);
  });
});

describe('sweepRivalRuns', () => {
  const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);
  it('fails stale live runs and force-finalises old finalising runs', async () => {
    const v = vendors();
    const fin = await newRun();
    await runRivalSearch(deps(v), fin);
    await dbs.service.update(discoveryRun).set({ startedAt: ago(70) }).where(eq(discoveryRun.id, fin));
    const [stale] = await dbs.owner.insert(discoveryRun).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, trigger: 'auto', status: 'searching', startedAt: ago(130) }).returning();
    const [fresh] = await dbs.owner.insert(discoveryRun).values({ agencyId: IDS.agencyB, clientId: IDS.clientB1, trigger: 'auto', status: 'checking', startedAt: ago(30) }).returning();
    expect(await sweepRivalRuns(deps(v), NOW)).toEqual({ stale: 1, finalised: 1 });
    expect(await runRow(stale!.id)).toMatchObject({ status: 'failed', error: 'stale' });
    expect(await runRow(fresh!.id)).toMatchObject({ status: 'checking', error: null });
    expect(await runRow(fin)).toMatchObject({ status: 'done' });
  });

  it('leaves a finalising run younger than an hour alone', async () => {
    const v = vendors();
    const fin = await newRun();
    await runRivalSearch(deps(v), fin);
    await dbs.service.update(discoveryRun).set({ startedAt: ago(50) }).where(eq(discoveryRun.id, fin));
    expect(await sweepRivalRuns(deps(v), NOW)).toEqual({ stale: 0, finalised: 0 });
    expect((await runRow(fin)).status).toBe('finalising');
  });

  it('a run swept stale mid-search stops without resurrecting or spending more', async () => {
    let runId = '';
    let maps = 0;
    let callsAtSweep = 0;
    const v = vendors({
      before: async (path) => {
        if (path !== '/serp/google/maps/live/advanced' || ++maps !== 3) return;
        await dbs.service.update(discoveryRun).set({ status: 'failed', error: 'stale' }).where(eq(discoveryRun.id, runId));
        callsAtSweep = v.dfs.calls.length;
      },
    });
    runId = await newRun();
    expect(await runRivalSearch(deps(v), runId)).toEqual({ status: 'failed' });
    expect(await runRow(runId)).toMatchObject({ status: 'failed', error: 'stale' });
    // At most the searches up to the next progress check (every 10); nothing from stage 2.
    expect(v.dfs.calls.length).toBeLessThanOrEqual(10);
    expect(v.dfs.calls.length).toBeGreaterThanOrEqual(callsAtSweep);
    expect(v.dfs.calls.every((c) => c.path === '/serp/google/maps/live/advanced')).toBe(true);
    expect(v.records).toHaveLength(0);
    expect(await suggestions()).toEqual(new Map());
  });

  it('a run swept stale during stage 2 stops after the current check, posts no review samples', async () => {
    let runId = '';
    const v = vendors({
      before: async (path) => {
        if (path === '/serp/google/ads_advertisers/live/advanced') await dbs.service.update(discoveryRun).set({ status: 'failed', error: 'stale' }).where(eq(discoveryRun.id, runId));
      },
    });
    runId = await newRun();
    expect(await runRivalSearch(deps(v), runId)).toEqual({ status: 'failed' });
    expect(await runRow(runId)).toMatchObject({ status: 'failed', error: 'stale' });
    expect(v.dfs.calls.filter((c) => c.path === '/serp/google/ads_advertisers/live/advanced')).toHaveLength(1);
    expect(v.records).toHaveLength(1);
    expect(v.dfs.calls.some((c) => c.path === '/business_data/google/reviews/task_post')).toBe(false);
  });
});
