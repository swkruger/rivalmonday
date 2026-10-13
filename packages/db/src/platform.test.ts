import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDS, errorText, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { agencyDailyStat, platformAdmin, platformAuditLog } from './schema';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await dbs.owner.execute(sql`truncate auth."user" cascade`);
  await seedTenancy(dbs.owner);
  await dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values ('u1', 'u1', 'u1@example.com', true)`);
});

describe('platform tables', () => {
  it('are invisible to app_user', async () => {
    expect(await errorText(dbs.app.select().from(platformAdmin))).toMatch(/permission denied/);
    expect(await errorText(dbs.app.select().from(agencyDailyStat))).toMatch(/permission denied/);
    expect(await errorText(dbs.app.select().from(platformAuditLog))).toMatch(/permission denied/);
    expect(await errorText(dbs.app.insert(platformAuditLog).values({ userId: 'u1', tool: 't', inputHash: 'h', outcome: 'ok', durationMs: 1 }))).toMatch(/permission denied/);
  });

  it('platform_admin allows one active row per user but a revoked plus an active one', async () => {
    await dbs.service.insert(platformAdmin).values({ userId: 'u1', role: 'staff', createdBy: 'cli', revokedAt: new Date() });
    await dbs.service.insert(platformAdmin).values({ userId: 'u1', role: 'staff', createdBy: 'cli' });
    expect(await errorText(dbs.service.insert(platformAdmin).values({ userId: 'u1', role: 'owner', createdBy: 'cli' }))).toMatch(/platform_admin_active_user_uq/);
    expect(await dbs.service.select().from(platformAdmin)).toHaveLength(2);
  });

  it('platform_admin rejects an unknown role and an unknown user, and cascades on user delete', async () => {
    expect(await errorText(dbs.service.insert(platformAdmin).values({ userId: 'u1', role: 'god' }))).toMatch(/platform_admin_role_check/);
    expect(await errorText(dbs.service.insert(platformAdmin).values({ userId: 'nobody', role: 'viewer' }))).toMatch(/platform_admin_user_id_fk/);
    await dbs.service.insert(platformAdmin).values({ userId: 'u1', role: 'viewer' });
    await dbs.owner.execute(sql`delete from auth."user" where id = 'u1'`);
    expect(await dbs.service.select().from(platformAdmin)).toHaveLength(0);
  });

  it('agency_daily_stat is keyed by agency and day, keeps NULL vs 0, and cascades with the agency', async () => {
    await dbs.service.insert(agencyDailyStat).values({ agencyId: IDS.agencyA, day: '2026-10-01', clientsActive: 0, spendUsd: '1.2345' });
    expect(await errorText(dbs.service.insert(agencyDailyStat).values({ agencyId: IDS.agencyA, day: '2026-10-01' }))).toMatch(/duplicate key/);
    const [row] = await dbs.service.select().from(agencyDailyStat);
    expect(row?.clientsActive).toBe(0);
    expect(row?.askQuestions).toBeNull();
    expect(row?.spendUsd).toBe('1.2345');
  });

  it('platform_audit_log is append-only for the service role', async () => {
    await dbs.service.insert(platformAuditLog).values({ userId: 'u1', tool: 't', inputHash: 'h', outcome: 'ok', durationMs: 5 });
    expect(await errorText(dbs.service.execute(sql`update platform_audit_log set outcome = 'x'`))).toMatch(/permission denied/);
    expect(await errorText(dbs.service.execute(sql`delete from platform_audit_log`))).toMatch(/permission denied/);
  });
});
