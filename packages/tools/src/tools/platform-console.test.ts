import { type AuditEvent, createAccessContext, hashInput } from '@cs/core';
import { agency, agencyDailyStat, brief, client, llmCall, membership, platformAdmin, platformAuditLog, vendorCall } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { addDays, utcDay } from '../platform/stats';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const webAudit: AuditEvent[] = [];
const registry = createToolRegistry(
  { app: dbs.app, service: dbs.service, platformAdmins: ['op@example.com'] },
  { audit: { record: async (e) => void webAudit.push(e) } },
);
const ctxOf = (userId: string) => createAccessContext({ agencyId: IDS.agencyA, userId, role: 'agency_admin', clientScope: 'all', features: [] });
const op = ctxOf('op');
const staff = ctxOf('staff');
const admin = ctxOf('admin');
const revoked = ctxOf('revoked');

const DAY = 86_400_000;
const now = () => new Date();
const today = () => utcDay(now());
const ago = (days: number) => new Date(Date.now() - days * DAY);
const ROW_KEYS = ['agencySeats', 'clientSeats', 'clientsActive', 'clientsProspect', 'createdAt', 'health', 'id', 'lastActivityAt', 'name', 'spendMonthUsd', 'wau'];

type Tile = { value: number; delta28d: number | null };
type Overview = { tiles: Record<'agencies' | 'clientsActive' | 'seats' | 'wau' | 'spendMonthUsd', Tile>; series: Record<string, unknown>[] };
type AgencyRow = Record<string, unknown> & { id: string; name: string; health: string };
type AgencyList = { rows: AgencyRow[]; nextCursor: string | null };

async function session(userId: string, at: Date) {
  await dbs.owner.execute(sql`insert into auth.session (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
    values (${`s-${userId}-${at.getTime()}`}, ${'2099-01-01T00:00:00Z'}::timestamptz, ${`tok-${userId}-${at.getTime()}`}, ${at.toISOString()}::timestamptz, ${at.toISOString()}::timestamptz, ${userId})`);
}

beforeEach(async () => {
  webAudit.length = 0;
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  for (const u of ['op', 'staff', 'admin', 'revoked', 'ua', 'uc']) await seedUser(dbs.owner, u, `${u}@example.com`);
  await dbs.owner.insert(platformAdmin).values([
    { userId: 'staff', role: 'staff', createdBy: 'test' },
    { userId: 'revoked', role: 'owner', createdBy: 'test', revokedAt: ago(1) },
  ]);
});

/** Agency A: 60 days old, A1 active, A2 prospect, one agency + one client seat, a recent sign-in and brief, spend this month. B: 5 days old, B1 active. */
async function seedPlatform() {
  await seedTenancy(dbs.owner);
  await dbs.owner.update(agency).set({ createdAt: ago(60) }).where(eq(agency.id, IDS.agencyA));
  await dbs.owner.update(agency).set({ createdAt: ago(5) }).where(eq(agency.id, IDS.agencyB));
  await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA2));
  await dbs.owner.insert(membership).values([
    { userId: 'ua', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 'test' },
    { userId: 'uc', agencyId: IDS.agencyA, role: 'client_owner', clientId: IDS.clientA1, createdBy: 'test' },
  ]);
  await session('ua', ago(2));
  await dbs.owner.insert(brief).values({
    agencyId: IDS.agencyA, clientId: IDS.clientA1, periodStart: ago(10), periodEnd: ago(3), deliveryDate: utcDay(ago(3)), status: 'sent', sentAt: ago(3),
  });
  const monthStart = new Date(`${today().slice(0, 7)}-01T00:00:00Z`);
  await dbs.owner.insert(llmCall).values([
    { agencyId: IDS.agencyA, task: 't', provider: 'p', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 1.5, latencyMs: 1, ok: true, createdAt: now() },
    { agencyId: IDS.agencyA, task: 't', provider: 'p', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 9, latencyMs: 1, ok: true, createdAt: new Date(monthStart.getTime() - 1000) },
    { agencyId: null, task: 't', provider: 'p', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 4, latencyMs: 1, ok: true, createdAt: now() },
  ]);
  await dbs.owner.insert(vendorCall).values({ agencyId: IDS.agencyA, vendor: 'v', operation: 'o', units: 1, costUsd: 0.5, latencyMs: 1, ok: true, createdAt: now() });
}

