import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { errorText, IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { eq } from 'drizzle-orm';
import { citationAuditRun, citationListing, client, competitor } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

const listing = (competitorId: string, host = 'yelp.com') => ({ competitorId, host, status: 'listed' as const, checkedAt: new Date() });
const run = (agencyId: string, clientId: string, status: 'running' | 'done' = 'done') =>
  ({ agencyId, clientId, trigger: 'setup' as const, status, competitorIds: [IDS.competitorX] });

describe('citation_audit_run', () => {
  it('client B sees none of agency A\'s runs', async () => {
    await dbs.service.insert(citationAuditRun).values([run(IDS.agencyA, IDS.clientA1), run(IDS.agencyB, IDS.clientB1)]);
    const rows = await withTenant(dbs.app, { agencyId: IDS.agencyB, clientScope: [IDS.clientB1] }, (tx) => tx.select().from(citationAuditRun));
    expect(rows.map((r) => r.clientId)).toEqual([IDS.clientB1]);
  });

  it('a second running run for a client hits citation_audit_run_one_live', async () => {
    await dbs.service.insert(citationAuditRun).values(run(IDS.agencyA, IDS.clientA1, 'running'));
    expect(await errorText(dbs.service.insert(citationAuditRun).values(run(IDS.agencyA, IDS.clientA1, 'running')))).toMatch(/citation_audit_run_one_live/);
    await dbs.service.insert(citationAuditRun).values(run(IDS.agencyA, IDS.clientA1, 'done'));
  });
});

describe('citation_audit_run trigger check (0108)', () => {
  it("accepts trigger 'manual' and rejects an unknown trigger", async () => {
    await dbs.service.insert(citationAuditRun).values({ ...run(IDS.agencyA, IDS.clientA1), trigger: 'manual' });
    expect(await errorText(dbs.service.insert(citationAuditRun).values({ ...run(IDS.agencyA, IDS.clientA1), trigger: 'other' as 'manual' }))).toMatch(/citation_audit_run_trigger_check/);
  });
});

describe('citation_audit_run writes', () => {
  it('app_user cannot write (permission denied)', async () => {
    expect(await errorText(withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.insert(citationAuditRun).values(run(IDS.agencyA, IDS.clientA1))))).toMatch(/permission denied/);
  });
});

describe('citation_listing', () => {
  it('client B sees a listing of a shared competitor but not of one only A tracks', async () => {
    await dbs.service.insert(citationListing).values([listing(IDS.competitorX), listing(IDS.competitorY)]);
    const rows = await withTenant(dbs.app, { agencyId: IDS.agencyB, clientScope: [IDS.clientB1] }, (tx) => tx.select().from(citationListing));
    expect(rows.map((r) => r.competitorId)).toEqual([IDS.competitorX]);
  });

  it('app_user cannot write (permission denied)', async () => {
    expect(await errorText(withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.insert(citationListing).values(listing(IDS.competitorX))))).toMatch(/permission denied/);
  });

  it("a client's self-business listing is visible to that client only", async () => {
    const selfId = '00000000-0000-4000-8000-0000000000f9';
    await dbs.owner.insert(competitor).values({ id: selfId, name: 'Own business', domain: 'own.example' });
    await dbs.owner.update(client).set({ selfCompetitorId: selfId }).where(eq(client.id, IDS.clientA1));
    await dbs.service.insert(citationListing).values(listing(selfId));
    const hosts = (agencyId: string, clientId: string) =>
      withTenant(dbs.app, { agencyId, clientScope: [clientId] }, (tx) => tx.select().from(citationListing).where(eq(citationListing.competitorId, selfId)));
    expect(await hosts(IDS.agencyA, IDS.clientA1)).toHaveLength(1);
    expect(await hosts(IDS.agencyA, IDS.clientA2)).toHaveLength(0);
    expect(await hosts(IDS.agencyB, IDS.clientB1)).toHaveLength(0);
  });
});
