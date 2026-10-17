import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { errorText, IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { client, rankMapImage, rankScan } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const image = (agencyId: string, clientId: string) => ({
  agencyId,
  clientId,
  settingsHash: 'h1',
  objectKey: `rank-map/${clientId}.png`,
  bounds: { west: 1, south: 2, east: 3, north: 4 },
  width: 640,
  height: 640,
});

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('phase 13b rank upgrade schema', () => {
  it('client rank columns default to [] and 7', async () => {
    const [c] = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1));
    expect(c).toMatchObject({ rankKeywords: [], rankGridSize: 7 });
  });

  it('rank_grid_size 6 is rejected', async () => {
    expect(await errorText(dbs.service.update(client).set({ rankGridSize: 6 }).where(eq(client.id, IDS.clientA1)))).toMatch(/client_rank_grid_size_check/);
    await dbs.service.update(client).set({ rankGridSize: 5 }).where(eq(client.id, IDS.clientA1));
  });

  it('six rank keywords are rejected', async () => {
    expect(await errorText(dbs.service.update(client).set({ rankKeywords: ['a', 'b', 'c', 'd', 'e', 'f'] }).where(eq(client.id, IDS.clientA1)))).toMatch(/client_rank_keywords_check/);
    await dbs.service.update(client).set({ rankKeywords: ['a', 'b', 'c', 'd', 'e'] }).where(eq(client.id, IDS.clientA1));
  });

  it("rank_scan status 'queued' is rejected, 'skipped' accepted", async () => {
    expect(await errorText(dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'queued' as never }))).toMatch(/rank_scan_status_check/);
    const [s] = await dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'skipped' }).returning();
    expect(s).toMatchObject({ status: 'skipped', trigger: 'scheduled', gridSize: null, keywords: null });
  });

  it('a second running scan for one client violates rank_scan_running_unique', async () => {
    await dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1 });
    expect(await errorText(dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1 }))).toMatch(/rank_scan_running_unique/);
    // other clients and finished scans are unaffected
    await dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA2 });
    await dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done' });
  });

  it("agency B cannot select agency A's rank_map_image", async () => {
    await dbs.service.insert(rankMapImage).values(image(IDS.agencyA, IDS.clientA1));
    expect(await withTenant(dbs.app, { agencyId: IDS.agencyB, clientScope: 'all' }, (tx) => tx.select().from(rankMapImage))).toHaveLength(0);
    expect(await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.select().from(rankMapImage))).toHaveLength(1);
  });

  it("a client-scoped member sees only their client's image", async () => {
    await dbs.service.insert(rankMapImage).values([image(IDS.agencyA, IDS.clientA1), image(IDS.agencyA, IDS.clientA2)]);
    const rows = await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, (tx) => tx.select().from(rankMapImage));
    expect(rows.map((r) => r.clientId)).toEqual([IDS.clientA1]);
  });

  it('app_user cannot insert rank_map_image', async () => {
    expect(await errorText(withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.insert(rankMapImage).values(image(IDS.agencyA, IDS.clientA1))))).toMatch(/permission denied/i);
  });

  it('app_user can update rank_keywords/rank_grid_size through withTenant', async () => {
    await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) =>
      tx.update(client).set({ rankKeywords: ['ac repair'], rankGridSize: 5 }).where(eq(client.id, IDS.clientA1)),
    );
    const [c] = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1));
    expect(c).toMatchObject({ rankKeywords: ['ac repair'], rankGridSize: 5 });
  });
});
