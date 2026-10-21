import { type AuditEvent, createAccessContext, FEATURES, type Role } from '@cs/core';
import { agency, auditLog, platformAdmin, platformAuditLog, supportSession } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const webAudit: AuditEvent[] = [];
const registry = createToolRegistry(
  { app: dbs.app, service: dbs.service, platformAdmins: ['op@example.com'] },
  { audit: { record: async (e) => void webAudit.push(e) } },
);
const ctxOf = (userId: string, agencyId: string = IDS.agencyA, role: Role = 'agency_admin') =>
  createAccessContext({ agencyId, userId, role, clientScope: 'all', features: [...FEATURES] });
const op = ctxOf('op');
const staff = ctxOf('staff');
const viewer = ctxOf('viewer');
const admin = ctxOf('admin');
const member = ctxOf('member', IDS.agencyA, 'account_manager');
const adminB = ctxOf('adminB', IDS.agencyB);
const REASON = 'Checking the brief setup for the owner';

type Started = { sessionId: string; expiresAt: string };
type Row = { startedAt: string; endedAt: string | null; platformUserName: string; reason: string; durationMinutes: number | null; endReason: string | null };
const start = (ctx = staff, agencyId: string = IDS.agencyA, reason = REASON) => registry.invoke(ctx, 'start_support_session', { agencyId, reason }) as Promise<Started>;

beforeEach(async () => {
  webAudit.length = 0;
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  for (const u of ['op', 'staff', 'viewer', 'admin', 'member', 'adminB']) await seedUser(dbs.owner, u, `${u}@example.com`);
  await dbs.owner.insert(platformAdmin).values([
    { userId: 'staff', role: 'staff', createdBy: 'test' },
    { userId: 'viewer', role: 'viewer', createdBy: 'test' },
  ]);
});

describe('start_support_session', () => {
  it('refuses a platform viewer and a non-operator', async () => {
    await expect(start(viewer)).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(start(admin)).rejects.toMatchObject({ code: 'permission_denied' });
    expect(await dbs.owner.select().from(supportSession)).toHaveLength(0);
  });

  it('staff start opens a session, audits into the target agency once and returns {sessionId, expiresAt}', async () => {
    const r = await start(staff, IDS.agencyB);
    expect(Object.keys(r).sort()).toEqual(['expiresAt', 'sessionId']);
    const [row] = await dbs.owner.select().from(supportSession).where(eq(supportSession.id, r.sessionId));
    expect(row).toMatchObject({ platformUserId: 'staff', agencyId: IDS.agencyB, reason: REASON, endedAt: null });
    expect(new Date(r.expiresAt).getTime()).toBe(row!.expiresAt.getTime());
    const audit = await dbs.owner.select().from(auditLog).where(eq(auditLog.tool, 'start_support_session'));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ agencyId: IDS.agencyB, userId: 'staff', role: 'platform_staff', outcome: 'ok', supportSessionId: r.sessionId });
    expect(webAudit.filter((e) => e.tool === 'start_support_session')).toHaveLength(0);
  });

  it('trims the reason and rejects one outside 5..300 characters', async () => {
    await expect(start(staff, IDS.agencyA, '  abc  ')).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(start(staff, IDS.agencyA, 'x'.repeat(301))).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(start(staff, IDS.agencyA, '😀😀😀')).rejects.toMatchObject({ code: 'invalid_input' });
    const r = await start(staff, IDS.agencyA, '   padded reason   ');
    const [row] = await dbs.owner.select().from(supportSession).where(eq(supportSession.id, r.sessionId));
    expect(row!.reason).toBe('padded reason');
  });

  it('unknown agency is not_found, audited on the platform log', async () => {
    await expect(start(staff, '00000000-0000-4000-8000-00000000ffff')).rejects.toMatchObject({ code: 'not_found' });
    await expect(start(staff, 'nope')).rejects.toMatchObject({ code: 'not_found' });
    expect((await dbs.owner.select().from(platformAuditLog)).map((r) => r.outcome)).toEqual(['not_found', 'not_found']);
  });

  it('a second start replaces the first (one open session)', async () => {
    const a = await start(staff, IDS.agencyA);
    await start(staff, IDS.agencyB);
    const [first] = await dbs.owner.select().from(supportSession).where(eq(supportSession.id, a.sessionId));
    expect(first!.endReason).toBe('replaced');
    expect(await dbs.owner.select().from(supportSession).where(and(eq(supportSession.platformUserId, 'staff'), isNull(supportSession.endedAt)))).toHaveLength(1);
  });
});

