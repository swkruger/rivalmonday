import { client, clientCompetitor } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { GeoGridView, ShareOfVoiceView } from './schemas';
import { ago, ctx, dbs, gridSnapshots, registry, resetWorkspace, rr, seedRankScan, seedSelf, setPlace } from './workspace-fixtures';

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
      { keyword: 'ac repair', top3: 8, points: 8, avgRank: 1.4 },
      { keyword: 'plumber', top3: 0, points: 9, avgRank: 21 },
    ]);
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
    expect(r.keywordSummaries).toEqual([{ keyword: 'ac repair', top3: 0, points: 0, avgRank: null }]);
  });

  it('reports the setup state, and refuses an untracked business and a missing dashboard flag', async () => {
    let r = (await registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1 })) as GeoGridView;
    expect([r.setup, r.business, r.cells]).toEqual(['no_keywords', IDS.competitorX, []]);
    await dbs.owner.update(client).set({ keywords: ['ac repair'], serviceArea: AREA }).where(eq(client.id, IDS.clientA1));
    r = (await registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1 })) as GeoGridView;
    expect([r.setup, r.scans]).toEqual(['no_scan', []]);
    await expect(registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1, business: IDS.competitorY })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(am, 'get_geogrid', { clientId: IDS.clientA1, business: 'self' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ownerNoDash, 'get_geogrid', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'permission_denied' });
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
    await expect(registry.invoke(ownerNoDash, 'get_share_of_voice', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'permission_denied' });
  });
});
