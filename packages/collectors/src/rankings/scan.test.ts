import { capture, client, evidence, rankMapImage, rankScan, rankSnapshot } from '@cs/db';
import type { RankScanSkipped } from './scan';
import { IDS, openTestDbs, pauseAgency, pauseClient, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { dfsTask, fakeDfs } from '../../test/fake-dfs';
import { VendorError } from '../vendors/dataforseo';
import { clientsWithoutRankMap, failStaleRankScans, listRankClients, RANK_SCAN_STALE_HOURS, scanRankings } from './scan';

const USER = '00000000-0000-4000-8000-0000000000c1';
const SCHEDULED = { trigger: 'scheduled' } as const;
const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.update(client).set({ keywords: ['ac repair'], serviceArea: { center: { lat: 33.9, lng: -84.3 }, radiusKm: 8, zips: [] }, rankGridSize: 5 }).where(eq(client.id, IDS.clientA1));
});

describe('scanRankings', () => {
  it('stores one tenant-scoped snapshot per keyword and grid point', async () => {
    const dfs = fakeDfs(() => [dfsTask([{ items: [{ type: 'maps_search', rank_absolute: 1, title: 'Smith HVAC', place_id: 'p1', domain: 'smithhvac.example' }] }])]);
    expect(await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs }, IDS.clientA1, SCHEDULED)).toMatchObject({ snapshots: 25, failed: 0 });
    const rows = await dbs.service.select().from(rankSnapshot);
    expect(rows).toHaveLength(25);
    expect(rows[0]).toMatchObject({ agencyId: IDS.agencyA, clientId: IDS.clientA1, keyword: 'ac repair' });
    expect(rows[0]?.results).toEqual([{ rank: 1, placeId: 'p1', cid: null, domain: 'smithhvac.example', title: 'Smith HVAC' }]);
  });

  it('snapshot gets capture_id and evidence row', async () => {
    await dbs.owner.update(client).set({ selfCompetitorId: IDS.competitorX }).where(eq(client.id, IDS.clientA1));
    const store = createMemoryStore();
    const dfs = fakeDfs(() => [dfsTask([{ items: [{ type: 'maps_search', rank_absolute: 1, title: 'Smith HVAC', place_id: 'p1' }] }])]);
    await scanRankings({ db: dbs.service, store, dfs }, IDS.clientA1, SCHEDULED);
    const rows = await dbs.service.select().from(rankSnapshot);
    expect(rows).toHaveLength(25);
    expect(rows.every((r) => r.captureId !== null)).toBe(true);
    const caps = await dbs.service.select().from(capture).where(eq(capture.competitorId, IDS.competitorX));
    expect(caps).toHaveLength(25);
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
      expect(await scanRankings({ db: dbs.service, store, dfs }, IDS.clientA1, SCHEDULED)).toMatchObject({ snapshots: 25, failed: 0 });
      expect(warn).toHaveBeenCalledTimes(25);
    } finally {
      warn.mockRestore();
    }
    const rows = await dbs.service.select().from(rankSnapshot);
    expect(rows).toHaveLength(25);
    expect(rows.every((r) => r.captureId === null)).toBe(true);
  });

  it('leaves capture_id null when the client has no self competitor', async () => {
    const dfs = fakeDfs(() => [dfsTask([{ items: [] }])]);
    await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs }, IDS.clientA1, SCHEDULED);
    expect((await dbs.service.select().from(rankSnapshot)).every((r) => r.captureId === null)).toBe(true);
    expect(await dbs.service.select().from(capture)).toEqual([]);
  });

  it('caps gridSize at 7 to bound paid live calls', async () => {
    const dfs = fakeDfs(() => [dfsTask([{ items: [] }])]);
    const r = await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs }, IDS.clientA1, { trigger: 'scheduled', prospect: { gridSize: 99, maxKeywords: 5 } });
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
      expect(await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs }, IDS.clientA1, SCHEDULED)).toMatchObject({ snapshots: 24, failed: 1 });
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
    expect(calls).toBe(25);
    const rows = await dbs.service.select().from(rankSnapshot);
    expect(rows).toHaveLength(24);
  });

  it('still throws a non-VendorError mid-scan', async () => {
    let calls = 0;
    const dfs = fakeDfs(() => {
      calls++;
      if (calls === 2) throw new Error('boom');
      return [dfsTask([{ items: [] }])];
    });
    await expect(scanRankings({ db: dbs.service, store: createMemoryStore(), dfs }, IDS.clientA1, SCHEDULED)).rejects.toThrow('boom');
  });

  it('groups one run into a rank_scan and marks it done with its counts', async () => {
    const dfs = fakeDfs(() => [dfsTask([{ items: [] }])]);
    const r = await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs }, IDS.clientA1, SCHEDULED);
    const [scan] = await dbs.service.select().from(rankScan);
    expect(scan).toMatchObject({ id: r.scanId, agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done', snapshots: 25, failed: 0 });
    expect(scan?.finishedAt).toBeInstanceOf(Date);
    expect(new Set((await dbs.service.select().from(rankSnapshot)).map((s) => s.scanId))).toEqual(new Set([r.scanId]));
  });

  it('marks the scan failed when a non-vendor error escapes', async () => {
    const dfs = fakeDfs(() => {
      throw new Error('db down');
    });
    await expect(scanRankings({ db: dbs.service, store: createMemoryStore(), dfs }, IDS.clientA1, SCHEDULED)).rejects.toThrow('db down');
    expect((await dbs.service.select().from(rankScan))[0]).toMatchObject({ status: 'failed' });
  });

  it('marks a scan that stored no snapshots failed, not done', async () => {
    const dfs = fakeDfs(() => {
      throw new VendorError('dataforseo', 40402, 'Maps search failed.', false);
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs }, IDS.clientA1, SCHEDULED)).toMatchObject({ snapshots: 0, failed: 25 });
    } finally {
      warn.mockRestore();
    }
    expect((await dbs.service.select().from(rankScan))[0]).toMatchObject({ status: 'failed', snapshots: 0, failed: 25 });
  });

  it('creates no scan for a client without keywords', async () => {
    await dbs.service.update(client).set({ keywords: [] }).where(eq(client.id, IDS.clientA1));
    expect(await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs: fakeDfs(() => []) }, IDS.clientA1, SCHEDULED)).toEqual({ snapshots: 0, failed: 0, scanId: null });
    expect(await dbs.service.select().from(rankScan)).toEqual([]);
  });
});

