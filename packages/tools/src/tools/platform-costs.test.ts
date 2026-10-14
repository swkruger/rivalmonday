import { type AuditEvent, createAccessContext, FEATURES } from '@cs/core';
import { auditLog, platformAdmin, platformAuditLog, platformCostItem, platformCostService, platformCostSnapshot } from '@cs/db';
import { IDS, openTestDbs, seedPlatformCostServices, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import type { EnqueueJob, JobStatusLookup, ToolDeps } from '../deps';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const enqueue = vi.fn<EnqueueJob>(async () => {});
const jobStatus = vi.fn<JobStatusLookup>(async () => null);
const deps: ToolDeps = { app: dbs.app, service: dbs.service, platformAdmins: ['op@example.com'], enqueue, jobStatus };
const webAudit: AuditEvent[] = [];
const registry = createToolRegistry(deps, { audit: { record: async (e) => void webAudit.push(e) } });
const ctxOf = (userId: string) => createAccessContext({ agencyId: IDS.agencyA, userId, role: 'agency_admin', clientScope: 'all', features: [] });
const op = ctxOf('op');
const TOOLS = ['list_platform_costs', 'refresh_platform_costs', 'update_platform_cost_service', 'save_platform_cost_item', 'archive_platform_cost_item'];
const INPUTS: Record<string, unknown> = {
  list_platform_costs: {},
  refresh_platform_costs: {},
  update_platform_cost_service: { service: 'neon', enabled: true },
  save_platform_cost_item: { name: 'x', kind: 'one_off', amountUsd: 1, startsOn: '2026-10-01' },
  archive_platform_cost_item: { id: '00000000-0000-4000-8000-000000000001' },
};
const at = (iso: string) => new Date(iso);

type Services = { service: string; status: string; amountUsd: number | null; daysLeft: number | null; label: string }[];
type Listing = {
  services: Services;
  items: { id: string; name: string; monthlyUsd: number | null }[];
  months: { month: string; apiUsd: number; manualUsd: number }[];
  summary: { mtdUsd: number; projectedMonthUsd: number; lowCount: number };
  refreshQueued: boolean;
};
const list = () => registry.invoke(op, 'list_platform_costs', {}) as Promise<Listing>;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(at('2026-10-15T12:00:00Z'));
  webAudit.length = 0;
  enqueue.mockClear();
  jobStatus.mockReset();
  jobStatus.mockResolvedValue(null);
  delete deps.costEnvPresent;
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedPlatformCostServices(dbs.owner);
  for (const u of ['op', 'staff', 'viewer', 'admin']) await seedUser(dbs.owner, u, `${u}@example.com`);
  await dbs.owner.insert(platformAdmin).values([
    { userId: 'staff', role: 'staff', createdBy: 'test' },
    { userId: 'viewer', role: 'viewer', createdBy: 'test' },
  ]);
});
afterEach(() => vi.useRealTimers());

async function seedSnapshots() {
  await dbs.owner.insert(platformCostSnapshot).values([
    { service: 'openrouter', takenAt: at('2026-10-02T00:00:00Z'), status: 'ok', kind: 'balance', amountUsd: '100' },
    { service: 'openrouter', takenAt: at('2026-10-14T00:00:00Z'), status: 'ok', kind: 'balance', amountUsd: '90' },
    { service: 'anthropic', takenAt: at('2026-10-14T00:00:00Z'), status: 'ok', kind: 'usage', amountUsd: '20', capUsd: '100' },
  ]);
}

describe('platform cost tools: access', () => {
  it('owner can list; staff, viewer and non-operator → permission_denied (all 5 tools)', async () => {
    expect(await list()).toBeTruthy();
    for (const u of ['staff', 'viewer', 'admin']) {
      for (const t of TOOLS) await expect(registry.invoke(ctxOf(u), t, INPUTS[t]), `${u} ${t}`).rejects.toMatchObject({ code: 'permission_denied' });
    }
    expect(await dbs.owner.select().from(platformAuditLog)).toHaveLength(1);
  });

  it('support ctx → not_found and hidden from list', async () => {
    const support = createAccessContext({
      agencyId: IDS.agencyA, userId: 'ctx', role: 'agency_admin', clientScope: 'all', features: [...FEATURES], support: { sessionId: '00000000-0000-4000-8000-0000000005e5', platformUserId: 'op' },
    });
    for (const t of TOOLS) await expect(registry.invoke(support, t, INPUTS[t])).rejects.toMatchObject({ code: 'not_found' });
    const names = registry.list(support).map((t) => t.name);
    for (const t of TOOLS) expect(names).not.toContain(t);
    expect(registry.list(op).map((t) => t.name)).toEqual(expect.arrayContaining(TOOLS));
  });
});

