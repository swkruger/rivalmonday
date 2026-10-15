import { capture, client, evidence, rankScan, rankSnapshot } from '@cs/db';
import { IDS, openTestDbs, pauseAgency, pauseClient, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { dfsTask, fakeDfs } from '../../test/fake-dfs';
import { VendorError } from '../vendors/dataforseo';
import { listRankClients, scanRankings } from './scan';

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
    expect(await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs }, IDS.clientA1, { gridSize: 3 })).toMatchObject({ snapshots: 9, failed: 0 });
    const rows = await dbs.service.select().from(rankSnapshot);
    expect(rows).toHaveLength(9);
    expect(rows[0]).toMatchObject({ agencyId: IDS.agencyA, clientId: IDS.clientA1, keyword: 'ac repair' });
    expect(rows[0]?.results).toEqual([{ rank: 1, placeId: 'p1', cid: null, domain: 'smithhvac.example', title: 'Smith HVAC' }]);
  });

  it('snapshot gets capture_id and evidence row', async () => {
    await dbs.owner.update(client).set({ selfCompetitorId: IDS.competitorX }).where(eq(client.id, IDS.clientA1));
    const store = createMemoryStore();
    const dfs = fakeDfs(() => [dfsTask([{ items: [{ type: 'maps_search', rank_absolute: 1, title: 'Smith HVAC', place_id: 'p1' }] }])]);
    await scanRankings({ db: dbs.service, store, dfs }, IDS.clientA1, { gridSize: 3 });
    const rows = await dbs.service.select().from(rankSnapshot);
    expect(rows).toHaveLength(9);
    expect(rows.every((r) => r.captureId !== null)).toBe(true);
    const caps = await dbs.service.select().from(capture).where(eq(capture.competitorId, IDS.competitorX));
    expect(caps).toHaveLength(9);
    expect(caps[0]).toMatchObject({ source: 'google_maps_rank', status: 'ok' });
    const ev = await dbs.service.select().from(evidence).where(eq(evidence.captureId, rows[0]!.captureId!));
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ kind: 'vendor_json' });
  });

  it('capture failure keeps scan going', async () => {
    await dbs.owner.update(client).set({ selfCompetitorId: IDS.competitorX }).where(eq(client.id, IDS.clientA1));
    const store = createMemoryStore();
    vi.spyOn(store, 'put').mockRejectedValue(new Error('r2 down'));
    const dfs = fakeDfs(() => [dfsTask([{ items: [] }])]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await scanRankings({ db: dbs.service, store, dfs }, IDS.clientA1, { gridSize: 3 })).toMatchObject({ snapshots: 9, failed: 0 });
      expect(warn).toHaveBeenCalledTimes(9);
    } finally {
      warn.mockRestore();
    }
    const rows = await dbs.service.select().from(rankSnapshot);
    expect(rows).toHaveLength(9);
    expect(rows.every((r) => r.captureId === null)).toBe(true);
  });

  it('leaves capture_id null when the client has no self competitor', async () => {
    const dfs = fakeDfs(() => [dfsTask([{ items: [] }])]);
    await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs }, IDS.clientA1, { gridSize: 3 });
    expect((await dbs.service.select().from(rankSnapshot)).every((r) => r.captureId === null)).toBe(true);
    expect(await dbs.service.select().from(capture)).toEqual([]);
  });

  it('caps gridSize at 7 to bound paid live calls', async () => {
    const dfs = fakeDfs(() => [dfsTask([{ items: [] }])]);
    const r = await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs }, IDS.clientA1, { gridSize: 99 });
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
      expect(await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs }, IDS.clientA1, { gridSize: 3 })).toMatchObject({ snapshots: 8, failed: 1 });
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
    await expect(scanRankings({ db: dbs.service, store: createMemoryStore(), dfs }, IDS.clientA1, { gridSize: 3 })).rejects.toThrow('boom');
  });

  it('groups one run into a rank_scan and marks it done with its counts', async () => {
    const dfs = fakeDfs(() => [dfsTask([{ items: [] }])]);
    const r = await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs }, IDS.clientA1, { gridSize: 3 });
    const [scan] = await dbs.service.select().from(rankScan);
    expect(scan).toMatchObject({ id: r.scanId, agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done', snapshots: 9, failed: 0 });
    expect(scan?.finishedAt).toBeInstanceOf(Date);
    expect(new Set((await dbs.service.select().from(rankSnapshot)).map((s) => s.scanId))).toEqual(new Set([r.scanId]));
  });

  it('marks the scan failed when a non-vendor error escapes', async () => {
    const dfs = fakeDfs(() => {
      throw new Error('db down');
    });
    await expect(scanRankings({ db: dbs.service, store: createMemoryStore(), dfs }, IDS.clientA1, { gridSize: 3 })).rejects.toThrow('db down');
    expect((await dbs.service.select().from(rankScan))[0]).toMatchObject({ status: 'failed' });
  });

  it('marks a scan that stored no snapshots failed, not done', async () => {
    const dfs = fakeDfs(() => {
      throw new VendorError('dataforseo', 40402, 'Maps search failed.', false);
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs }, IDS.clientA1, { gridSize: 3 })).toMatchObject({ snapshots: 0, failed: 9 });
    } finally {
      warn.mockRestore();
    }
    expect((await dbs.service.select().from(rankScan))[0]).toMatchObject({ status: 'failed', snapshots: 0, failed: 9 });
  });

  it('creates no scan for a client without keywords', async () => {
    await dbs.service.update(client).set({ keywords: [] }).where(eq(client.id, IDS.clientA1));
    expect(await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs: fakeDfs(() => []) }, IDS.clientA1)).toEqual({ snapshots: 0, failed: 0, scanId: null });
    expect(await dbs.service.select().from(rankScan)).toEqual([]);
  });
});

describe('listRankClients', () => {
  it('lists active clients with keywords and a service area for the monthly scan (5b-2 decision 9)', async () => {
    const area = { center: { lat: 32.44, lng: -97.79 }, radiusKm: 10, zips: [] };
    await dbs.owner.update(client).set({ keywords: ['ac repair'], serviceArea: area }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.update(client).set({ keywords: ['dentist'], serviceArea: area, status: 'prospect' }).where(eq(client.id, IDS.clientA2));
    expect(await listRankClients(dbs.service)).toEqual([IDS.clientA1]);
  });

  it('excludes a read_only agency’s clients; an agency with no billing row is still listed (9a)', async () => {
    const area = { center: { lat: 32.44, lng: -97.79 }, radiusKm: 10, zips: [] };
    await dbs.owner.update(client).set({ keywords: ['ac repair'], serviceArea: area }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.update(client).set({ keywords: ['ac repair'], serviceArea: area }).where(eq(client.id, IDS.clientB1));
    await pauseAgency(dbs.owner, IDS.agencyA);
    expect(await listRankClients(dbs.service)).toEqual([IDS.clientB1]);
  });
});

describe('listRankClients and a paused client (9b)', () => {
  it('excludes a paused client', async () => {
    const area = { center: { lat: 32.44, lng: -97.79 }, radiusKm: 10, zips: [] };
    await dbs.owner.update(client).set({ keywords: ['ac repair'], serviceArea: area }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.update(client).set({ keywords: ['ac repair'], serviceArea: area }).where(eq(client.id, IDS.clientB1));
    await pauseClient(dbs.owner, IDS.clientA1);
    expect(await listRankClients(dbs.service)).toEqual([IDS.clientB1]);
  });
});