describe('scanRankings settings, trigger and skip (13b)', () => {
  const ok = () => fakeDfs(() => [dfsTask([{ items: [] }])]);
  const set = (v: Partial<typeof client.$inferInsert>) => dbs.service.update(client).set(v).where(eq(client.id, IDS.clientA1));

  it('scan stores the settings snapshot (7, clamped radius, effective keywords)', async () => {
    await set({ keywords: ['ac repair', 'furnace', 'duct'], rankKeywords: ['furnace', 'gone'], rankGridSize: 7, serviceArea: { center: { lat: 33.9, lng: -84.3 }, radiusKm: 80, zips: [] } });
    const r = await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs: ok() }, IDS.clientA1, { trigger: 'manual', requestedBy: USER });
    expect(r).toMatchObject({ snapshots: 49, failed: 0 });
    const [scan] = await dbs.service.select().from(rankScan);
    expect(scan).toMatchObject({ trigger: 'manual', requestedBy: USER, gridSize: 7, radiusKm: 40, keywords: ['furnace'], status: 'done' });
    expect(scan!.estimatedUsd).toBeGreaterThan(0);
  });

  it('uses rank_grid_size 5', async () => {
    await set({ rankGridSize: 5 });
    expect(await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs: ok() }, IDS.clientA1, SCHEDULED)).toMatchObject({ snapshots: 25 });
    expect((await dbs.service.select().from(rankScan))[0]).toMatchObject({ gridSize: 5, trigger: 'scheduled' });
  });

  it('adopts a manual running row by id', async () => {
    const [row] = await dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, trigger: 'manual', requestedBy: USER }).returning();
    const r = await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs: ok() }, IDS.clientA1, { trigger: 'manual', scanId: row!.id });
    expect(r).toMatchObject({ scanId: row!.id, snapshots: 25 });
    const all = await dbs.service.select().from(rankScan);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ status: 'done', gridSize: 5, trigger: 'manual', requestedBy: USER });
  });

  it('re-claims a manual row a stale sweep failed before it started, but not one with snapshots or another client\'s', async () => {
    const [row] = await dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, trigger: 'manual', status: 'failed' }).returning();
    expect(await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs: ok() }, IDS.clientA2, { trigger: 'manual', scanId: row!.id })).toEqual({ snapshots: 0, failed: 0, scanId: null });
    expect(await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs: ok() }, IDS.clientA1, { trigger: 'manual', scanId: row!.id })).toMatchObject({ scanId: row!.id, snapshots: 25 });
    // now it has snapshots: a failed row with snapshots is not re-claimable
    await dbs.service.update(rankScan).set({ status: 'failed' }).where(eq(rankScan.id, row!.id));
    expect(await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs: ok() }, IDS.clientA1, { trigger: 'manual', scanId: row!.id })).toEqual({ snapshots: 0, failed: 0, scanId: null });
  });

  it('a second scheduled scan while one runs returns null without vendor calls', async () => {
    await dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1 });
    let calls = 0;
    const dfs = fakeDfs(() => { calls++; return [dfsTask([{ items: [] }])]; });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs }, IDS.clientA1, SCHEDULED)).toEqual({ snapshots: 0, failed: 0, scanId: null });
    } finally {
      warn.mockRestore();
    }
    expect(calls).toBe(0);
    expect(await dbs.service.select().from(rankScan)).toHaveLength(1);
  });

  it('cap -> skipped row, no snapshot, no dfs call, onSkipped once', async () => {
    await set({ monthlyCapUsd: 0.01 });
    let calls = 0;
    const dfs = fakeDfs(() => { calls++; return [dfsTask([{ items: [] }])]; });
    const seen: RankScanSkipped[] = [];
    const r = await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs, onSkipped: async (s) => { seen.push(s); } }, IDS.clientA1, SCHEDULED);
    expect(r).toMatchObject({ snapshots: 0, failed: 0, skipped: 'cap' });
    expect(calls).toBe(0);
    const [scan] = await dbs.service.select().from(rankScan);
    expect(scan).toMatchObject({ id: r.scanId, status: 'skipped', gridSize: 5 });
    expect(scan!.finishedAt).toBeInstanceOf(Date);
    expect(await dbs.service.select().from(rankSnapshot)).toEqual([]);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ scanId: r.scanId, agencyId: IDS.agencyA, clientId: IDS.clientA1, capUsd: 0.01 });
  });

  it('cap on an adopted manual row updates that row to skipped', async () => {
    await set({ monthlyCapUsd: 0.01 });
    const [row] = await dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, trigger: 'manual', requestedBy: USER }).returning();
    const r = await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs: ok() }, IDS.clientA1, { trigger: 'manual', scanId: row!.id });
    expect(r).toMatchObject({ scanId: row!.id, skipped: 'cap' });
    expect(await dbs.service.select().from(rankScan)).toMatchObject([{ id: row!.id, status: 'skipped', trigger: 'manual', requestedBy: USER }]);
  });

  it('prospect override skips the budget check', async () => {
    await set({ monthlyCapUsd: 0.01 });
    const onSkipped = vi.fn();
    const r = await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs: ok(), onSkipped }, IDS.clientA1, { trigger: 'manual', prospect: { gridSize: 3, maxKeywords: 3 } });
    expect(r).toMatchObject({ snapshots: 9 });
    expect(r.skipped).toBeUndefined();
    expect(onSkipped).not.toHaveBeenCalled();
    expect((await dbs.service.select().from(rankScan))[0]).toMatchObject({ trigger: 'scheduled', status: 'done' });
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