describe('list_platform_costs', () => {
  it('returns 6 services incl. not_configured with null amounts', async () => {
    deps.costEnvPresent = { openrouter: true };
    const r = await list();
    expect(r.services.map((s) => s.service)).toEqual(['openrouter', 'dataforseo', 'scrapecreators', 'apify', 'anthropic', 'neon']);
    const by = Object.fromEntries(r.services.map((s) => [s.service, s]));
    expect(by.dataforseo).toMatchObject({ status: 'not_configured', amountUsd: null, daysLeft: null });
    expect(by.neon).toMatchObject({ status: 'not_configured', amountUsd: null });
    expect(by.openrouter!.status).toBe('not_configured'); // configured but no snapshot yet
    expect(by.scrapecreators).toMatchObject({ unit: 'credits', kind: 'balance', label: 'ScrapeCreators' });
    expect(r.summary).toEqual({ mtdUsd: 0, projectedMonthUsd: 0, lowCount: 0 });
    expect(r.months).toHaveLength(6);
  });

  it('summary and months match seeded snapshots and items', async () => {
    await seedSnapshots();
    await dbs.owner.update(platformCostService).set({ lowThresholdUsd: '95' }).where(eq(platformCostService.service, 'openrouter'));
    await dbs.owner.insert(platformCostItem).values([
      { name: 'Vercel', kind: 'recurring', amountUsd: '120', period: 'yearly', startsOn: '2026-01-01', createdBy: 'test' },
      { name: 'Domain', kind: 'one_off', amountUsd: '25', startsOn: '2026-10-05', createdBy: 'test' },
      { name: 'Old', kind: 'one_off', amountUsd: '9', startsOn: '2026-10-06', archivedAt: at('2026-10-07T00:00:00Z'), createdBy: 'test' },
    ]);
    const r = await list();
    const by = Object.fromEntries(r.services.map((s) => [s.service, s]));
    expect(by.openrouter).toMatchObject({ status: 'low', amountUsd: 90, daysLeft: 108 });
    expect(by.anthropic).toMatchObject({ status: 'ok', amountUsd: 20, capUsd: 100 });
    expect(r.items.map((i) => i.name)).toEqual(['Domain', 'Vercel']);
    expect(r.items.find((i) => i.name === 'Vercel')!.monthlyUsd).toBe(10);
    expect(r.months.map((m) => m.month)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    // api: 10 (balance drop) + 20 (usage) = 30; manual: 10 (yearly/12) + 25 + 9 (archived still counts) = 44
    expect(r.months[5]).toEqual({ month: '2026-10', apiUsd: 30, manualUsd: 44 });
    expect(r.summary.mtdUsd).toBe(74);
    expect(r.summary.projectedMonthUsd).toBe(Math.round((30 / 14.5 * 31 + 44) * 100) / 100);
    expect(r.summary.lowCount).toBe(1);
  });

  it('refreshQueued follows the job state', async () => {
    expect((await list()).refreshQueued).toBe(false);
    jobStatus.mockResolvedValue({ state: 'created', createdOn: new Date(), completedOn: null, output: null });
    expect((await list()).refreshQueued).toBe(true);
    jobStatus.mockResolvedValue({ state: 'completed', createdOn: new Date(), completedOn: new Date(), output: null });
    expect((await list()).refreshQueued).toBe(false);
  });
});

describe('refresh_platform_costs', () => {
  it('enqueues once; second call while queued → queued:false', async () => {
    expect(await registry.invoke(op, 'refresh_platform_costs', {})).toEqual({ queued: true });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith('platform-costs-snapshot', {}, 'platform-costs');
    jobStatus.mockResolvedValue({ state: 'active', createdOn: new Date(), completedOn: null, output: null });
    expect(await registry.invoke(op, 'refresh_platform_costs', {})).toEqual({ queued: false });
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});

describe('update_platform_cost_service', () => {
  it('updates only the given fields; null clears', async () => {
    expect(await registry.invoke(op, 'update_platform_cost_service', { service: 'neon', enabled: false, lowThresholdUsd: 12.5, warnDays: 3, unitRateUsd: 0.106 })).toEqual({ ok: true });
    await registry.invoke(op, 'update_platform_cost_service', { service: 'neon', billingUrl: null });
    const [row] = await dbs.owner.select().from(platformCostService).where(eq(platformCostService.service, 'neon'));
    expect(row).toMatchObject({ enabled: false, billingUrl: null, warnDays: 3, updatedBy: 'op' });
    expect(Number(row!.lowThresholdUsd)).toBe(12.5);
    expect(Number(row!.unitRateUsd)).toBeCloseTo(0.106, 8);
    const r = await list();
    expect(r.services.find((s) => s.service === 'neon')).toMatchObject({ enabled: false, status: 'disabled', warnDays: 3, lowThresholdUsd: 12.5, billingUrl: null });
  });

  it('rejects an http: billingUrl', async () => {
    await expect(registry.invoke(op, 'update_platform_cost_service', { service: 'neon', billingUrl: 'http://example.com/x' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(op, 'update_platform_cost_service', { service: 'nope', enabled: true })).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

describe('save / archive_platform_cost_item', () => {
  const rec = { name: 'Vercel', kind: 'recurring', amountUsd: 20, period: 'monthly', startsOn: '2026-09-01' };

  it('creates then updates an item (created_by = ctx.userId)', async () => {
    const { id } = (await registry.invoke(op, 'save_platform_cost_item', { ...rec, billingUrl: 'https://vercel.com/billing', notes: 'pro' })) as { id: string };
    const [row] = await dbs.owner.select().from(platformCostItem).where(eq(platformCostItem.id, id));
    expect(row).toMatchObject({ name: 'Vercel', period: 'monthly', createdBy: 'op', notes: 'pro', endsOn: null });
    expect(await registry.invoke(op, 'save_platform_cost_item', { ...rec, id, name: 'Vercel Pro', amountUsd: 25.5, endsOn: '2026-12-31' })).toEqual({ id });
    const [after] = await dbs.owner.select().from(platformCostItem).where(eq(platformCostItem.id, id));
    expect(after).toMatchObject({ name: 'Vercel Pro', endsOn: '2026-12-31', createdBy: 'op' });
    expect(Number(after!.amountUsd)).toBe(25.5);
  });

  it('save rejects a one-off with a period, a recurring without one, and endsOn < startsOn', async () => {
    const bad = [
      { ...rec, kind: 'one_off' },
      { ...rec, kind: 'one_off', period: undefined, endsOn: '2026-10-01' },
      { ...rec, period: undefined },
      { ...rec, endsOn: '2026-08-31' },
      { ...rec, amountUsd: 1.005 },
      { ...rec, startsOn: '2026-13-40' },
      { ...rec, name: '   ' },
    ];
    for (const b of bad) await expect(registry.invoke(op, 'save_platform_cost_item', b), JSON.stringify(b)).rejects.toMatchObject({ code: 'invalid_input' });
    expect(await dbs.owner.select().from(platformCostItem)).toHaveLength(0);
  });

  it('unknown or archived id → not_found', async () => {
    await expect(registry.invoke(op, 'save_platform_cost_item', { ...rec, id: '00000000-0000-4000-8000-000000000009' })).rejects.toMatchObject({ code: 'not_found' });
    const { id } = (await registry.invoke(op, 'save_platform_cost_item', rec)) as { id: string };
    await registry.invoke(op, 'archive_platform_cost_item', { id });
    await expect(registry.invoke(op, 'save_platform_cost_item', { ...rec, id })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(op, 'archive_platform_cost_item', { id })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(op, 'archive_platform_cost_item', { id: '00000000-0000-4000-8000-000000000009' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('archive hides the item from list but keeps it in months', async () => {
    const { id } = (await registry.invoke(op, 'save_platform_cost_item', { name: 'Domain', kind: 'one_off', amountUsd: 25, startsOn: '2026-10-05' })) as { id: string };
    expect((await list()).items.map((i) => i.id)).toEqual([id]);
    expect(await registry.invoke(op, 'archive_platform_cost_item', { id })).toEqual({ ok: true });
    const r = await list();
    expect(r.items).toEqual([]);
    expect(r.months[5]!.manualUsd).toBe(25);
    const [row] = await dbs.owner.select().from(platformCostItem).where(eq(platformCostItem.id, id));
    expect(row!.archivedAt).not.toBeNull();
  });

  it('an archived recurring item counts in its archive month but not the next month', async () => {
    const { id } = (await registry.invoke(op, 'save_platform_cost_item', { name: 'Tool', kind: 'recurring', period: 'monthly', amountUsd: 40, startsOn: '2026-01-01' })) as { id: string };
    await registry.invoke(op, 'archive_platform_cost_item', { id });
    expect((await list()).months[5]).toMatchObject({ month: '2026-10', manualUsd: 40 });
    vi.setSystemTime(at('2026-11-10T12:00:00Z'));
    const r = await list();
    expect(r.months[5]).toMatchObject({ month: '2026-11', manualUsd: 0 });
    expect(r.months[4]).toMatchObject({ month: '2026-10', manualUsd: 40 });
  });
});

describe('audit', () => {
  it('audit row written per call with role owner (platform log only, none from the web sink)', async () => {
    const { id } = (await registry.invoke(op, 'save_platform_cost_item', INPUTS.save_platform_cost_item)) as { id: string };
    await registry.invoke(op, 'list_platform_costs', {});
    await registry.invoke(op, 'refresh_platform_costs', {});
    await registry.invoke(op, 'update_platform_cost_service', INPUTS.update_platform_cost_service);
    await registry.invoke(op, 'archive_platform_cost_item', { id });
    const rows = await dbs.owner.select().from(platformAuditLog);
    expect(rows.map((r) => r.tool).sort()).toEqual([...TOOLS].sort());
    expect(rows.every((r) => r.userId === 'op' && r.outcome === 'ok')).toBe(true);
    expect(await dbs.owner.select().from(auditLog)).toEqual([]);
    expect(webAudit).toEqual([]);
  });
});