describe('end_support_session', () => {
  it('ends the caller own open session as exit and returns its agency; a second call is ok with null', async () => {
    const a = await start(staff, IDS.agencyB);
    expect(await registry.invoke(staff, 'end_support_session', {})).toEqual({ agencyId: IDS.agencyB });
    const [row] = await dbs.owner.select().from(supportSession).where(eq(supportSession.id, a.sessionId));
    expect(row).toMatchObject({ endReason: 'exit' });
    expect(row!.endedAt).not.toBeNull();
    expect(await registry.invoke(staff, 'end_support_session', {})).toEqual({ agencyId: null });
  });

  it('end_support_session audits under the session agency', async () => {
    const a = await start(staff, IDS.agencyB);
    await registry.invoke(staff, 'end_support_session', {});
    const rows = await dbs.owner.select().from(auditLog).where(eq(auditLog.tool, 'end_support_session'));
    expect(rows).toEqual([expect.objectContaining({ agencyId: IDS.agencyB, userId: 'staff', role: 'platform_staff', outcome: 'ok', channel: 'web', supportSessionId: a.sessionId })]);
    expect(webAudit.filter((e) => e.tool === 'end_support_session')).toHaveLength(0);
    // No open session: the platform log, never the caller's own agency.
    await registry.invoke(staff, 'end_support_session', {});
    await registry.invoke(admin, 'end_support_session', {});
    expect(await dbs.owner.select().from(auditLog).where(eq(auditLog.tool, 'end_support_session'))).toHaveLength(1);
    expect((await dbs.owner.select().from(platformAuditLog).where(eq(platformAuditLog.tool, 'end_support_session'))).map((r) => [r.userId, r.outcome]).sort())
      .toEqual([['admin', 'ok'], ['staff', 'ok']]);
  });

  it('a revoked operator ending a session audits as platform_viewer', async () => {
    const a = await start(staff, IDS.agencyB);
    await dbs.owner.update(platformAdmin).set({ revokedAt: new Date() }).where(eq(platformAdmin.userId, 'staff'));
    await registry.invoke(staff, 'end_support_session', {});
    const [row] = await dbs.owner.select().from(auditLog).where(eq(auditLog.tool, 'end_support_session'));
    expect(row).toMatchObject({ agencyId: IDS.agencyB, role: 'platform_viewer', supportSessionId: a.sessionId });
  });

  it('never touches another operator session', async () => {
    const a = await start(staff);
    expect(await registry.invoke(op, 'end_support_session', {})).toEqual({ agencyId: null });
    const [row] = await dbs.owner.select().from(supportSession).where(eq(supportSession.id, a.sessionId));
    expect(row!.endedAt).toBeNull();
  });
});

