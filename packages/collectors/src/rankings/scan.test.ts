import { capture, client, clientCompetitor, competitor, evidence, observation, rankMapImage, rankScan, rankSnapshot, serpSnapshot } from '@cs/db';
import type { RankScanSkipped } from './scan';
import { IDS, openTestDbs, pauseAgency, pauseClient, spendPauseClient, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { dfsTask, fakeDfs } from '../../test/fake-dfs';
import { VendorError } from '../vendors/dataforseo';
import { rankMapSettingsHash } from './settings';
import { SERP_OPERATION } from './serp';
import fixture from './__fixtures__/serp-venue-panel.json';
import type { VerticalPack } from '@cs/verticals';
import { clientsNeedingRankMap, failStaleRankScans, GBP_EVENTS_URL, listRankClients, PANEL_REUSE_DAYS, RANK_SCAN_STALE_HOURS, scanRankings, VENUE_PANEL_KIND } from './scan';

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
    const caps = await dbs.service.select().from(capture).where(eq(capture.source, 'google_maps_rank'));
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
      expect(warn).toHaveBeenCalledTimes(26); // 25 map points + the one Google search
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
      expect(warn).toHaveBeenCalledTimes(2); // the failed point + the Google search (maps items only: no organic results)
    } finally {
      warn.mockRestore();
    }
    expect(calls).toBe(26); // 25 map points + the one Google search
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
    await set({ spendLimitUsd: 0.01 });
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
    expect(seen[0]).toMatchObject({ scanId: r.scanId, agencyId: IDS.agencyA, clientId: IDS.clientA1, clientName: expect.any(String) });
    expect(seen[0]).not.toHaveProperty('capUsd');
    expect(seen[0]).not.toHaveProperty('spentUsd');
  });

  it('cap on an adopted manual row updates that row to skipped', async () => {
    await set({ spendLimitUsd: 0.01 });
    const [row] = await dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, trigger: 'manual', requestedBy: USER }).returning();
    const r = await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs: ok() }, IDS.clientA1, { trigger: 'manual', scanId: row!.id });
    expect(r).toMatchObject({ scanId: row!.id, skipped: 'cap' });
    expect(await dbs.service.select().from(rankScan)).toMatchObject([{ id: row!.id, status: 'skipped', trigger: 'manual', requestedBy: USER }]);
  });

  it('a spend-paused client is not scanned: no row, no dfs call; an adopted manual row is failed', async () => {
    await spendPauseClient(dbs.owner, IDS.clientA1);
    let calls = 0;
    const dfs = fakeDfs(() => { calls++; return [dfsTask([{ items: [] }])]; });
    expect(await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs }, IDS.clientA1, SCHEDULED)).toEqual({ snapshots: 0, failed: 0, scanId: null });
    const [row] = await dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, trigger: 'manual', requestedBy: USER }).returning();
    expect(await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs }, IDS.clientA1, { trigger: 'manual', scanId: row!.id })).toEqual({ snapshots: 0, failed: 0, scanId: null });
    expect(calls).toBe(0);
    expect(await dbs.service.select().from(rankScan)).toMatchObject([{ id: row!.id, status: 'failed' }]);
  });

  it('a paused client is not scanned either (queued before the pause)', async () => {
    await pauseClient(dbs.owner, IDS.clientA1);
    let calls = 0;
    const dfs = fakeDfs(() => { calls++; return [dfsTask([{ items: [] }])]; });
    expect(await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs }, IDS.clientA1, SCHEDULED)).toEqual({ snapshots: 0, failed: 0, scanId: null });
    expect(calls).toBe(0);
  });

  it('prospect override skips the budget check', async () => {
    await set({ spendLimitUsd: 0.01 });
    const onSkipped = vi.fn();
    const r = await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs: ok(), onSkipped }, IDS.clientA1, { trigger: 'manual', prospect: { gridSize: 3, maxKeywords: 3 } });
    expect(r).toMatchObject({ snapshots: 9 });
    expect(r.skipped).toBeUndefined();
    expect(onSkipped).not.toHaveBeenCalled();
    expect((await dbs.service.select().from(rankScan))[0]).toMatchObject({ trigger: 'scheduled', status: 'done' });
  });
});

