import { STADIA_ATTRIBUTION } from '@cs/collectors';
import { client, clientCompetitor, competitorSignal, rankMapImage, rankSnapshot } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { rankSettingsKey } from '@cs/engine';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { GeoGridView, RankTrendView, ShareOfVoiceView } from './schemas';
import { ago, ctx, dbs, gridSnapshots, registry, resetWorkspace, rr, seedCapture, seedRankScan, seedSelf, setPlace } from './workspace-fixtures';

const am = ctx('account_manager', 'all');
const owner = ctx('client_owner', [IDS.clientA1], ['dashboard']);
const ownerNoDash = ctx('client_owner', [IDS.clientA1]);
const AREA = { center: { lat: 32, lng: -97 }, radiusKm: 25, zips: ['76048'] };

async function setupClient(): Promise<void> {
  await dbs.owner.update(client).set({ keywords: ['plumber', 'ac repair'], serviceArea: AREA }).where(eq(client.id, IDS.clientA1));
  await seedSelf({ placeId: 'self-place' });
  await setPlace(IDS.competitorX, 'px');
}

/** 3×3 "ac repair": the top row has self #1, the rest self #5; X is #2 or #1; point (2,2) failed. "plumber": only others. */
const acRepair = () => gridSnapshots('ac repair', 3, (r, c) => {
  if (r === 2 && c === 2) return null;
  return r === 0 ? [rr(1, 'self-place'), rr(2, 'px'), rr(3, 'o1')] : [rr(1, 'px'), rr(2, 'o1'), rr(3, 'o2'), rr(5, 'self-place')];
});
const plumber = () => gridSnapshots('plumber', 3, () => [rr(1, 'o1')]);

beforeEach(resetWorkspace);

