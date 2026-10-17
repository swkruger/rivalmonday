import { changeEvent, detectedChange, move, moveEvent, rankScan, rankSnapshot } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { competitorMatcher, rankMetrics, rankSettingsKey } from '@cs/engine';
import { createMemoryStore } from '@cs/storage';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeedContext, type SeedContext } from './context';
import { GRID_SIZE, gridPoints, seedRankings } from './rankings';
import { CLIENT_SPECS, LONE_STAR_PLACE_ID, seedTenancy } from './tenancy';
import { countRows, resetDemoTables, TEST_SALT } from './test-support';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
let ctx: SeedContext;

beforeAll(async () => {
  await resetDemoTables(dbs.owner);
  ctx = createSeedContext({ db: dbs.owner, store: createMemoryStore(), now: new Date(), salt: TEST_SALT });
  await seedTenancy(ctx);
  await seedRankings(ctx);
});

describe('gridPoints', () => {
  it('lays a 7×7 grid across the service area, north to south and west to east', () => {
    const pts = gridPoints({ lat: 32.44, lng: -97.79 }, 25);
    expect(pts).toHaveLength(GRID_SIZE * GRID_SIZE);
    expect(pts[0]!.lat).toBeGreaterThan(pts[GRID_SIZE * (GRID_SIZE - 1)]!.lat);
    expect(pts[0]!.lng).toBeLessThan(pts[GRID_SIZE - 1]!.lng);
  });
});

describe('seedRankings', () => {
  it('writes 12 weekly scans per active client; Lone Star has one failed scan', async () => {
    const ls = await dbs.owner.select().from(rankScan).where(eq(rankScan.clientId, ctx.ids.clients.loneStar));
    const bz = await dbs.owner.select().from(rankScan).where(eq(rankScan.clientId, ctx.ids.clients.brazos));
    expect([ls.filter((s) => s.status === 'done').length, bz.length]).toEqual([12, 12]);
    expect(ls.filter((s) => s.status === 'failed')).toHaveLength(1);
    expect(bz.every((s) => s.status === 'done')).toBe(true);
  });

  it('covers 3 keywords on a 7×7 grid, with one failed point in one Lone Star scan', async () => {
    const counts = [...(await dbs.owner.execute<{ scan_id: string; n: number }>(sql`select scan_id, count(*)::int as n from rank_snapshot where client_id = ${ctx.ids.clients.loneStar} group by scan_id`))].map((r) => Number(r.n)).sort();
    expect(counts).toEqual([146, ...Array(11).fill(147)]);
    const kws = await dbs.owner.selectDistinct({ k: rankSnapshot.keyword }).from(rankSnapshot).where(eq(rankSnapshot.clientId, ctx.ids.clients.loneStar));
    expect(kws.map((k) => k.k).sort()).toEqual([...CLIENT_SPECS.loneStar.keywords].sort());
  });

  it('puts Lone Star outside the top 20 at the edge for one keyword, and never ranks the no-rankings competitor', async () => {
    const edge = await dbs.owner.select({ results: rankSnapshot.results }).from(rankSnapshot)
      .where(and(eq(rankSnapshot.clientId, ctx.ids.clients.loneStar), eq(rankSnapshot.keyword, CLIENT_SPECS.loneStar.keywords[2]!)));
    expect(edge.some((s) => !s.results.some((r) => r.placeId === LONE_STAR_PLACE_ID))).toBe(true);
    const never = ctx.ids.competitors.loneStar.find((c) => c.id === ctx.ids.noData.rankings)!.placeId;
    expect(await countRows(dbs.owner, sql`select count(*)::int as n from rank_snapshot where results::text like ${`%${never}%`}`)).toBe(0);
  });
});

