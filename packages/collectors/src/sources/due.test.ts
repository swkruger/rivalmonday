import { agencyBilling, client, competitor, competitorSource } from '@cs/db';
import { IDS, openTestDbs, pauseAgency, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { claimDueSources, markSourceResult, releaseSources } from './due';
import { ensureCompetitorSources } from './ensure';
import { SOURCE_KINDS } from './kinds';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(competitorSource).values([
    { competitorId: IDS.competitorX, source: 'gbp', nextDueAt: sql`now() - interval '1 minute'` },
    { competitorId: IDS.competitorX, source: 'reviews', nextDueAt: sql`now() + interval '1 day'` },
    { competitorId: IDS.competitorY, source: 'gbp', active: false, nextDueAt: sql`now() - interval '1 day'` },
  ]);
});

describe('claimDueSources', () => {
  it('claims due active sources once', async () => {
    expect(await claimDueSources(dbs.service, 10)).toEqual([{ competitorId: IDS.competitorX, source: 'gbp' }]);
    expect(await claimDueSources(dbs.service, 10)).toEqual([]);
    await markSourceResult(dbs.service, IDS.competitorX, 'gbp', 'ok');
    const rows = (await dbs.service.execute(sql`SELECT last_status FROM competitor_source WHERE source = 'gbp' AND competitor_id = ${IDS.competitorX}`)) as unknown as { last_status: string }[];
    expect(rows[0]?.last_status).toBe('ok');
  });

  it('never claims vendor sources of a competitor nobody tracks; a self business keeps gbp/reviews/ads_google', async () => {
    // Competitor U: no client_competitor link and not a self business. Competitor S: some client's self_competitor_id.
    const [u] = await dbs.owner.insert(competitor).values({ name: 'Untracked Co' }).returning();
    const [s] = await dbs.owner.insert(competitor).values({ name: 'Self Co' }).returning();
    await dbs.owner.update(client).set({ selfCompetitorId: s!.id }).where(eq(client.id, IDS.clientA1));
    await dbs.service.insert(competitorSource).values(
      SOURCE_KINDS.flatMap((source) => [
        { competitorId: u!.id, source, nextDueAt: sql`now() - interval '1 minute'` },
        { competitorId: s!.id, source, nextDueAt: sql`now() - interval '1 minute'` },
      ]),
    );
    const claimed = await claimDueSources(dbs.service, 100);
    expect(claimed.filter((c) => c.competitorId === u!.id)).toEqual([]);
    expect(claimed.filter((c) => c.competitorId === s!.id).map((c) => c.source).sort()).toEqual(['ads_google', 'gbp', 'reviews']);
  });

  it('never claims a competitor only prospects track, nor a prospect’s own business; resumes on convert (5b-2 decision 9)', async () => {
    // A2 (the only client tracking Y) is a prospect; B1 is a prospect too, but X is still tracked by active A1.
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA2));
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientB1));
    const [self] = await dbs.owner.insert(competitor).values({ name: 'A2 Dental', placeId: 'ChIJprospectSelf01' }).returning();
    await dbs.owner.update(client).set({ selfCompetitorId: self!.id }).where(eq(client.id, IDS.clientA2));
    await ensureCompetitorSources(dbs.service, IDS.competitorX);
    await ensureCompetitorSources(dbs.service, IDS.competitorY);
    await ensureCompetitorSources(dbs.service, self!.id, ['gbp', 'reviews']);
    expect(new Set((await claimDueSources(dbs.service, 100)).map((c) => c.competitorId))).toEqual(new Set([IDS.competitorX]));
    await dbs.owner.update(client).set({ status: 'active' }).where(eq(client.id, IDS.clientA2));
    expect(new Set((await claimDueSources(dbs.service, 100)).map((c) => c.competitorId))).toEqual(new Set([IDS.competitorY, self!.id]));
  });
});

describe('releaseSources', () => {
  it('resets a claimed source back to due-now and records the failure status', async () => {
    // Simulate claimDueSources's 7-day advance on a source that then failed to post.
    await dbs.service.insert(competitorSource).values([{ competitorId: IDS.competitorX, source: 'ads_meta', nextDueAt: sql`now() + interval '7 days'` }]);
    await releaseSources(dbs.service, [{ competitorId: IDS.competitorX, source: 'ads_meta' }], 'post_failed');
    const rows = (await dbs.service.execute(
      sql`SELECT (next_due_at <= now()) AS due, last_status FROM competitor_source WHERE source = 'ads_meta' AND competitor_id = ${IDS.competitorX}`,
    )) as unknown as { due: boolean; last_status: string }[];
    expect(rows[0]?.due).toBe(true);
    expect(rows[0]?.last_status).toBe('post_failed');
  });

  it('is a no-op for an empty list', async () => {
    await expect(releaseSources(dbs.service, [], 'post_failed')).resolves.toBeUndefined();
  });
});

describe('claimDueSources and billing state (9a)', () => {
  it('tracked-competitor branch: nothing is claimed while every tracking agency is read_only; a serviceable one keeps it claimable', async () => {
    await pauseAgency(dbs.owner, IDS.agencyA);
    expect(await claimDueSources(dbs.service, 10)).toEqual([{ competitorId: IDS.competitorX, source: 'gbp' }]); // agency B still tracks X
    await dbs.service.update(competitorSource).set({ nextDueAt: sql`now() - interval '1 minute'` }).where(eq(competitorSource.competitorId, IDS.competitorX));
    await pauseAgency(dbs.owner, IDS.agencyB);
    expect(await claimDueSources(dbs.service, 10)).toEqual([]);
  });

  it('self-business branch: a read_only agency’s own business is not claimed; a serviceable agency’s is', async () => {
    const [sa] = await dbs.owner.insert(competitor).values({ name: 'A Self' }).returning();
    const [sb] = await dbs.owner.insert(competitor).values({ name: 'B Self' }).returning();
    await dbs.owner.update(client).set({ selfCompetitorId: sa!.id }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.update(client).set({ selfCompetitorId: sb!.id }).where(eq(client.id, IDS.clientB1));
    await dbs.service.insert(competitorSource).values([
      { competitorId: sa!.id, source: 'gbp', nextDueAt: sql`now() - interval '1 minute'` },
      { competitorId: sb!.id, source: 'gbp', nextDueAt: sql`now() - interval '1 minute'` },
    ]);
    await pauseAgency(dbs.owner, IDS.agencyA);
    await pauseAgency(dbs.owner, IDS.agencyB, 'suspended');
    await dbs.service.update(competitorSource).set({ active: false }).where(eq(competitorSource.competitorId, IDS.competitorX));
    expect(await claimDueSources(dbs.service, 10)).toEqual([]);
    await dbs.owner.delete(agencyBilling).where(eq(agencyBilling.agencyId, IDS.agencyB));
    expect(await claimDueSources(dbs.service, 10)).toEqual([{ competitorId: sb!.id, source: 'gbp' }]);
  });
});
