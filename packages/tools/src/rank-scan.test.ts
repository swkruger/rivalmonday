import { type AccessContext, createAccessContext, type Feature, SPEND_PAUSED_COPY } from '@cs/core';
import { client, rankScan } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnqueueJob, ToolDeps } from './deps';
import { RANK_MANUAL_PER_AGENCY_DAY } from './limits';
import { rankScanAvailability, rankScanLabel, rankScanRefusalMessage } from './rank-scan';
import { createToolRegistry } from './registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const enqueue = vi.fn<EnqueueJob>(async () => {});
const deps: ToolDeps = { app: dbs.app, service: dbs.service, enqueue };
const registry = createToolRegistry(deps, { audit: { record: async () => {} } });
const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope'], features: Feature[] = []) => createAccessContext({ agencyId: IDS.agencyA, userId: `u-${role}`, role, clientScope: scope, features });
const admin = ctx('agency_admin', 'all');
const AREA = { center: { lat: 32.44, lng: -97.79 }, radiusKm: 10, zips: [] };
const KW = ['ac repair', 'plumber', 'heating', 'furnace', 'hvac', 'duct cleaning'];
const DAY = 86_400_000;
type Req = { queued: true; scanEtaMinutes: number } | { queued: false; reason: string; nextAvailableAt?: string };

const scans = (clientId: string) => dbs.owner.select().from(rankScan).where(eq(rankScan.clientId, clientId));
const setup = (patch: Partial<typeof client.$inferInsert> = {}) => dbs.owner.update(client).set({ keywords: KW, serviceArea: AREA, ...patch }).where(eq(client.id, IDS.clientA1));

beforeEach(async () => {
  enqueue.mockReset();
  enqueue.mockResolvedValue(undefined);
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await setup();
});

