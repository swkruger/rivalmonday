import { client, competitor } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { findExistingCompetitor, patchReusedCompetitor } from './accept';
import { ensureSelfCompetitor } from './self';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
// A suggestion's vendor identifiers (accept_competitor_suggestion(s) reuse rows through these helpers).
const SUG = { name: 'Cool Air', domain: 'coolair.example', placeId: 'p9', cid: '999' };
const row = async (id: string) => (await dbs.service.select().from(competitor).where(eq(competitor.id, id)))[0]!;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('findExistingCompetitor + patchReusedCompetitor', () => {
  it('nothing matches → undefined', async () => {
    expect(await findExistingCompetitor(dbs.service, SUG)).toBeUndefined();
  });

  it('matches by place id first', async () => {
    const [existing] = await dbs.service.insert(competitor).values({ name: 'Cool Air LLC', placeId: 'p9' }).returning();
    expect((await findExistingCompetitor(dbs.service, SUG))?.id).toBe(existing!.id);
  });

  it('matches by cid and backfills the missing place id', async () => {
    const [existing] = await dbs.service.insert(competitor).values({ name: 'Cool Air LLC', cid: '999' }).returning();
    const found = await findExistingCompetitor(dbs.service, SUG);
    expect(found?.id).toBe(existing!.id);
    await patchReusedCompetitor(dbs.service, found!, SUG);
    expect(await row(existing!.id)).toMatchObject({ placeId: 'p9', cid: '999' });
  });

  it('never merges onto a different competitor that happens to share a domain', async () => {
    await dbs.service.insert(competitor).values({ name: 'Cool Air Other Branch', placeId: 'p8', domain: 'coolair.example' });
    expect(await findExistingCompetitor(dbs.service, SUG)).toBeUndefined();
  });

  it('matches by domain when the row has no place id, backfilling place id and cid', async () => {
    const [existing] = await dbs.service.insert(competitor).values({ name: 'Cool Air LLC', domain: 'coolair.example' }).returning();
    const found = await findExistingCompetitor(dbs.service, SUG);
    expect(found?.id).toBe(existing!.id);
    await patchReusedCompetitor(dbs.service, found!, SUG);
    expect(await row(existing!.id)).toMatchObject({ domain: 'coolair.example', placeId: 'p9', cid: '999' });
  });

  it('backfill: false only renames a self row and never writes identifiers', async () => {
    const [existing] = await dbs.service.insert(competitor).values({ name: 'Cool Air LLC', cid: '999' }).returning();
    await patchReusedCompetitor(dbs.service, existing!, SUG, { backfill: false });
    expect(await row(existing!.id)).toMatchObject({ name: 'Cool Air LLC', placeId: null, domain: null });
  });

  it("reusing another client's self-competitor row never leaks tenant-written client.name", async () => {
    // A1's self business: ensureSelfCompetitor names the row from client.name (tenant-private), no domain.
    await dbs.owner.update(client).set({ placeId: 'place-shared' }).where(eq(client.id, IDS.clientA1));
    const selfId = ((await ensureSelfCompetitor(dbs.service, IDS.clientA1)) as { competitorId: string }).competitorId;
    expect(await row(selfId)).toMatchObject({ name: 'A1 HVAC', domain: null });
    // Agency B independently discovers the same place with a real domain and GBP name.
    const sugB = { name: 'Real Biz GBP Name', domain: 'realbiz.example', placeId: 'place-shared', cid: null };
    const found = await findExistingCompetitor(dbs.service, sugB);
    expect(found?.id).toBe(selfId);
    await patchReusedCompetitor(dbs.service, found!, sugB);
    expect(await row(selfId)).toMatchObject({ name: 'Real Biz GBP Name', domain: 'realbiz.example', placeId: 'place-shared' });
  });
});
