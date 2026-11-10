import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { errorText, IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { citationAuditRun, citationListing } from './schema';
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

describe('citation_listing', () => {
  it('client B sees a listing of a shared competitor but not of one only A tracks', async () => {
    await dbs.service.insert(citationListing).values([listing(IDS.competitorX), listing(IDS.competitorY)]);
    const rows = await withTenant(dbs.app, { agencyId: IDS.agencyB, clientScope: [IDS.clientB1] }, (tx) => tx.select().from(citationListing));
    expect(rows.map((r) => r.competitorId)).toEqual([IDS.competitorX]);
  });

  it('app_user cannot write (permission denied)', async () => {
    expect(await errorText(withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.insert(citationListing).values(listing(IDS.competitorX))))).toMatch(/permission denied/);
  });
});
