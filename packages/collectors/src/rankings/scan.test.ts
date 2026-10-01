import { client, rankSnapshot } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { dfsTask, fakeDfs } from '../../test/fake-dfs';
import { VendorError } from '../vendors/dataforseo';
import { scanRankings } from './scan';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.update(client).set({ keywords: ['ac repair'], serviceArea: { center: { lat: 33.9, lng: -84.3 }, radiusKm: 8, zips: [] } }).where(eq(client.id, IDS.clientA1));
});

describe('scanRankings', () => {
  it('stores one tenant-scoped snapshot per keyword and grid point', async () => {
    const dfs = fakeDfs(() => [dfsTask([{ items: [{ type: 'maps_search', rank_absolute: 1, title: 'Smith HVAC', place_id: 'p1', domain: 'smithhvac.example' }] }])]);
    expect(await scanRankings({ db: dbs.service, dfs }, IDS.clientA1, { gridSize: 3 })).toEqual({ snapshots: 9 });
    const rows = await dbs.service.select().from(rankSnapshot);
    expect(rows).toHaveLength(9);
    expect(rows[0]).toMatchObject({ agencyId: IDS.agencyA, clientId: IDS.clientA1, keyword: 'ac repair' });
    expect(rows[0]?.results).toEqual([{ rank: 1, placeId: 'p1', cid: null, domain: 'smithhvac.example', title: 'Smith HVAC' }]);
  });

  it('caps gridSize at 7 to bound paid live calls', async () => {
    const dfs = fakeDfs(() => [dfsTask([{ items: [] }])]);
    const r = await scanRankings({ db: dbs.service, dfs }, IDS.clientA1, { gridSize: 99 });
    expect(r).toEqual({ snapshots: 49 });
  });

  it('propagates a mid-scan VendorError, leaving already-inserted snapshots in place', async () => {
    let calls = 0;
    const dfs = fakeDfs(() => {
      calls++;
      if (calls === 2) throw new VendorError('dataforseo', 40402, 'Maps search failed.', false);
      return [dfsTask([{ items: [{ type: 'maps_search', rank_absolute: 1, title: 'Smith HVAC', place_id: 'p1', domain: 'smithhvac.example' }] }])];
    });
    await expect(scanRankings({ db: dbs.service, dfs }, IDS.clientA1, { gridSize: 3 })).rejects.toThrow(VendorError);
    const rows = await dbs.service.select().from(rankSnapshot);
    expect(rows).toHaveLength(1);
  });
});
