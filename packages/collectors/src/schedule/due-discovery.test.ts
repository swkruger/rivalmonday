import { client, competitor, siteDiscovery } from '@cs/db';
import { IDS, openTestDbs, pauseAgency, pauseClient, seedTenancy, spendPauseClient, truncateAll } from '@cs/db/test-helpers';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { claimDueDiscoveries } from './due-discovery';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

/** Hours `now() + interval '28 days'` lies ahead in the session tz (DST-safe, as due-pages.test.ts). */
const cadenceHours = async () => {
  const [r] = (await dbs.service.execute(sql`SELECT round(extract(epoch FROM ((now() + interval '28 days') - now())) / 3600) AS h`)) as unknown as { h: string }[];
  return Number(r!.h);
};

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(competitor).set({ domain: 'smithhvac.com' }).where(eq(competitor.id, IDS.competitorX));
  await dbs.owner.update(competitor).set({ domain: 'brightsmiles.com' }).where(eq(competitor.id, IDS.competitorY));
});

describe('claimDueDiscoveries', () => {
  it('claims competitors without a row once, then advances them 28 days', async () => {
    const first = await claimDueDiscoveries(dbs.service, 25);
    expect([...first].sort()).toEqual([IDS.competitorX, IDS.competitorY].sort());
    expect(await claimDueDiscoveries(dbs.service, 25)).toEqual([]);
    const [r] = (await dbs.service.execute(sql`SELECT round(extract(epoch FROM (next_due_at - now())) / 3600) AS h FROM site_discovery WHERE competitor_id = ${IDS.competitorX}`)) as unknown as { h: string }[];
    expect(Number(r!.h)).toBe(await cadenceHours());
  });

  it('claims a due row, skips a future one', async () => {
    await dbs.owner.insert(siteDiscovery).values([
      { competitorId: IDS.competitorX, nextDueAt: sql`now() - interval '1 minute'` },
      { competitorId: IDS.competitorY, nextDueAt: sql`now() + interval '1 day'` },
    ]);
    expect(await claimDueDiscoveries(dbs.service, 25)).toEqual([IDS.competitorX]);
  });

  it('never hands the same competitor to concurrent claimers', async () => {
    const [a, b] = await Promise.all([claimDueDiscoveries(dbs.service, 25), claimDueDiscoveries(dbs.service, 25)]);
    expect([...a, ...b].sort()).toEqual([IDS.competitorX, IDS.competitorY].sort());
  });

  it('respects the limit', async () => {
    expect(await claimDueDiscoveries(dbs.service, 1)).toHaveLength(1);
  });

  it('skips domain-less and untracked competitors', async () => {
    await dbs.owner.update(competitor).set({ domain: null }).where(eq(competitor.id, IDS.competitorY));
    const [u] = await dbs.owner.insert(competitor).values({ name: 'Untracked Co', domain: 'untracked.example' }).returning();
    const claimed = await claimDueDiscoveries(dbs.service, 25);
    expect(claimed).toEqual([IDS.competitorX]);
    expect(claimed).not.toContain(u!.id);
  });

  it('skips competitors only prospects, paused or spend-paused clients track; a shared one still runs', async () => {
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA2));
    expect(await claimDueDiscoveries(dbs.service, 25)).toEqual([IDS.competitorX]); // Y only via A2
    await dbs.owner.update(client).set({ status: 'active' }).where(eq(client.id, IDS.clientA2));
    await dbs.owner.update(siteDiscovery).set({ nextDueAt: sql`now() - interval '1 minute'` });
    await spendPauseClient(dbs.owner, IDS.clientA2);
    expect(await claimDueDiscoveries(dbs.service, 25)).toEqual([IDS.competitorX]);
    await dbs.owner.update(siteDiscovery).set({ nextDueAt: sql`now() - interval '1 minute'` });
    for (const id of [IDS.clientA1, IDS.clientA2, IDS.clientB1]) await pauseClient(dbs.owner, id);
    expect(await claimDueDiscoveries(dbs.service, 25)).toEqual([]);
  });

  it('skips competitors only read-only agencies track', async () => {
    await pauseAgency(dbs.owner, IDS.agencyA);
    await pauseAgency(dbs.owner, IDS.agencyB, 'suspended');
    expect(await claimDueDiscoveries(dbs.service, 25)).toEqual([]);
  });
});