describe('get_geogrid', () => {
  it('draws the newest scan for the self business, with no-data points as null (decision 9, Review Focus 3)', async () => {
    await setupClient();
    await seedRankScan({ finishedAt: ago(40), snapshots: gridSnapshots('ac repair', 1, () => [rr(9, 'self-place')]) });
    const newest = await seedRankScan({ finishedAt: ago(5), snapshots: [...acRepair(), ...plumber()] });
    const r = (await registry.invoke(owner, 'get_geogrid', { clientId: IDS.clientA1 })) as GeoGridView;
    expect([r.setup, r.scan?.id, r.keyword, r.business, r.size, r.radiusKm]).toEqual(['ready', newest, 'ac repair', 'self', 3, 25]);
    expect(r.keywords).toEqual(['ac repair', 'plumber']);
    expect(r.businesses).toEqual([{ key: 'self', name: 'A1 HVAC', self: true }, { key: IDS.competitorX, name: 'Smith HVAC', self: false }]);
    expect(r.cells).toEqual([[1, 1, 1], [5, 5, 5], [5, 5, null]]);
    expect([r.top3, r.points, r.avgRank]).toEqual([3, 8, 3.5]);
    expect(r.scans.map((s) => s.id)).toEqual([newest, expect.any(String)]);
  });

  it('shows a competitor not in the top 20 as 21, and summarises every keyword', async () => {
    await setupClient();
    await seedRankScan({ finishedAt: ago(5), snapshots: [...acRepair(), ...plumber()] });
    const r = (await registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1, business: IDS.competitorX, keyword: 'plumber' })) as GeoGridView;
    expect(r.cells).toEqual([[21, 21, 21], [21, 21, 21], [21, 21, 21]]);
    expect([r.top3, r.points, r.avgRank]).toEqual([0, 9, 21]);
    expect(r.keywordSummaries).toEqual([
      { keyword: 'ac repair', top3: 8, points: 8, avgRank: 1.4, evidenceIds: [] },
      { keyword: 'plumber', top3: 0, points: 9, avgRank: 21, evidenceIds: [] },
    ]);
  });

  it('each keyword summary cites the evidence of its centre grid point, so Ask can save a recommendation from it', async () => {
    await setupClient();
    const self = (await dbs.owner.select({ id: client.selfCompetitorId }).from(client).where(eq(client.id, IDS.clientA1)))[0]!.id!;
    const scan = await seedRankScan({ finishedAt: ago(5), snapshots: [...acRepair(), ...plumber()] });
    const centre = await seedCapture({ competitorId: self, source: 'google_maps_rank', kinds: ['vendor_json'] });
    const corner = await seedCapture({ competitorId: self, source: 'google_maps_rank', kinds: ['vendor_json'] });
    await dbs.owner.update(rankSnapshot).set({ captureId: centre.captureId })
      .where(and(eq(rankSnapshot.scanId, scan), eq(rankSnapshot.keyword, 'ac repair'), eq(rankSnapshot.lat, 31.99), eq(rankSnapshot.lng, -96.99)));
    await dbs.owner.update(rankSnapshot).set({ captureId: corner.captureId })
      .where(and(eq(rankSnapshot.scanId, scan), eq(rankSnapshot.keyword, 'plumber'), eq(rankSnapshot.lat, 32), eq(rankSnapshot.lng, -97)));
    const r = (await registry.invoke(owner, 'get_geogrid', { clientId: IDS.clientA1 })) as GeoGridView;
    // Centre first; a keyword whose centre has no capture falls back to any captured point of that keyword.
    expect(r.keywordSummaries.map((k) => [k.keyword, k.evidenceIds])).toEqual([['ac repair', [centre.ids.vendor_json]], ['plumber', [corner.ids.vendor_json]]]);
    const ev = await registry.invoke(owner, 'get_evidence', { clientId: IDS.clientA1, evidenceId: centre.ids.vendor_json! });
    expect(ev).toMatchObject({ evidenceId: centre.ids.vendor_json });
  });

  it('falls back to the first keyword for an unknown one and opens an older scan by id', async () => {
    await setupClient();
    const older = await seedRankScan({ finishedAt: ago(40), snapshots: gridSnapshots('ac repair', 1, () => [rr(9, 'self-place')]) });
    await seedRankScan({ finishedAt: ago(5), snapshots: [...acRepair(), ...plumber()] });
    expect(((await registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1, keyword: 'zzz' })) as GeoGridView).keyword).toBe('ac repair');
    const r = (await registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1, scanId: older })) as GeoGridView;
    expect([r.scan?.id, r.cells]).toEqual([older, [[9]]]);
  });

  it('never reads another client’s scans (Review Focus 1)', async () => {
    await setupClient();
    const mine = await seedRankScan({ finishedAt: ago(5), snapshots: acRepair() });
    const a2 = await seedRankScan({ finishedAt: ago(1), snapshots: acRepair(), clientId: IDS.clientA2 });
    const b1 = await seedRankScan({ finishedAt: ago(1), snapshots: acRepair(), agencyId: IDS.agencyB, clientId: IDS.clientB1 });
    await seedRankScan({ finishedAt: ago(2), snapshots: acRepair(), status: 'failed' });
    const r = (await registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1 })) as GeoGridView;
    expect(r.scans.map((s) => s.id)).toEqual([mine]);
    await expect(registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1, scanId: a2 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1, scanId: b1 })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('returns no-data cells and no average when the client has no business to rank (not a grid of 21)', async () => {
    await dbs.owner.update(client).set({ keywords: ['ac repair'], serviceArea: AREA }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.delete(clientCompetitor).where(eq(clientCompetitor.clientId, IDS.clientA1));
    await seedRankScan({ finishedAt: ago(5), snapshots: acRepair() });
    const r = (await registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1 })) as GeoGridView;
    expect([r.setup, r.business, r.businesses]).toEqual(['ready', null, []]);
    expect(r.cells.flat().every((c) => c === null)).toBe(true);
    expect([r.top3, r.points, r.avgRank]).toEqual([0, 0, null]);
    expect(r.keywordSummaries).toEqual([{ keyword: 'ac repair', top3: 0, points: 0, avgRank: null, evidenceIds: [] }]);
  });

  it('reports the setup state, and refuses an untracked business and a missing dashboard flag', async () => {
    let r = (await registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1 })) as GeoGridView;
    expect([r.setup, r.business, r.cells]).toEqual(['no_keywords', IDS.competitorX, []]);
    await dbs.owner.update(client).set({ keywords: ['ac repair'], serviceArea: AREA }).where(eq(client.id, IDS.clientA1));
    r = (await registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1 })) as GeoGridView;
    expect([r.setup, r.scans]).toEqual(['no_scan', []]);
    await expect(registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1, business: IDS.competitorY })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1, business: 'self' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ownerNoDash, 'get_geogrid', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('get_geogrid additions (Phase 13b)', () => {
  const BOUNDS = { west: -97.01, south: 31.97, east: -96.97, north: 32.01 };
  const seedMap = (bounds = BOUNDS) => dbs.owner.insert(rankMapImage).values({
    clientId: IDS.clientA1, agencyId: IDS.agencyA, settingsHash: 'abcdef0123456789ffff', objectKey: 'rank-map/a1.png', bounds, width: 800, height: 800,
  });

  it('selected scan older than 12 appears in scans', async () => {
    await setupClient();
    const ids: string[] = [];
    for (let i = 0; i < 14; i++) ids.push(await seedRankScan({ finishedAt: ago(i + 1), snapshots: acRepair() }));
    const oldest = ids[13]!;
    const r = (await registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1, scanId: oldest })) as GeoGridView;
    expect(r.scan?.id).toBe(oldest);
    expect(r.scans).toHaveLength(13);
    expect(r.scans.map((s) => s.id)).toEqual([...ids.slice(0, 12), oldest]);
    const stamps = r.scans.map((s) => s.finishedAt);
    expect(stamps).toEqual([...stamps].sort().reverse());
  });

  it('lats north→south and lngs west→east', async () => {
    await setupClient();
    await seedRankScan({ finishedAt: ago(1), snapshots: acRepair() });
    const r = (await registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1 })) as GeoGridView;
    expect(r.lats).toEqual([32, 31.99, 31.98]);
    expect(r.lngs).toEqual([-97, -96.99, -96.98]);
  });

  it('map null without an image or when a point is outside bounds', async () => {
    await setupClient();
    await seedRankScan({ finishedAt: ago(1), snapshots: acRepair() });
    const none = (await registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1 })) as GeoGridView;
    expect(none.map).toBeNull();
    await seedMap({ ...BOUNDS, east: -96.985 });
    const outside = (await registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1 })) as GeoGridView;
    expect(outside.map).toBeNull();
    await dbs.owner.delete(rankMapImage);
    await seedMap();
    const ok = (await registry.invoke(owner, 'get_geogrid', { clientId: IDS.clientA1 })) as GeoGridView;
    expect(ok.map).toEqual({ url: `/files/rank-map/${IDS.clientA1}?v=abcdef012345`, bounds: BOUNDS, width: 800, height: 800, attribution: STADIA_ATTRIBUTION });
  });
});