describe('seedRankings (Phase 13b)', () => {
  const lsScans = async () =>
    (await dbs.owner.select().from(rankScan).where(and(eq(rankScan.clientId, ctx.ids.clients.loneStar), eq(rankScan.status, 'done')))).sort((a, b) => a.finishedAt!.getTime() - b.finishedAt!.getTime());

  it('fills the settings snapshot columns so every done scan keys equal', async () => {
    const all = await dbs.owner.select().from(rankScan).where(eq(rankScan.status, 'done'));
    expect(all.every((s) => s.gridSize === GRID_SIZE && s.radiusKm !== null && (s.keywords?.length ?? 0) > 0 && s.trigger === 'scheduled')).toBe(true);
    for (const key of ['loneStar', 'brazos'] as const) {
      const keys = new Set(all.filter((s) => s.clientId === ctx.ids.clients[key]).map((s) => rankSettingsKey(s)));
      expect(keys.size).toBe(1);
      expect([...keys][0]).not.toBe('legacy');
    }
  });

  it('one competitor climbs ≥ 5 top-3 points across the last two scans', async () => {
    const last3 = (await lsScans()).slice(-3);
    const match = competitorMatcher({ ...ctx.ids.competitors.loneStar[0]!, cid: null });
    const kw = CLIENT_SPECS.loneStar.keywords[0]!;
    const pts = async (scanId: string) => {
      const rows = await dbs.owner.select({ results: rankSnapshot.results }).from(rankSnapshot).where(and(eq(rankSnapshot.scanId, scanId), eq(rankSnapshot.keyword, kw)));
      const m = rankMetrics(rows.map((r) => r.results), match);
      return Math.round(m.top3Share * m.points);
    };
    const [a, , c] = await Promise.all(last3.map((s) => pts(s.id)));
    expect(c! - a!).toBeGreaterThanOrEqual(5);
  });

  it('seeds rank_change changes and events for the climb, tenant-private', async () => {
    const changes = await dbs.owner.select().from(detectedChange).where(eq(detectedChange.source, 'rank'));
    const rc = changes.filter((c) => c.details.changeType === 'rank_change');
    expect(rc.length).toBeGreaterThanOrEqual(1);
    const gain = rc.reduce((n, c) => n + ((c.details.top3PointsAfter ?? 0) - (c.details.top3PointsBefore ?? 0)), 0);
    expect(gain).toBeGreaterThanOrEqual(5);
    for (const c of rc) {
      expect(c).toMatchObject({ kind: 'modified', stageVersion: 1, status: 'event', agencyId: ctx.ids.agencyId, clientId: ctx.ids.clients.loneStar });
      expect(c.blockKey).toBe(`rank:${c.details.keyword}`);
      expect(c.rankScanId).toBe(c.details.scanId);
    }
    const evs = await dbs.owner.select().from(changeEvent).where(eq(changeEvent.changeType, 'rank_change'));
    expect(evs).toHaveLength(rc.length);
    expect(evs.every((e) => e.agencyId === ctx.ids.agencyId && e.clientId === ctx.ids.clients.loneStar && e.channels[0] === 'rank')).toBe(true);
  });

  it('seeds one open map_climb move', async () => {
    const moves = await dbs.owner.select().from(move).where(eq(move.moveType, 'map_climb'));
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ status: 'emerging', closedAt: null, ruleVersion: 3, clientId: ctx.ids.clients.loneStar });
    expect(ctx.ids.moves.filter((m) => m.moveType === 'map_climb' && m.open)).toHaveLength(1);
    const linked = await dbs.owner.select().from(moveEvent).where(eq(moveEvent.moveId, moves[0]!.id));
    expect(linked.length).toBeGreaterThanOrEqual(1);
  });

  it('seeds one tier_change (watch → top) on the latest scan', async () => {
    const latest = (await lsScans()).at(-1)!;
    const rows = await dbs.owner.select().from(detectedChange).where(sql`details->>'changeType' = 'tier_change'`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'rank', kind: 'modified', rankScanId: latest.id, beforeText: 'Worth watching', afterText: 'Top rival', stageVersion: 1 });
    expect(rows[0]!.blockKey).toMatch(/^tier:\d{4}-\d{2}-\d{2}$/);
    expect(rows[0]!.details).toMatchObject({ from: 'watch', to: 'top' });
    const evs = await dbs.owner.select().from(changeEvent).where(eq(changeEvent.changeType, 'tier_change'));
    expect(evs).toHaveLength(1);
    expect(evs[0]!.clientId).toBe(ctx.ids.clients.loneStar);
  });
});
