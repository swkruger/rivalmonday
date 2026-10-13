import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDS, errorText, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { createAuditSink } from './audit';
import { auditLog, supportSession } from './schema';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await dbs.owner.execute(sql`truncate auth."user" cascade`);
  await seedTenancy(dbs.owner);
  await dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values ('u1', 'u1', 'u1@example.com', true)`);
});

const row = (over: Partial<typeof supportSession.$inferInsert> = {}) => ({
  platformUserId: 'u1',
  agencyId: IDS.agencyA,
  reason: 'Investigating a report',
  expiresAt: new Date(Date.now() + 3600_000),
  ...over,
});

describe('support_session', () => {
  it('is invisible to app_user', async () => {
    expect(await errorText(dbs.app.select().from(supportSession))).toMatch(/permission denied/);
  });

  it('app_user cannot update agency.notify_support_access', async () => {
    expect(await errorText(dbs.app.execute(sql`update agency set notify_support_access = true`))).toMatch(/permission denied/);
  });

  it('app_service can insert and read', async () => {
    await dbs.service.insert(supportSession).values(row());
    const rows = await dbs.service.select().from(supportSession);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.endedAt).toBeNull();
  });

  it('allows one open session per user, but an ended plus an open one', async () => {
    await dbs.service.insert(supportSession).values(row({ endedAt: new Date(), endReason: 'exit' }));
    await dbs.service.insert(supportSession).values(row());
    expect(await errorText(dbs.service.insert(supportSession).values(row()))).toMatch(/support_session_open_uq/);
    expect(await dbs.service.select().from(supportSession)).toHaveLength(2);
  });

  it('checks reason length 5..300', async () => {
    expect(await errorText(dbs.service.insert(supportSession).values(row({ reason: 'abcd' })))).toMatch(/support_session_reason_check/);
    expect(await errorText(dbs.service.insert(supportSession).values(row({ reason: 'a'.repeat(301) })))).toMatch(/support_session_reason_check/);
    await dbs.service.insert(supportSession).values(row({ reason: 'abcde', endedAt: new Date(), endReason: 'exit' }));
    await dbs.service.insert(supportSession).values(row({ reason: 'a'.repeat(300) }));
  });

  it('rejects an unknown end_reason', async () => {
    await dbs.service.insert(supportSession).values(row());
    expect(await errorText(dbs.service.execute(sql`update support_session set end_reason = 'bogus'`))).toMatch(/support_session_end_reason_check/);
  });
});

describe('audit sink', () => {
  it('writes support_session_id when given, null otherwise', async () => {
    const sink = createAuditSink(dbs.service);
    const base = { agencyId: IDS.agencyA, userId: 'u1', role: 'agency_admin' as const, tool: 't', inputHash: 'h', channel: 'web' as const, tokenId: null, outcome: 'ok' as const, rowCount: null, durationMs: 1 };
    const sid = '11111111-1111-4111-8111-111111111111';
    await sink.record({ ...base, supportSessionId: sid });
    await sink.record({ ...base, tool: 't2' });
    const rows = await dbs.service.select().from(auditLog);
    expect(rows.find((r) => r.tool === 't')?.supportSessionId).toBe(sid);
    expect(rows.find((r) => r.tool === 't2')?.supportSessionId).toBeNull();
  });
});