describe('scanRankings Google search (18b-2)', () => {
  const serpTask = () => dfsTask([{ items: [{ type: 'organic', rank_group: 1, domain: 'a.example', url: 'https://a.example/', title: 'A' }] }]);
  const mapsTask = () => dfsTask([{ items: [{ type: 'maps_search', rank_absolute: 1, title: 'Smith HVAC', place_id: 'p1' }] }]);

  it('writes one serp_snapshot per keyword after the grid, with evidence under source google_search', async () => {
    await dbs.owner.update(client).set({ selfCompetitorId: IDS.competitorX, keywords: ['ac repair', 'furnace repair'] }).where(eq(client.id, IDS.clientA1));
    const dfs = fakeDfs((_m, path) => [path === SERP_OPERATION ? serpTask() : mapsTask()]);
    const res = await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs }, IDS.clientA1, SCHEDULED);
    expect(res).toMatchObject({ snapshots: 50, failed: 0 });
    const serpCalls = dfs.calls.filter((c) => c.path === SERP_OPERATION);
    expect(serpCalls).toHaveLength(2);
    expect(dfs.calls.at(-1)?.path).toBe(SERP_OPERATION);
    expect(serpCalls[0]!.body![0]).toMatchObject({ keyword: 'ac repair', location_coordinate: '33.9,-84.3,8000', depth: 10 });
    const rows = await dbs.service.select().from(serpSnapshot);
    expect(rows.map((r) => r.keyword).sort()).toEqual(['ac repair', 'furnace repair']);
    expect(rows[0]).toMatchObject({ scanId: res.scanId, agencyId: IDS.agencyA, clientId: IDS.clientA1, localServices: null });
    expect(rows[0]!.organic).toEqual([{ rank: 1, domain: 'a.example', url: 'https://a.example/', title: 'A', description: null, listingUrl: null }]);
    expect(rows.every((r) => r.captureId !== null)).toBe(true);
    const caps = await dbs.service.select().from(capture).where(eq(capture.source, 'google_search'));
    expect(caps).toHaveLength(2);
    expect(caps[0]).toMatchObject({ competitorId: IDS.competitorX, status: 'ok' });
  });

  it('a failing keyword is logged and skipped; the scan stays done with the other snapshots and failed = 0', async () => {
    await dbs.owner.update(client).set({ keywords: ['ac repair', 'furnace repair'] }).where(eq(client.id, IDS.clientA1));
    const dfs = fakeDfs((_m, path, body) => {
      if (path !== SERP_OPERATION) return [mapsTask()];
      if (body?.[0]?.keyword === 'ac repair') throw new VendorError('dataforseo', 50000, 'Search failed.', true);
      return [serpTask()];
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const res = await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs }, IDS.clientA1, SCHEDULED);
      expect(res).toMatchObject({ snapshots: 50, failed: 0 });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('"ac repair": Google search failed'));
    } finally {
      warn.mockRestore();
    }
    expect((await dbs.service.select().from(serpSnapshot)).map((r) => r.keyword)).toEqual(['furnace repair']);
    const [scan] = await dbs.service.select().from(rankScan);
    expect(scan).toMatchObject({ status: 'done', failed: 0, snapshots: 50 });
  });

  it('stores the Local Services block when the response has one', async () => {
    const dfs = fakeDfs((_m, path) => [path === SERP_OPERATION
      ? dfsTask([{ items: [
        { type: 'local_services', title: 'Local Services ads', items: [{ title: 'Cool Air Pros', rating: { value: 4.8, votes_count: 30 } }] },
        { type: 'organic', rank_group: 1, domain: 'a.example', url: 'https://a.example/', title: 'A' },
      ] }])
      : mapsTask()]);
    await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs }, IDS.clientA1, SCHEDULED);
    const [row] = await dbs.service.select().from(serpSnapshot);
    expect(row).toMatchObject({ organic: [{ rank: 1, domain: 'a.example' }], localServices: { title: 'Local Services ads', providers: [{ name: 'Cool Air Pros', rating: 4.8, votes: 30 }] } });
  });

  it('any search-side error (not only VendorError) is logged with the keyword; the map scan stays done', async () => {
    await dbs.owner.update(client).set({ keywords: ['ac repair', 'furnace repair'] }).where(eq(client.id, IDS.clientA1));
    const dfs = fakeDfs((_m, path, body) => {
      if (path !== SERP_OPERATION) return [mapsTask()];
      if (body?.[0]?.keyword === 'ac repair') throw new TypeError('boom');
      return [serpTask()];
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const res = await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs }, IDS.clientA1, SCHEDULED);
      expect(res).toMatchObject({ snapshots: 50, failed: 0 });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('"ac repair": Google search failed: boom'));
    } finally {
      warn.mockRestore();
    }
    expect((await dbs.service.select().from(serpSnapshot)).map((r) => r.keyword)).toEqual(['furnace repair']);
    expect((await dbs.service.select().from(rankScan))[0]).toMatchObject({ status: 'done', failed: 0 });
  });

  it('an empty organic result (no results or zero organic items) is a failed search: no snapshot row', async () => {
    await dbs.owner.update(client).set({ keywords: ['ac repair', 'furnace repair'] }).where(eq(client.id, IDS.clientA1));
    const dfs = fakeDfs((_m, path, body) => {
      if (path !== SERP_OPERATION) return [mapsTask()];
      if (body?.[0]?.keyword === 'ac repair') return [{ ...dfsTask([]), statusCode: 40102, statusMessage: 'No Search Results.' }];
      return [dfsTask([{ items: [{ type: 'local_services', title: 'Local Services ads', items: [] }] }])];
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const res = await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs }, IDS.clientA1, SCHEDULED);
      expect(res).toMatchObject({ snapshots: 50, failed: 0 });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('no organic results'));
    } finally {
      warn.mockRestore();
    }
    expect(await dbs.service.select().from(serpSnapshot)).toEqual([]);
    expect((await dbs.service.select().from(rankScan))[0]).toMatchObject({ status: 'done' });
  });

  it('makes no search call when the map grid stored no snapshot', async () => {
    const dfs = fakeDfs((_m, path) => {
      if (path !== SERP_OPERATION) throw new VendorError('dataforseo', 40402, 'Maps search failed.', false);
      return [serpTask()];
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs }, IDS.clientA1, SCHEDULED);
    } finally {
      warn.mockRestore();
    }
    expect(dfs.calls.filter((c) => c.path === SERP_OPERATION)).toHaveLength(0);
    expect((await dbs.service.select().from(rankScan))[0]).toMatchObject({ status: 'failed' });
  });

  it('a prospect scan makes no search call and its estimate excludes the search cost', async () => {
    const dfs = fakeDfs((_m, path) => [path === SERP_OPERATION ? serpTask() : mapsTask()]);
    await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs }, IDS.clientA1, { trigger: 'manual', prospect: { gridSize: 3, maxKeywords: 3 } });
    expect(dfs.calls.filter((c) => c.path === SERP_OPERATION)).toHaveLength(0);
    expect((await dbs.service.select().from(rankScan))[0]!.estimatedUsd).toBeCloseTo(9 * 0.002);
  });

  it('a capped scan makes no search call, and the stored estimate includes the search cost', async () => {
    const dfs = fakeDfs(() => [mapsTask()]);
    await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs }, IDS.clientA1, SCHEDULED);
    const [scan] = await dbs.service.select().from(rankScan);
    expect(scan!.estimatedUsd).toBeCloseTo(25 * 0.002 + 0.002);
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

  it('clientsNeedingRankMap returns clients lacking an image row or whose image is stale', async () => {
    const img = { agencyId: IDS.agencyA, objectKey: 'k', bounds: { north: 1, south: 0, east: 1, west: 0 }, width: 10, height: 10 };
    const current = rankMapSettingsHash({ center: { lat: 33.9, lng: -84.3 }, radiusKm: 8, gridSize: 5 });
    await dbs.owner.insert(rankMapImage).values({ clientId: IDS.clientA1, settingsHash: current, ...img });
    expect(await clientsNeedingRankMap(dbs.service, [IDS.clientA1, IDS.clientA2])).toEqual([IDS.clientA2]);
    await dbs.owner.update(rankMapImage).set({ settingsHash: 'old-style-hash' }).where(eq(rankMapImage.clientId, IDS.clientA1));
    expect(await clientsNeedingRankMap(dbs.service, [IDS.clientA1, IDS.clientA2])).toEqual([IDS.clientA1, IDS.clientA2]);
    expect(await clientsNeedingRankMap(dbs.service, [])).toEqual([]);
  });

  it('clientsNeedingRankMap skips a stale row when the client has no service area', async () => {
    await dbs.owner.insert(rankMapImage).values({
      clientId: IDS.clientA2, agencyId: IDS.agencyA, settingsHash: 'whatever', objectKey: 'k', bounds: { north: 1, south: 0, east: 1, west: 0 }, width: 10, height: 10,
    });
    await dbs.owner.update(client).set({ serviceArea: null }).where(eq(client.id, IDS.clientA2));
    expect(await clientsNeedingRankMap(dbs.service, [IDS.clientA2])).toEqual([]);
  });
});

