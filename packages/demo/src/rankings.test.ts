import { rankScan, rankSnapshot } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
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
  it('writes 8 weekly scans per active client; Lone Star has one failed scan', async () => {
    const ls = await dbs.owner.select().from(rankScan).where(eq(rankScan.clientId, ctx.ids.clients.loneStar));
    const bz = await dbs.owner.select().from(rankScan).where(eq(rankScan.clientId, ctx.ids.clients.brazos));
    expect([ls.length, bz.length]).toEqual([8, 8]);
    expect(ls.filter((s) => s.status === 'failed')).toHaveLength(1);
    expect(bz.every((s) => s.status === 'done')).toBe(true);
  });

  it('covers 3 keywords on a 7×7 grid, with one failed point in one Lone Star scan', async () => {
    const counts = [...(await dbs.owner.execute<{ scan_id: string; n: number }>(sql`select scan_id, count(*)::int as n from rank_snapshot where client_id = ${ctx.ids.clients.loneStar} group by scan_id`))].map((r) => Number(r.n)).sort();
    expect(counts).toEqual([146, 147, 147, 147, 147, 147, 147]);
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