describe('list_support_sessions', () => {
  it('shows the operator real name, or "Platform support" when the name is blank or an email (M7d)', async () => {
    await start(staff, IDS.agencyA);
    const name = async () => ((await registry.invoke(admin, 'list_support_sessions', {})) as { rows: Row[] }).rows[0]!.platformUserName;
    await dbs.owner.execute(sql`update auth."user" set name = 'Sam Staff' where id = 'staff'`);
    expect(await name()).toBe('Sam Staff');
    await dbs.owner.execute(sql`update auth."user" set name = '  ' where id = 'staff'`);
    expect(await name()).toBe('Platform support');
    await dbs.owner.execute(sql`update auth."user" set name = 'Sam <sam@rivalmonday.com>' where id = 'staff'`);
    expect(await name()).toBe('Platform support');
  });

  it('lists this agency sessions newest first with the documented row shape, never another agency', async () => {
    const a = await start(staff, IDS.agencyA, 'first visit reason');
    await registry.invoke(staff, 'end_support_session', {});
    await dbs.owner.update(supportSession).set({ startedAt: new Date(Date.now() - 3_600_000), endedAt: new Date(Date.now() - 3_600_000 + 12 * 60_000) }).where(eq(supportSession.id, a.sessionId));
    await start(staff, IDS.agencyA, 'second visit reason');
    await start(op, IDS.agencyB, 'other agency reason');
    const r = (await registry.invoke(admin, 'list_support_sessions', {})) as { rows: Row[]; nextCursor: string | null };
    expect(r.rows.map((x) => x.reason)).toEqual(['second visit reason', 'first visit reason']);
    expect(Object.keys(r.rows[0]!).sort()).toEqual(['durationMinutes', 'endReason', 'endedAt', 'platformUserName', 'reason', 'startedAt']);
    // M7(d): the seeded name is the email, so the agency sees the generic label, never the address.
    expect(r.rows[0]).toMatchObject({ platformUserName: 'Platform support', endedAt: null, durationMinutes: null, endReason: null });
    expect(r.rows[1]).toMatchObject({ durationMinutes: 12, endReason: 'exit' });
    expect(JSON.stringify(r)).not.toContain('other agency reason');
    const b = (await registry.invoke(adminB, 'list_support_sessions', {})) as { rows: Row[] };
    expect(b.rows.map((x) => x.reason)).toEqual(['other agency reason']);
  });

  it('pages by cursor', async () => {
    for (let i = 0; i < 3; i++) await start(staff, IDS.agencyA, `visit number ${i}`);
    const p1 = (await registry.invoke(admin, 'list_support_sessions', { limit: 2 })) as { rows: Row[]; nextCursor: string | null };
    expect(p1.rows).toHaveLength(2);
    const p2 = (await registry.invoke(admin, 'list_support_sessions', { limit: 2, cursor: p1.nextCursor! })) as { rows: Row[]; nextCursor: string | null };
    expect(p2.rows).toHaveLength(1);
    expect(p2.nextCursor).toBeNull();
  });

  it('is agency_admin only and hidden (not_found) under a support context', async () => {
    await expect(registry.invoke(member, 'list_support_sessions', {})).rejects.toMatchObject({ code: 'permission_denied' });
    const s = await start(staff);
    const inSession = createAccessContext({ agencyId: IDS.agencyA, userId: 'ctx', role: 'agency_admin', clientScope: 'all', features: [...FEATURES], support: { sessionId: s.sessionId, platformUserId: 'staff' } });
    await expect(registry.invoke(inSession, 'list_support_sessions', {})).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('set_support_access_notify', () => {
  const flag = async (id: string = IDS.agencyA) => (await dbs.owner.select({ n: agency.notifySupportAccess }).from(agency).where(eq(agency.id, id)))[0]!.n;

  it('an agency admin toggles its own agency only', async () => {
    expect(await flag()).toBe(false);
    expect(await registry.invoke(admin, 'list_support_sessions', {})).toMatchObject({ notifyEnabled: false });
    expect(await registry.invoke(admin, 'set_support_access_notify', { enabled: true })).toEqual({ enabled: true });
    expect(await flag()).toBe(true);
    expect(await registry.invoke(admin, 'list_support_sessions', {})).toMatchObject({ notifyEnabled: true });
    expect(await registry.invoke(adminB, 'list_support_sessions', {})).toMatchObject({ notifyEnabled: false });
    expect(await flag(IDS.agencyB)).toBe(false);
    await registry.invoke(admin, 'set_support_access_notify', { enabled: false });
    expect(await flag()).toBe(false);
  });

  it('refuses an account manager', async () => {
    await expect(registry.invoke(member, 'set_support_access_notify', { enabled: true })).rejects.toMatchObject({ code: 'permission_denied' });
    expect(await flag()).toBe(false);
  });
});

describe('list_agency_support_sessions', () => {
  it('a platform viewer sees the sessions of one agency; non-operators and unknown agencies are refused', async () => {
    await start(staff, IDS.agencyA, 'visit for console');
    await start(op, IDS.agencyB, 'other agency visit');
    const r = (await registry.invoke(viewer, 'list_agency_support_sessions', { agencyId: IDS.agencyA })) as { rows: (Row & { id: string })[] };
    expect(r.rows.map((x) => x.reason)).toEqual(['visit for console']);
    expect(r.rows[0]!.id).toBeTruthy();
    await expect(registry.invoke(admin, 'list_agency_support_sessions', { agencyId: IDS.agencyA })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(viewer, 'list_agency_support_sessions', { agencyId: '00000000-0000-4000-8000-00000000ffff' })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('platform activity feed', () => {
  it('includes support_session_started with the agency name and without the reason', async () => {
    await start(staff, IDS.agencyA, 'secret reason text');
    const r = (await registry.invoke(op, 'list_platform_activity', { limit: 50 })) as { items: Record<string, unknown>[] };
    const item = r.items.find((i) => i.kind === 'support_session_started')!;
    expect(item).toMatchObject({ agencyId: IDS.agencyA, kind: 'support_session_started' });
    expect(typeof item.agencyName).toBe('string');
    expect(JSON.stringify(r)).not.toContain('secret reason text');
    expect(item).not.toHaveProperty('reason');
  });
});