describe('listRankClients and a spend-paused client (7b1)', () => {
  it('spend-paused client is not offered rank scans; its sibling still is', async () => {
    const area = { center: { lat: 32.44, lng: -97.79 }, radiusKm: 10, zips: [] };
    await dbs.owner.update(client).set({ keywords: ['ac repair'], serviceArea: area }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.update(client).set({ keywords: ['ac repair'], serviceArea: area }).where(eq(client.id, IDS.clientB1));
    await spendPauseClient(dbs.owner, IDS.clientA1);
    expect(await listRankClients(dbs.service)).toEqual([IDS.clientB1]);
  });
});

describe('scanRankings venue panel (18d)', () => {
  const SELF = '00000000-0000-4000-8000-0000000000e1';
  const R1 = '00000000-0000-4000-8000-0000000000e2';
  const R2 = '00000000-0000-4000-8000-0000000000e3';
  const venuePack = { events: { menu: true, panel: true } } as unknown as VerticalPack;
  const plainPack = { events: { menu: false, panel: false } } as unknown as VerticalPack;
  const panelResult = (title: string, events = 2) => [{ items: [{ type: 'knowledge_graph', title, items: [{ type: 'knowledge_graph_list_item', title: 'Events', items: Array.from({ length: events }, (_v, i) => ({ type: 'knowledge_graph_list_element', title: `Show ${i}`, subtitle: 'Fri', url: null })) }] }] }];
  const mapsTask = () => dfsTask([{ items: [] }]);
  const isPanel = (b?: Record<string, unknown>[]) => b?.[0]?.tag === VENUE_PANEL_KIND;
  const setup = async (names: [string, string, string] = ['Mohawk', 'Scoot Inn', 'Emos']) => {
    await dbs.owner.delete(clientCompetitor).where(eq(clientCompetitor.clientId, IDS.clientA1)); // only the three venues below are tracked
    await dbs.owner.insert(competitor).values([{ id: SELF, name: names[0] }, { id: R1, name: names[1] }, { id: R2, name: names[2] }]);
    await dbs.owner.insert(clientCompetitor).values([SELF, R1, R2].map((id) => ({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: id })));
    await dbs.owner.update(client).set({ selfCompetitorId: SELF, address: { city: 'Austin' } as never, timezone: 'America/Chicago' }).where(eq(client.id, IDS.clientA1));
  };
  /** Answers each panel search with a panel titled by `titleFor(keyword)` (default: the keyword, a name hit). */
  const echoDfs = (titleFor: (kw: string) => string = (kw) => kw) =>
    fakeDfs((_m, path, body) => [path === SERP_OPERATION && isPanel(body) ? dfsTask(panelResult(titleFor(String(body![0]!.keyword)))) : mapsTask()]);
  const run = (dfs: ReturnType<typeof fakeDfs>, packs: ((v: string) => Promise<VerticalPack>) | null = async () => venuePack) =>
    scanRankings({ db: dbs.service, store: createMemoryStore(), dfs, packs: packs ?? undefined }, IDS.clientA1, SCHEDULED);
  const panelCaps = () => dbs.service.select().from(capture).where(eq(capture.url, GBP_EVENTS_URL));

  it('a venues client with self and two rivals makes 3 panel calls and stores 3 captures with observations carrying the timezone', async () => {
    await setup();
    const dfs = echoDfs();
    expect(await run(dfs)).toMatchObject({ failed: 0 });
    const calls = dfs.calls.filter((c) => c.path === SERP_OPERATION && isPanel(c.body));
    expect(calls.map((c) => c.body![0]!.keyword).sort()).toEqual(['Emos Austin', 'Mohawk Austin', 'Scoot Inn Austin']);
    expect(calls[0]!.body![0]).toMatchObject({ location_coordinate: '33.9,-84.3,8000', depth: 10 });
    const caps = await panelCaps();
    expect(caps).toHaveLength(3);
    expect(caps.every((c) => c.source === 'google_business_profile' && c.status === 'ok')).toBe(true);
    const obs = await dbs.service.select().from(observation).where(eq(observation.kind, VENUE_PANEL_KIND));
    expect(obs).toHaveLength(3);
    expect(obs.every((o) => o.key === 'events' && (o.data as { timeZone: string }).timeZone === 'America/Chicago')).toBe(true);
    expect(obs[0]!.data).toMatchObject({ events: [{ title: 'Show 0', subtitle: 'Fri', url: null }, { title: 'Show 1' }] });
    const [scan] = await dbs.service.select().from(rankScan);
    expect(scan!.estimatedUsd).toBeCloseTo(25 * 0.002 + 0.002 + 3 * 0.002);
  });

  it('RF5: a pack without events.panel (or no loader) makes no extra call and the estimate is unchanged', async () => {
    for (const packs of [async () => plainPack, null]) {
      await truncateAll(dbs.owner);
      await seedTenancy(dbs.owner);
      await dbs.service.update(client).set({ keywords: ['ac repair'], serviceArea: { center: { lat: 33.9, lng: -84.3 }, radiusKm: 8, zips: [] }, rankGridSize: 5 }).where(eq(client.id, IDS.clientA1));
      await setup();
      const dfs = echoDfs();
      await run(dfs, packs);
      expect(dfs.calls.filter((c) => isPanel(c.body))).toHaveLength(0);
      expect((await dbs.service.select().from(rankScan))[0]!.estimatedUsd).toBeCloseTo(25 * 0.002 + 0.002);
      expect(await panelCaps()).toEqual([]);
    }
  });

  it('RF1: the panel of another business is ignored (no capture)', async () => {
    await setup(['Mohawk', 'Scoot Inn', 'Emos']);
    await run(echoDfs((kw) => (kw.startsWith('Scoot Inn') ? 'Austin City Limits Live' : kw)));
    const caps = await panelCaps();
    expect(caps).toHaveLength(2);
    expect(caps.map((c) => c.competitorId).sort()).toEqual([SELF, R2].sort());
  });

  it('a generic venue name needs an exact panel title', async () => {
    await setup(['Mohawk', 'The Venue', 'Emos']);
    await run(echoDfs((kw) => (kw.startsWith('The Venue') ? 'The Venue Austin Event Center' : kw)));
    expect((await panelCaps()).map((c) => c.competitorId)).not.toContain(R1);
  });

  it('keeps the real fixture panel for Mohawk, and a zero-event panel still stores (measured, none)', async () => {
    await setup();
    const venue = (fixture as { tasks: { result: unknown[] }[] }).tasks[0]!.result;
    const dfs = fakeDfs((_m, path, body) => [path === SERP_OPERATION && isPanel(body)
      ? dfsTask(String(body![0]!.keyword).startsWith('Mohawk') ? venue : panelResult(String(body![0]!.keyword), 0)) : mapsTask()]);
    await run(dfs);
    const obs = await dbs.service.select().from(observation).where(eq(observation.kind, VENUE_PANEL_KIND));
    expect(obs).toHaveLength(3);
    expect(obs.find((o) => o.competitorId === SELF)!.data).toMatchObject({ title: 'Mohawk Austin', events: expect.arrayContaining([expect.objectContaining({ title: 'Hot Tuna: Electric Set' })]) });
    expect(obs.find((o) => o.competitorId === R1)!.data).toMatchObject({ events: [] });
  });

  it('a capture 5 days old is reused (no call); one 7 days old is searched again', async () => {
    await setup();
    const age = (d: number) => new Date(Date.now() - d * 86_400_000);
    await dbs.owner.insert(capture).values([
      { competitorId: SELF, source: 'google_business_profile', url: GBP_EVENTS_URL, status: 'ok', collectorVersion: 'x', capturedAt: age(PANEL_REUSE_DAYS - 1) },
      { competitorId: R1, source: 'google_business_profile', url: GBP_EVENTS_URL, status: 'ok', collectorVersion: 'x', capturedAt: age(7) },
    ]);
    const dfs = echoDfs();
    await run(dfs);
    expect(dfs.calls.filter((c) => isPanel(c.body)).map((c) => c.body![0]!.keyword).sort()).toEqual(['Emos Austin', 'Scoot Inn Austin']);
  });

  it('a vendor error on one rival stores the others and the scan stays done', async () => {
    await setup();
    const dfs = fakeDfs((_m, path, body) => {
      if (path === SERP_OPERATION && isPanel(body)) {
        if (String(body![0]!.keyword).startsWith('Scoot')) return [dfsTask(null, { statusCode: 50000, statusMessage: 'boom' })];
        return [dfsTask(panelResult(String(body![0]!.keyword)))];
      }
      return [mapsTask()];
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await run(dfs)).toMatchObject({ snapshots: 25, failed: 0 });
      expect(warn.mock.calls.some((a) => String(a[0]).includes(R1))).toBe(true);
    } finally {
      warn.mockRestore();
    }
    expect((await dbs.service.select().from(rankScan))[0]!.status).toBe('done');
    expect(await panelCaps()).toHaveLength(2);
  });

  it('a prospect scan makes no panel call', async () => {
    await setup();
    const dfs = echoDfs();
    await scanRankings({ db: dbs.service, store: createMemoryStore(), dfs, packs: async () => venuePack }, IDS.clientA1, { trigger: 'scheduled', prospect: { gridSize: 3, maxKeywords: 3 } });
    expect(dfs.calls.filter((c) => isPanel(c.body))).toHaveLength(0);
  });

  it('a cap reached only with the panel cost skips the scan with no calls', async () => {
    await setup();
    // pause threshold = limit x 1.3 = 0.0546: above the grid + search estimate (0.052), below it plus 3 panel searches (0.058)
    await dbs.owner.update(client).set({ spendLimitUsd: 0.042 }).where(eq(client.id, IDS.clientA1));
    const dfs = echoDfs();
    expect(await run(dfs)).toMatchObject({ skipped: 'cap' });
    expect(dfs.calls).toHaveLength(0);
    expect(await run(echoDfs(), async () => plainPack)).toMatchObject({ snapshots: 25 });
  });
});
