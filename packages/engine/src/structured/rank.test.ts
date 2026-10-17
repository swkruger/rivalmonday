import { clientCompetitor, competitor, detectedChange, type RankResult, rankScan, rankSnapshot, withTenant } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day } from '../../test/seed';
import { findEngineWork } from '../sweep';
import { competitorMatcher, diffRankScan, RANK_MIN_SHARED_POINTS, rankMetrics, rankSettingsKey } from './rank';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const POINTS = [[33.1, -96.1], [33.1, -96.2], [33.2, -96.1], [33.2, -96.2]] as const;
const hit = (rank: number): RankResult[] => [{ rank, placeId: 'PX', cid: null, domain: null, title: 'Smith HVAC' }];

async function scan(at: number, ranks: Record<string, number | null>, points: readonly (readonly [number, number])[] = POINTS) {
  const [s] = await dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done', startedAt: day(at), finishedAt: day(at) }).returning({ id: rankScan.id });
  for (const [keyword, rank] of Object.entries(ranks)) {
    for (const [lat, lng] of points) {
      await dbs.service.insert(rankSnapshot).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, scanId: s!.id, keyword, lat, lng, results: rank === null ? [] : hit(rank), capturedAt: day(at) });
    }
  }
  return s!.id;
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(competitor).set({ placeId: 'PX' }).where(eq(competitor.id, IDS.competitorX));
});

describe('rank metrics', () => {
  it('averages positions with not-found as 21, and measures the top-3 share', () => {
    const m = competitorMatcher({ placeId: 'PX', cid: null, domain: null });
    expect(rankMetrics([hit(2), hit(4), [], hit(1)], m)).toEqual({ avgRank: 7, top3Share: 0.5, points: 4 });
    expect(competitorMatcher({ placeId: null, cid: null, domain: 'smithhvac.example' })({ rank: 1, placeId: null, cid: null, domain: 'smithhvac.example', title: '' })).toBe(true);
  });
});

describe('diffRankScan', () => {
  it('treats the first scan as a baseline', async () => {
    const s0 = await scan(0, { 'ac repair': 10 });
    expect(await diffRankScan({ db: dbs.service }, s0)).toEqual({ ran: true, result: { baseline: true, changeIds: [] } });
  });

  it('records a tenant-private rank change when the average position or top-3 share moves enough', async () => {
    await scan(0, { 'ac repair': 10, 'furnace repair': 5 });
    const s1 = await scan(30, { 'ac repair': 2, 'furnace repair': 6 });
    await diffRankScan({ db: dbs.service }, s1);
    const rows = await dbs.service.select().from(detectedChange);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      competitorId: IDS.competitorX, source: 'rank', kind: 'modified', blockKey: 'rank:ac repair', rankScanId: s1, afterCaptureId: null, agencyId: IDS.agencyA, clientId: IDS.clientA1,
      details: { changeType: 'rank_change', keyword: 'ac repair', avgRankBefore: 10, avgRankAfter: 2, top3Before: 0, top3After: 1, points: 4 },
    });
    // B1 tracks competitor X too, but never sees A1's rank change.
    expect(await withTenant(dbs.app, { agencyId: IDS.agencyB, clientScope: 'all' }, (tx) => tx.select().from(detectedChange))).toEqual([]);
  });

  it('skips a keyword whose two scans share fewer than RANK_MIN_SHARED_POINTS grid points', async () => {
    expect(RANK_MIN_SHARED_POINTS).toBe(4);
    await scan(0, { 'ac repair': 10, 'furnace repair': 10 });
    const s1 = await scan(30, { 'ac repair': 2 }, POINTS.slice(0, 3));
    await diffRankScan({ db: dbs.service }, s1);
    expect(await dbs.service.select().from(detectedChange)).toEqual([]);
  });

  it('ignores competitors the client does not track and competitors absent from both scans', async () => {
    await dbs.owner.delete(clientCompetitor).where(eq(clientCompetitor.clientId, IDS.clientA1));
    await scan(0, { 'ac repair': 10 });
    const s1 = await scan(30, { 'ac repair': 2 });
    await diffRankScan({ db: dbs.service }, s1);
    expect(await dbs.service.select().from(detectedChange)).toEqual([]);
  });

  it('is offered by the sweep once the scan is done', async () => {
    await scan(0, { 'ac repair': 10 });
    const s1 = await scan(30, { 'ac repair': 2 });
    expect((await findEngineWork(dbs.service, { limit: 10 })).rankDiff).toContain(s1);
    await diffRankScan({ db: dbs.service }, s1);
    expect((await findEngineWork(dbs.service, { limit: 10 })).rankDiff).not.toContain(s1);
  });
});