describe('rank schedule helpers', () => {
  const area = { center: { lat: 32.44, lng: -97.79 }, radiusKm: 10, zips: [] };

  it('listRankClients excludes paused, prospect, read-only-agency clients', async () => {
    const set = { keywords: ['ac repair'], serviceArea: area };
    for (const id of [IDS.clientA1, IDS.clientA2, IDS.clientB1]) await dbs.owner.update(client).set(set).where(eq(client.id, id));
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA2));
    await pauseClient(dbs.owner, IDS.clientB1);
    expect(await listRankClients(dbs.service)).toEqual([IDS.clientA1]);
    await pauseAgency(dbs.owner, IDS.agencyA);
    expect(await listRankClients(dbs.service)).toEqual([]);
  });

  it('stale running scans older than 3 h are failed, fresh ones kept', async () => {
    expect(RANK_SCAN_STALE_HOURS).toBe(3);
    const now = new Date('2026-10-18T12:00:00Z');
    const base = { agencyId: IDS.agencyA, gridSize: 3, radiusKm: 5, keywords: ['x'], estimatedUsd: 0.1, trigger: 'scheduled' as const };
    await dbs.owner.insert(rankScan).values({ ...base, clientId: IDS.clientA1, status: 'running', startedAt: new Date('2026-10-18T08:00:00Z') });
    await dbs.owner.insert(rankScan).values({ ...base, clientId: IDS.clientA2, status: 'running', startedAt: new Date('2026-10-18T10:30:00Z') });
    expect(await failStaleRankScans(dbs.service, now)).toBe(1);
    const rows = await dbs.owner.select().from(rankScan);
    expect(rows.find((r) => r.clientId === IDS.clientA1)).toMatchObject({ status: 'failed', finishedAt: now });
    expect(rows.find((r) => r.clientId === IDS.clientA2)?.status).toBe('running');
  });

  it('clientsWithoutRankMap returns only clients lacking an image row', async () => {
    await dbs.owner.insert(rankMapImage).values({
      clientId: IDS.clientA1, agencyId: IDS.agencyA, settingsHash: 'h', objectKey: 'k', bounds: { north: 1, south: 0, east: 1, west: 0 }, width: 10, height: 10,
    });
    expect(await clientsWithoutRankMap(dbs.service, [IDS.clientA1, IDS.clientA2])).toEqual([IDS.clientA2]);
    expect(await clientsWithoutRankMap(dbs.service, [])).toEqual([]);
  });
});
