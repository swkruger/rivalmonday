import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { errorText, IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { rankScan, serpSnapshot } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

async function seed(clientId: string, keyword = 'ac repair') {
  const [scan] = await dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId, status: 'done' }).returning();
  const row = { agencyId: IDS.agencyA, clientId, scanId: scan!.id, keyword, capturedAt: new Date(), organic: [{ rank: 1, domain: 'a.example', url: null, title: 'A' }], localServices: null };
  await dbs.service.insert(serpSnapshot).values(row);
  return { scanId: scan!.id, row };
}

describe('serp_snapshot', () => {
  it('(scan_id, keyword) is unique', async () => {
    const { row } = await seed(IDS.clientA1);
    expect(await errorText(dbs.service.insert(serpSnapshot).values(row))).toMatch(/serp_snapshot_scan_keyword_unique/);
  });

  it('a client-A1 session cannot read client-A2 rows', async () => {
    await seed(IDS.clientA1);
    await seed(IDS.clientA2);
    const rows = await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, (tx) => tx.select().from(serpSnapshot));
    expect(rows.map((r) => r.clientId)).toEqual([IDS.clientA1]);
  });

  it('another agency sees nothing, and app_user cannot write', async () => {
    const { row } = await seed(IDS.clientA1);
    expect(await withTenant(dbs.app, { agencyId: IDS.agencyB, clientScope: 'all' }, (tx) => tx.select().from(serpSnapshot))).toHaveLength(0);
    expect(await errorText(withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.insert(serpSnapshot).values({ ...row, keyword: 'other' })))).toMatch(/permission denied/);
  });
});