describe('get_rank_trend', () => {
  const trend = (c: ReturnType<typeof ctx>, input: Record<string, unknown>) => registry.invoke(c, 'get_rank_trend', { clientId: IDS.clientA1, keyword: 'ac repair', ...input }) as Promise<RankTrendView>;
  const S7 = { gridSize: 7, radiusKm: 25, keywords: ['ac repair'] };

  it('trend returns 12 newest done scans with self and competitor metrics', async () => {
    await setupClient();
    const ids: string[] = [];
    for (let i = 0; i < 14; i++) ids.push(await seedRankScan({ finishedAt: ago(i + 1), snapshots: acRepair(), ...S7 }));
    const r = await trend(owner, {});
    expect(r.scans.map((s) => s.scanId)).toEqual(ids.slice(0, 12));
    expect(r.nextCursor).toBe(ids[11]);
    expect(r.scans[0]!.self).toEqual({ avgRank: 3.5, top3Share: 0.38, points: 8 });
    expect(r.scans[0]!.competitors).toEqual([{ competitorId: IDS.competitorX, name: 'Smith HVAC', tier: null, avgRank: 1.38, top3Share: 1 }]);
    expect(r.scans.every((s) => s.settingsChanged === false)).toBe(true);
    expect(r.scans[0]!.settingsKey).toBe(rankSettingsKey(S7));
  });

  it('skipped and failed scans ignored', async () => {
    await setupClient();
    const a = await seedRankScan({ finishedAt: ago(3), snapshots: acRepair() });
    await seedRankScan({ finishedAt: ago(2), snapshots: acRepair(), status: 'failed' });
    await seedRankScan({ finishedAt: ago(1), snapshots: [], status: 'skipped' });
    const r = await trend(am, {});
    expect(r.scans.map((s) => s.scanId)).toEqual([a]);
  });

  it('cursor pages back and ends with null', async () => {
    await setupClient();
    const [s1, s2, s3] = [await seedRankScan({ finishedAt: ago(3), snapshots: acRepair() }), await seedRankScan({ finishedAt: ago(2), snapshots: acRepair() }), await seedRankScan({ finishedAt: ago(1), snapshots: acRepair() })];
    const p1 = await trend(am, { limit: 2 });
    expect([p1.scans.map((s) => s.scanId), p1.nextCursor]).toEqual([[s3, s2], s2]);
    const p2 = await trend(am, { limit: 2, before: p1.nextCursor });
    expect([p2.scans.map((s) => s.scanId), p2.nextCursor]).toEqual([[s1], null]);
  });

  it('settingsChanged marks the scan after a settings change', async () => {
    await setupClient();
    await seedRankScan({ finishedAt: ago(3), snapshots: acRepair(), ...S7 });
    const mid = await seedRankScan({ finishedAt: ago(2), snapshots: acRepair(), ...S7, radiusKm: 30 });
    const last = await seedRankScan({ finishedAt: ago(1), snapshots: acRepair(), ...S7, radiusKm: 30 });
    const r = await trend(am, { limit: 2 });
    expect(r.scans.map((s) => [s.scanId, s.settingsChanged])).toEqual([[last, false], [mid, true]]);
    expect(r.nextCursor).toBe(mid);
  });

  it('limit 27 rejected', async () => {
    await setupClient();
    await expect(trend(am, { limit: 27 })).rejects.toThrow();
    await expect(trend(am, { limit: 26 })).resolves.toMatchObject({ scans: [] });
  });

  it('never reads another client’s scans', async () => {
    await setupClient();
    const mine = await seedRankScan({ finishedAt: ago(5), snapshots: acRepair() });
    const a2 = await seedRankScan({ finishedAt: ago(1), snapshots: acRepair(), clientId: IDS.clientA2 });
    const b1 = await seedRankScan({ finishedAt: ago(1), snapshots: acRepair(), agencyId: IDS.agencyB, clientId: IDS.clientB1 });
    expect((await trend(am, {})).scans.map((s) => s.scanId)).toEqual([mine]);
    await expect(trend(am, { before: a2 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(trend(am, { before: b1 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(trend(ownerNoDash, {})).rejects.toMatchObject({ code: 'not_found' });
  });

  it('tier null when unrated', async () => {
    await setupClient();
    await seedRankScan({ finishedAt: ago(1), snapshots: acRepair() });
    expect((await trend(am, {})).scans[0]!.competitors[0]!.tier).toBeNull();
    await dbs.owner.insert(competitorSignal).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, tier: 'top', overlap: 0.5, activity: 0.5, signals: {} });
    expect((await trend(am, {})).scans[0]!.competitors[0]!.tier).toBe('top');
  });

  it('self is null without a self business', async () => {
    await dbs.owner.update(client).set({ keywords: ['ac repair'], serviceArea: AREA }).where(eq(client.id, IDS.clientA1));
    await setPlace(IDS.competitorX, 'px');
    await seedRankScan({ finishedAt: ago(1), snapshots: acRepair() });
    expect((await trend(am, {})).scans[0]!.self).toBeNull();
  });
});

describe('get_share_of_voice', () => {
  it('splits the top-3 slots between you, competitors and other businesses per scan (decision 10)', async () => {
    await setupClient();
    const a = await seedRankScan({
      finishedAt: ago(40),
      snapshots: [
        ...gridSnapshots('ac repair', 1, () => [rr(1, 'self-place'), rr(2, 'px'), rr(3, 'o1')]),
        ...gridSnapshots('plumber', 1, () => [rr(1, 'o1'), rr(2, 'o2'), rr(3, 'o3')]),
      ],
    });
    const b = await seedRankScan({ finishedAt: ago(5), snapshots: gridSnapshots('ac repair', 2, () => [rr(1, 'px'), rr(2, 'o1'), rr(3, 'o2'), rr(4, 'self-place')]) });
    const c = await seedRankScan({ finishedAt: ago(1), snapshots: gridSnapshots('ac repair', 1, () => []) });
    await seedRankScan({ finishedAt: ago(1), snapshots: gridSnapshots('ac repair', 1, () => [rr(1, 'px')]), clientId: IDS.clientA2 });

    const r = (await registry.invoke(owner, 'get_share_of_voice', { clientId: IDS.clientA1 })) as ShareOfVoiceView;
    expect(r.scans.map((s) => s.id)).toEqual([a, b, c]);
    expect([r.keyword, r.keywords]).toEqual([null, ['ac repair', 'plumber']]);
    expect(r.series.map((s) => [s.key, s.name, s.self, s.points])).toEqual([
      ['self', 'A1 HVAC', true, [0.167, 0, null]],
      [IDS.competitorX, 'Smith HVAC', false, [0.167, 0.333, null]],
      ['other_businesses', 'Other businesses', false, [0.667, 0.667, null]],
    ]);
  });

  it('filters one keyword, limits the scans, and treats an unknown keyword as all', async () => {
    await setupClient();
    await seedRankScan({
      finishedAt: ago(40),
      snapshots: [
        ...gridSnapshots('ac repair', 1, () => [rr(1, 'self-place'), rr(2, 'px'), rr(3, 'o1')]),
        ...gridSnapshots('plumber', 1, () => [rr(1, 'o1'), rr(2, 'o2'), rr(3, 'o3')]),
      ],
    });
    const newest = await seedRankScan({ finishedAt: ago(5), snapshots: gridSnapshots('ac repair', 1, () => [rr(1, 'px')]) });
    const one = (await registry.invoke(am, 'get_share_of_voice', { clientId: IDS.clientA1, keyword: 'ac repair' })) as ShareOfVoiceView;
    expect(one.series[0]!.points[0]).toBeCloseTo(0.333, 3);
    const last = (await registry.invoke(am, 'get_share_of_voice', { clientId: IDS.clientA1, scans: 1 })) as ShareOfVoiceView;
    expect(last.scans.map((s) => s.id)).toEqual([newest]);
    expect(((await registry.invoke(am, 'get_share_of_voice', { clientId: IDS.clientA1, keyword: 'zzz' })) as ShareOfVoiceView).keyword).toBeNull();
    await expect(registry.invoke(ownerNoDash, 'get_share_of_voice', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
  });
});
