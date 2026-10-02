import { client, rankScan, rankSnapshot } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
    expect(await scanRankings({ db: dbs.service, dfs }, IDS.clientA1, { gridSize: 3 })).toMatchObject({ snapshots: 9, failed: 0 });
    const rows = await dbs.service.select().from(rankSnapshot);
    expect(rows).toHaveLength(9);
    expect(rows[0]).toMatchObject({ agencyId: IDS.agencyA, clientId: IDS.clientA1, keyword: 'ac repair' });
    expect(rows[0]?.results).toEqual([{ rank: 1, placeId: 'p1', cid: null, domain: 'smithhvac.example', title: 'Smith HVAC' }]);
  });

  it('caps gridSize at 7 to bound paid live calls', async () => {
    const dfs = fakeDfs(() => [dfsTask([{ items: [] }])]);
    const r = await scanRankings({ db: dbs.service, dfs }, IDS.clientA1, { gridSize: 99 });
    expect(r).toMatchObject({ snapshots: 49, failed: 0 });
  });

  it('logs and counts a mid-scan VendorError, then stores the remaining points', async () => {
    let calls = 0;
    const dfs = fakeDfs(() => {
      calls++;
      if (calls === 2) throw new VendorError('dataforseo', 40402, 'Maps search failed.', false);
      return [dfsTask([{ items: [{ type: 'maps_search', rank_absolute: 1, title: 'Smith HVAC', place_id: 'p1', domain: 'smithhvac.example' }] }])];
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await scanRankings({ db: dbs.service, dfs }, IDS.clientA1, { gridSize: 3 })).toMatchObject({ snapshots: 8, failed: 1 });
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
    expect(calls).toBe(9);
    const rows = await dbs.service.select().from(rankSnapshot);
    expect(rows).toHaveLength(8);
  });

  it('still throws a non-VendorError mid-scan', async () => {
    let calls = 0;
    const dfs = fakeDfs(() => {
      calls++;
      if (calls === 2) throw new Error('boom');
      return [dfsTask([{ items: [] }])];
    });
    await expect(scanRankings({ db: dbs.service, dfs }, IDS.clientA1, { gridSize: 3 })).rejects.toThrow('boom');
  });

  it('groups one run into a rank_scan and marks it done with its counts', async () => {
    const dfs = fakeDfs(() => [dfsTask([{ items: [] }])]);
    const r = await scanRankings({ db: dbs.service, dfs }, IDS.clientA1, { gridSize: 3 });
    const [scan] = await dbs.service.select().from(rankScan);
    expect(scan).toMatchObject({ id: r.scanId, agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done', snapshots: 9, failed: 0 });
    expect(scan?.finishedAt).toBeInstanceOf(Date);
    expect(new Set((await dbs.service.select().from(rankSnapshot)).map((s) => s.scanId))).toEqual(new Set([r.scanId]));
  });

  it('marks the scan failed when a non-vendor error escapes', async () => {
    const dfs = fakeDfs(() => {
      throw new Error('db down');
    });
    await expect(scanRankings({ db: dbs.service, dfs }, IDS.clientA1, { gridSize: 3 })).rejects.toThrow('db down');
    expect((await dbs.service.select().from(rankScan))[0]).toMatchObject({ status: 'failed' });
  });

  it('marks a scan that stored no snapshots failed, not done', async () => {
    const dfs = fakeDfs(() => {
      throw new VendorError('dataforseo', 40402, 'Maps search failed.', false);
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await scanRankings({ db: dbs.service, dfs }, IDS.clientA1, { gridSize: 3 })).toMatchObject({ snapshots: 0, failed: 9 });
    } finally {
      warn.mockRestore();
    }
    expect((await dbs.service.select().from(rankScan))[0]).toMatchObject({ status: 'failed', snapshots: 0, failed: 9 });
  });

  it('creates no scan for a client without keywords', async () => {
    await dbs.service.update(client).set({ keywords: [] }).where(eq(client.id, IDS.clientA1));
    expect(await scanRankings({ db: dbs.service, dfs: fakeDfs(() => []) }, IDS.clientA1)).toEqual({ snapshots: 0, failed: 0, scanId: null });
    expect(await dbs.service.select().from(rankScan)).toEqual([]);
  });
});