describe('platform console tools: access', () => {
  it('refuse non-operators and revoked operators with permission_denied; nothing is audited', async () => {
    await seedPlatform();
    for (const ctx of [admin, revoked]) {
      await expect(registry.invoke(ctx, 'platform_overview', { range: '12w' })).rejects.toMatchObject({ code: 'permission_denied' });
      await expect(registry.invoke(ctx, 'list_platform_agencies', {})).rejects.toMatchObject({ code: 'permission_denied' });
    }
    expect(await dbs.owner.select().from(platformAuditLog)).toEqual([]);
  });

  it('table-row operators (staff) are admitted', async () => {
    await expect(registry.invoke(staff, 'list_platform_agencies', {})).resolves.toMatchObject({ rows: [] });
  });
});

describe('list_platform_agencies', () => {
  it('empty platform → rows: []', async () => {
    expect(await registry.invoke(op, 'list_platform_agencies', {})).toEqual({ rows: [], nextCursor: null });
  });

  it('rows carry exactly the allow-listed keys, live figures and a health flag', async () => {
    await seedPlatform();
    await dbs.owner.insert(agencyDailyStat).values({ agencyId: IDS.agencyA, day: addDays(today(), -28), clientsActive: 0, agencySeats: 1, clientSeats: 0 });
    const r = (await registry.invoke(op, 'list_platform_agencies', {})) as AgencyList;
    for (const row of r.rows) expect(Object.keys(row).sort()).toEqual(ROW_KEYS);
    const a = r.rows.find((x) => x.id === IDS.agencyA)!;
    expect(a).toMatchObject({ name: 'Agency A', clientsActive: 1, clientsProspect: 1, agencySeats: 1, clientSeats: 1, wau: 1, spendMonthUsd: 2, health: 'growing' });
    expect(new Date(a.lastActivityAt as string).getTime()).toBeCloseTo(ago(2).getTime(), -4);
    expect(typeof a.createdAt).toBe('string');
    expect(r.rows.find((x) => x.id === IDS.agencyB)).toMatchObject({ clientsActive: 1, clientsProspect: 0, agencySeats: 0, clientSeats: 0, wau: 0, lastActivityAt: null, spendMonthUsd: 0, health: 'steady' });
  });

  it('sorts (health order at_risk, idle, growing, steady; name) and pages with a cursor; limit ≤ 100', async () => {
    await seedPlatform();
    await dbs.owner.insert(agencyDailyStat).values({ agencyId: IDS.agencyA, day: addDays(today(), -28), clientsActive: 0 });
    // Agency C: 60 days old, nobody signed in → at_risk.
    await dbs.owner.insert(agency).values({ id: '00000000-0000-4000-8000-0000000000c0', name: 'Agency C', createdAt: ago(60) });
    const byHealth = (await registry.invoke(op, 'list_platform_agencies', { sort: 'health' })) as AgencyList;
    expect(byHealth.rows.map((x) => [x.name, x.health])).toEqual([['Agency C', 'at_risk'], ['Agency A', 'growing'], ['Agency B', 'steady']]);
    const byHealthDesc = (await registry.invoke(op, 'list_platform_agencies', { sort: 'health', dir: 'desc' })) as AgencyList;
    expect(byHealthDesc.rows.map((x) => x.health)).toEqual(['steady', 'growing', 'at_risk']);
    const first = (await registry.invoke(op, 'list_platform_agencies', { sort: 'name', dir: 'desc', limit: 2 })) as AgencyList;
    expect(first.rows.map((x) => x.name)).toEqual(['Agency C', 'Agency B']);
    expect(first.nextCursor).not.toBeNull();
    const second = (await registry.invoke(op, 'list_platform_agencies', { sort: 'name', dir: 'desc', limit: 2, cursor: first.nextCursor })) as AgencyList;
    expect(second).toEqual({ rows: [expect.objectContaining({ name: 'Agency A' })], nextCursor: null });
    await expect(registry.invoke(op, 'list_platform_agencies', { limit: 101 })).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

describe('platform_overview', () => {
  it('empty platform: zero tiles, NULL deltas, 12 NULL buckets', async () => {
    const r = (await registry.invoke(op, 'platform_overview', { range: '12w' })) as Overview;
    for (const k of ['agencies', 'clientsActive', 'seats', 'wau', 'spendMonthUsd'] as const) expect(r.tiles[k]).toEqual({ value: 0, delta28d: null });
    expect(r.series).toHaveLength(12);
    expect(r.series.every((p) => p.agencies === null && p.spendUsd === null)).toBe(true);
  });

  it('agencies without stats → live tiles with delta28d: null', async () => {
    await seedPlatform();
    const r = (await registry.invoke(op, 'platform_overview', { range: '12m' })) as Overview;
    expect(r.tiles).toEqual({
      agencies: { value: 2, delta28d: null },
      clientsActive: { value: 2, delta28d: null },
      seats: { value: 2, delta28d: null },
      wau: { value: 1, delta28d: null },
      spendMonthUsd: { value: 2, delta28d: null },
    });
    expect(r.series).toHaveLength(12);
  });

  it('delta28d compares with the stat rows 28 days ago (month-to-date spend then)', async () => {
    await seedPlatform();
    const d28 = addDays(today(), -28);
    const ms = `${d28.slice(0, 7)}-01`;
    await dbs.owner.insert(agencyDailyStat).values([
      { agencyId: IDS.agencyA, day: d28, clientsActive: 0, agencySeats: 1, clientSeats: 0, wau: 0, spendUsd: '0.2500' },
      ...(ms !== d28 ? [{ agencyId: IDS.agencyA, day: ms, spendUsd: '0.5000' }] : []),
      { agencyId: IDS.agencyA, day: addDays(ms, -1), spendUsd: '9.0000' },
    ]);
    const r = (await registry.invoke(op, 'platform_overview', { range: '12w' })) as Overview;
    const mtd28 = ms !== d28 ? 0.75 : 0.25;
    expect(r.tiles).toEqual({
      agencies: { value: 2, delta28d: 1 },
      clientsActive: { value: 2, delta28d: 2 },
      seats: { value: 2, delta28d: 1 },
      wau: { value: 1, delta28d: 1 },
      spendMonthUsd: { value: 2, delta28d: 2 - mtd28 },
    });
    expect(r.series.some((p) => p.agencies === 1)).toBe(true);
  });
});

describe('platform console audit', () => {
  it('each call writes exactly one platform_audit_log row and no registry web row (skip-web)', async () => {
    await registry.invoke(op, 'platform_overview', { range: '12w' });
    await registry.invoke(op, 'list_platform_agencies', { sort: 'name' });
    const rows = await dbs.owner.select().from(platformAuditLog);
    expect(rows.map((r) => ({ userId: r.userId, tool: r.tool, outcome: r.outcome })).sort((a, b) => a.tool.localeCompare(b.tool))).toEqual([
      { userId: 'op', tool: 'list_platform_agencies', outcome: 'ok' },
      { userId: 'op', tool: 'platform_overview', outcome: 'ok' },
    ]);
    expect(rows.find((r) => r.tool === 'platform_overview')!.inputHash).toBe(hashInput({ range: '12w' }));
    expect(webAudit).toEqual([]);
  });
});
