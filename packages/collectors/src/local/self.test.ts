import { client, competitor, competitorSource } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureSelfCompetitor, ensureSelfCompetitors } from './self';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

const selfOf = async (clientId: string) => (await dbs.owner.select({ s: client.selfCompetitorId }).from(client).where(eq(client.id, clientId)))[0]?.s ?? null;

describe('ensureSelfCompetitor', () => {
  it('creates a competitor row for the client place, links it, and schedules only GBP and reviews', async () => {
    await dbs.owner.update(client).set({ placeId: 'place-a1' }).where(eq(client.id, IDS.clientA1));
    const r = await ensureSelfCompetitor(dbs.service, IDS.clientA1);
    expect(r).toMatchObject({ competitorId: expect.any(String) });
    const id = (r as { competitorId: string }).competitorId;
    expect(await selfOf(IDS.clientA1)).toBe(id);
    expect((await dbs.owner.select().from(competitor).where(eq(competitor.id, id)))[0]).toMatchObject({ name: 'A1 HVAC', placeId: 'place-a1', domain: null });
    expect((await dbs.owner.select({ s: competitorSource.source }).from(competitorSource).where(eq(competitorSource.competitorId, id))).map((x) => x.s).sort()).toEqual(['gbp', 'reviews']);
    expect(await ensureSelfCompetitor(dbs.service, IDS.clientA1)).toEqual({ competitorId: id }); // idempotent
  });

  it('reuses an existing competitor with the same place id (the business is already tracked by someone)', async () => {
    await dbs.owner.update(competitor).set({ placeId: 'place-x' }).where(eq(competitor.id, IDS.competitorX));
    await dbs.owner.update(client).set({ placeId: 'place-x' }).where(eq(client.id, IDS.clientA2));
    expect(await ensureSelfCompetitor(dbs.service, IDS.clientA2)).toEqual({ competitorId: IDS.competitorX });
    expect(await selfOf(IDS.clientA2)).toBe(IDS.competitorX);
  });

  it('skips a client without a place id, and ensureSelfCompetitors links every eligible client once', async () => {
    expect(await ensureSelfCompetitor(dbs.service, IDS.clientB1)).toEqual({ skipped: 'client has no placeId' });
    await dbs.owner.update(client).set({ placeId: 'place-a1' }).where(eq(client.id, IDS.clientA1));
    expect(await ensureSelfCompetitors(dbs.service)).toBe(1);
    expect(await ensureSelfCompetitors(dbs.service)).toBe(0);
  });
});