describe('get_rank_settings', () => {
  it('settings default to the first 5 keywords and grid 7', async () => {
    const r = (await registry.invoke(admin, 'get_rank_settings', { clientId: IDS.clientA1 })) as { keywords: string[]; allKeywords: string[]; gridSize: number; radiusKm: number; scan: { state: string; nextAvailableAt: string | null; label: string | null } };
    expect(r).toMatchObject({ keywords: KW.slice(0, 5), allKeywords: KW, gridSize: 7, radiusKm: 10, scan: { state: 'available', nextAvailableAt: null, label: null } });
  });

  it('client roles cannot see get_rank_settings (not_found)', async () => {
    await expect(registry.invoke(ctx('client_owner', [IDS.clientA1], ['dashboard']), 'get_rank_settings', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('weekly limit carries the button label', async () => {
    await dbs.owner.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done', trigger: 'manual', startedAt: new Date(Date.now() - DAY), finishedAt: new Date() });
    const r = (await registry.invoke(admin, 'get_rank_settings', { clientId: IDS.clientA1 })) as { scan: { state: string; label: string } };
    expect(r.scan.state).toBe('weekly_limit');
    expect(r.scan.label).toMatch(/^Next scan available /);
  });
});

describe('update_client_rank_settings', () => {
  const input = { clientId: IDS.clientA1, keywords: ['plumber', 'heating'], gridSize: 5, radiusKm: 15 };

  it('update rejects a keyword outside client.keywords', async () => {
    await expect(registry.invoke(admin, 'update_client_rank_settings', { ...input, keywords: ['nope'] })).rejects.toMatchObject({ code: 'invalid_input', message: "Pick keywords from the client's keyword list." });
  });

  it('update rejects radius 41 and grid 6', async () => {
    await expect(registry.invoke(admin, 'update_client_rank_settings', { ...input, radiusKm: 41 })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(admin, 'update_client_rank_settings', { ...input, gridSize: 6 })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('update needs a service area', async () => {
    await setup({ serviceArea: null });
    await expect(registry.invoke(admin, 'update_client_rank_settings', input)).rejects.toMatchObject({ code: 'invalid_input', message: 'Set a service area on the Business profile page first.' });
  });

  it('update writes the three fields and enqueues one map refresh', async () => {
    expect(await registry.invoke(admin, 'update_client_rank_settings', input)).toEqual({ ok: true });
    const [c] = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1));
    expect(c).toMatchObject({ rankKeywords: ['plumber', 'heating'], rankGridSize: 5, serviceArea: { ...AREA, radiusKm: 15 } });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith('rank-map-refresh', { clientId: IDS.clientA1 }, `rank-map:${IDS.clientA1}`);
  });
});

describe('update_client_profile map refresh', () => {
  it('enqueues rank-map-refresh when the radius or centre changes, not otherwise', async () => {
    await setup({ keywords: KW.slice(0, 3) }); // the profile validator caps keywords at 5
    await registry.invoke(admin, 'update_client_profile', { clientId: IDS.clientA1, name: 'Renamed' });
    expect(enqueue).not.toHaveBeenCalledWith('rank-map-refresh', expect.anything(), expect.anything());
    await registry.invoke(admin, 'update_client_profile', { clientId: IDS.clientA1, serviceArea: { ...AREA, radiusKm: 20 } });
    expect(enqueue).toHaveBeenCalledWith('rank-map-refresh', { clientId: IDS.clientA1 }, `rank-map:${IDS.clientA1}`);
  });
});

describe('request_rank_scan', () => {
  const request = (c: AccessContext = admin) => registry.invoke(c, 'request_rank_scan', { clientId: IDS.clientA1 }) as Promise<Req>;

  it('request queues a manual scan with ETA', async () => {
    const r = await request();
    // 5 keywords x 49 points = 245 calls
    expect(r).toEqual({ queued: true, scanEtaMinutes: Math.ceil((245 * 2) / 60) + 1 });
    const [row] = await scans(IDS.clientA1);
    expect(row).toMatchObject({ status: 'running', trigger: 'manual', requestedBy: 'u-agency_admin', gridSize: 7, radiusKm: 10, keywords: KW.slice(0, 5) });
    expect(row!.estimatedUsd).toBeGreaterThan(0);
    expect(enqueue).toHaveBeenCalledWith('rank-scan', { clientId: IDS.clientA1, trigger: 'manual', scanId: row!.id, requestedBy: 'u-agency_admin' }, `rank-scan:${IDS.clientA1}`);
  });

  it('second request within 7 days → weekly_limit with nextAvailableAt', async () => {
    const started = new Date(Date.now() - 2 * DAY);
    await dbs.owner.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done', trigger: 'manual', startedAt: started, finishedAt: new Date() });
    expect(await request()).toEqual({ queued: false, reason: 'weekly_limit', nextAvailableAt: new Date(started.getTime() + 7 * DAY).toISOString() });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('a skipped manual row does not count toward the weekly limit', async () => {
    await dbs.owner.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'skipped', trigger: 'manual' });
    expect(await request()).toMatchObject({ queued: true });
  });

  it('11th agency request today → agency_daily_limit', async () => {
    for (let i = 0; i < RANK_MANUAL_PER_AGENCY_DAY; i++) {
      await dbs.owner.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA2, status: 'done', trigger: 'manual', startedAt: new Date(), finishedAt: new Date() });
    }
    const r = await request();
    expect(r).toMatchObject({ queued: false, reason: 'agency_daily_limit' });
    expect(r.queued === false && r.nextAvailableAt).toMatch(/T00:00:00\.000Z$/);
  });

  it('skipped manual rows today do not count toward the agency daily limit', async () => {
    for (let i = 0; i < RANK_MANUAL_PER_AGENCY_DAY; i++) {
      await dbs.owner.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA2, status: 'skipped', trigger: 'manual', startedAt: new Date() });
    }
    expect(await request()).toMatchObject({ queued: true });
  });

  it('cap → cap, no row', async () => {
    await dbs.owner.update(client).set({ spendLimitUsd: 0.01 }).where(eq(client.id, IDS.clientA1));
    expect(await request()).toMatchObject({ queued: false, reason: 'cap' });
    expect(await scans(IDS.clientA1)).toEqual([]);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('running scheduled scan → not_ready', async () => {
    await dbs.owner.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'running', trigger: 'scheduled' });
    expect(await request()).toMatchObject({ queued: false, reason: 'not_ready' });
  });

  it('paused client → not_ready', async () => {
    await dbs.owner.update(client).set({ pausedAt: new Date() }).where(eq(client.id, IDS.clientA1));
    expect(await request()).toMatchObject({ queued: false, reason: 'not_ready' });
    expect(await scans(IDS.clientA1)).toEqual([]);
  });

  it('spend-paused client → spend_paused before the budget check; no row, nothing queued, billing columns untouched', async () => {
    await dbs.owner.update(client).set({ spendPausedAt: new Date(), spendLimitUsd: 0.01 }).where(eq(client.id, IDS.clientA1)); // the cap would also refuse
    expect(await request()).toEqual({ queued: false, reason: 'spend_paused' });
    expect(await scans(IDS.clientA1)).toEqual([]);
    expect(enqueue).not.toHaveBeenCalled();
    const [c] = await dbs.owner.select({ pausedAt: client.pausedAt, status: client.status }).from(client).where(eq(client.id, IDS.clientA1));
    expect(c).toMatchObject({ pausedAt: null, status: 'active' });
  });

  it('a stale running row does not block a new request', async () => {
    await dbs.owner.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'running', trigger: 'scheduled', startedAt: new Date(Date.now() - 4 * 3_600_000) });
    expect(await request()).toMatchObject({ queued: true });
    const rows = await scans(IDS.clientA1);
    expect(rows.map((r) => r.status).sort()).toEqual(['failed', 'running']);
  });

  it('concurrent requests insert one running row', async () => {
    const results = await Promise.all([request(), request(), request()]);
    expect(results.filter((r) => r.queued)).toHaveLength(1);
    expect((await scans(IDS.clientA1)).filter((r) => r.status === 'running')).toHaveLength(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('enqueue failure leaves no row', async () => {
    enqueue.mockRejectedValue(new Error('queue down'));
    await expect(request()).rejects.toMatchObject({ code: 'internal' });
    expect(await scans(IDS.clientA1)).toEqual([]);
  });

  it('client roles and out-of-scope AMs get not_found', async () => {
    await expect(request(ctx('client_owner', [IDS.clientA1], ['dashboard']))).rejects.toMatchObject({ code: 'not_found' });
    await expect(request(ctx('account_manager', [IDS.clientA2]))).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('rank scan copy', () => {
  const c = { name: 'A1 HVAC', timezone: 'America/Chicago' };
  it('refusal and notice copy contain no $', () => {
    const msg = rankScanRefusalMessage({ state: 'cap' }, c);
    expect(msg).toBe("A1 HVAC is close to this month's credit limit, so this scan can't run until next month.");
    expect(msg).not.toContain('$');
    expect(rankScanLabel({ state: 'cap' }, c)).toBe(msg);
  });
  it('running label has the ellipsis; not_ready has no label', () => {
    expect(rankScanLabel({ state: 'running' }, c)).toBe('Scan running…');
    expect(rankScanLabel({ state: 'not_ready' }, c)).toBeNull();
  });
});

describe('spend_paused copy (S1)', () => {
  const c = { name: 'A1 HVAC', timezone: 'America/Chicago' };
  it('refusal message and label are S1, with no $ or product name', () => {
    expect(rankScanRefusalMessage({ state: 'spend_paused' }, c)).toBe(SPEND_PAUSED_COPY);
    expect(rankScanLabel({ state: 'spend_paused' }, c)).toBe(SPEND_PAUSED_COPY);
    expect(SPEND_PAUSED_COPY).not.toMatch(/\$|rival ?monday/i);
  });
});

describe('rankScanAvailability', () => {
  it('a spend-paused client is spend_paused, not not_ready', async () => {
    await dbs.owner.update(client).set({ spendPausedAt: new Date() }).where(eq(client.id, IDS.clientA1));
    expect((await rankScanAvailability(dbs.service, { id: IDS.clientA1, agencyId: IDS.agencyA }, new Date())).state).toBe('spend_paused');
    await dbs.owner.update(client).set({ pausedAt: new Date() }).where(eq(client.id, IDS.clientA1));
    expect((await rankScanAvailability(dbs.service, { id: IDS.clientA1, agencyId: IDS.agencyA }, new Date())).state).toBe('not_ready');
  });
  it('no keywords → not_ready', async () => {
    await setup({ keywords: [] });
    expect((await rankScanAvailability(dbs.service, { id: IDS.clientA1, agencyId: IDS.agencyA }, new Date())).state).toBe('not_ready');
  });
  it('is available for a ready client', async () => {
    expect((await rankScanAvailability(dbs.service, { id: IDS.clientA1, agencyId: IDS.agencyA }, new Date())).state).toBe('available');
  });
});