describe('rank settings series identity and top-3 point gain (Phase 13b)', () => {
  const grid = (n: number) => Array.from({ length: n * n }, (_, i) => [33 + Math.floor(i / n) * 0.01, -96 + (i % n) * 0.01] as const);
  const SETTINGS = { gridSize: 7, radiusKm: 25, keywords: ['ac repair'] };

  /** One keyword on an n×n grid; the first `top3` points rank 3, the rest rank 4. */
  async function gridScan(at: number, top3: number, settings: { gridSize: number | null; radiusKm: number | null; keywords: string[] | null }, n = 7) {
    const [s] = await dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done', startedAt: day(at), finishedAt: day(at), ...settings }).returning({ id: rankScan.id });
    await dbs.service.insert(rankSnapshot).values(grid(n).map(([lat, lng], i) => ({
      agencyId: IDS.agencyA, clientId: IDS.clientA1, scanId: s!.id, keyword: 'ac repair', lat, lng, results: hit(i < top3 ? 3 : 4), capturedAt: day(at),
    })));
    return s!.id;
  }

  it('rankSettingsKey is stable, order-insensitive on keywords and distinguishes settings', () => {
    expect(rankSettingsKey({ gridSize: 7, radiusKm: 25, keywords: ['b', 'a'] })).toBe(rankSettingsKey({ gridSize: 7, radiusKm: 25, keywords: ['a', 'b'] }));
    expect(rankSettingsKey({ gridSize: 7, radiusKm: 25, keywords: ['a'] })).not.toBe(rankSettingsKey({ gridSize: 5, radiusKm: 25, keywords: ['a'] }));
    expect(rankSettingsKey({ gridSize: 7, radiusKm: 25, keywords: ['a'] })).not.toBe(rankSettingsKey({ gridSize: 7, radiusKm: 30, keywords: ['a'] }));
    expect(rankSettingsKey({ gridSize: 7, radiusKm: 25, keywords: ['a'] })).not.toBe(rankSettingsKey({ gridSize: 7, radiusKm: 25, keywords: ['a', 'b'] }));
  });

  it('rankSettingsKey follows P7: legacy, rounded radius, opaque hash, unambiguous keywords', () => {
    expect(rankSettingsKey({ gridSize: 7, radiusKm: null, keywords: ['a'] })).toBe('legacy');
    expect(rankSettingsKey({ gridSize: null, radiusKm: 25, keywords: ['a'] })).toBe('legacy');
    expect(rankSettingsKey({ gridSize: 7, radiusKm: 25, keywords: null })).toBe('legacy');
    expect(rankSettingsKey({ gridSize: 7, radiusKm: 25, keywords: ['a'] })).toBe(rankSettingsKey({ gridSize: 7, radiusKm: 25.000000001, keywords: ['a'] }));
    expect(rankSettingsKey({ gridSize: 7, radiusKm: 25, keywords: ['a'] })).toMatch(/^[0-9a-f]{16}$/);
    expect(rankSettingsKey({ gridSize: 7, radiusKm: 25, keywords: ['a,b'] })).not.toBe(rankSettingsKey({ gridSize: 7, radiusKm: 25, keywords: ['a', 'b'] }));
    expect(rankSettingsKey({ gridSize: 7, radiusKm: 25, keywords: ['b', 'a'] })).toBe(rankSettingsKey({ gridSize: 7, radiusKm: 25, keywords: ['a', 'b'] }));
  });

  it('settings change → baseline', async () => {
    await gridScan(0, 0, SETTINGS);
    const s1 = await gridScan(30, 20, { ...SETTINGS, radiusKm: 30 });
    expect(await diffRankScan({ db: dbs.service }, s1)).toEqual({ ran: true, result: { baseline: true, changeIds: [] } });
    expect(await dbs.service.select().from(detectedChange)).toEqual([]);
  });

  it('legacy key equals legacy key', async () => {
    const legacy = { gridSize: null, radiusKm: null, keywords: null };
    expect(rankSettingsKey(legacy)).toBe(rankSettingsKey(legacy));
    await gridScan(0, 0, legacy);
    const s1 = await gridScan(30, 20, legacy);
    const out = await diffRankScan({ db: dbs.service }, s1);
    expect(out).toMatchObject({ ran: true, result: { baseline: false } });
    expect(await dbs.service.select().from(detectedChange)).toHaveLength(1);
  });

  it('top-3 point gain of 5 alone records a change with point details', async () => {
    await gridScan(0, 0, SETTINGS);
    const s1 = await gridScan(30, 5, SETTINGS);
    await diffRankScan({ db: dbs.service }, s1);
    const rows = await dbs.service.select().from(detectedChange);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.details).toMatchObject({ changeType: 'rank_change', keyword: 'ac repair', top3PointsBefore: 0, top3PointsAfter: 5, scanId: s1, points: 49 });
  });

  it('gain of 4 with small share delta records nothing', async () => {
    await gridScan(0, 0, SETTINGS);
    const s1 = await gridScan(30, 4, SETTINGS);
    await diffRankScan({ db: dbs.service }, s1);
    expect(await dbs.service.select().from(detectedChange)).toEqual([]);
  });
});
