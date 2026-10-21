import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDS, errorText, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { agency, auditLog, client, contact, llmCall, notification, plan, vendorCall } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe('7a2 lifecycle (migration 0082)', () => {
  it('app_user cannot see an archived client', async () => {
    await dbs.service.update(client).set({ archivedAt: new Date() }).where(eq(client.id, IDS.clientA2));
    const rows = await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.select().from(client));
    expect(ids(rows)).toEqual([IDS.clientA1]);
    // The service role still sees it (purge/undo read it).
    const [row] = await dbs.service.select({ archivedAt: client.archivedAt }).from(client).where(eq(client.id, IDS.clientA2));
    expect(row?.archivedAt).toBeInstanceOf(Date);
  });

  it('app_user cannot update archived_at', async () => {
    const onClient = withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) =>
      tx.update(client).set({ archivedAt: new Date() }).where(eq(client.id, IDS.clientA1)),
    );
    expect(await errorText(onClient)).toMatch(/permission denied/);
    const onAgency = withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) =>
      tx.update(agency).set({ archivedAt: new Date() }).where(eq(agency.id, IDS.agencyA)),
    );
    expect(await errorText(onAgency)).toMatch(/permission denied/);
    const grants = (await dbs.owner.execute(sql`
      SELECT privilege_type FROM information_schema.column_privileges
      WHERE grantee = 'app_user' AND table_schema = 'public' AND table_name IN ('agency', 'client') AND column_name = 'archived_at'
        AND privilege_type = 'UPDATE'`)) as unknown as unknown[];
    expect(grants).toEqual([]);
  });

  it('plan.features defaults to ask+mcp and rejects "sms"', async () => {
    const base = { code: 'standard', version: 1, name: 'Standard', basePriceCents: 22900, includedSeats: 3, seatPriceCents: 9900, trialDays: 30, createdBy: 'test' };
    const [p] = await dbs.service.insert(plan).values(base).returning({ features: plan.features });
    expect(p?.features).toEqual(['ask', 'mcp']);
    await dbs.service.insert(plan).values({ ...base, version: 2, features: [] });
    await dbs.service.insert(plan).values({ ...base, version: 3, features: ['mcp'] });
    expect(await errorText(dbs.service.insert(plan).values({ ...base, version: 4, features: ['sms'] as never }))).toMatch(/plan_features_check/);
    expect(await errorText(dbs.owner.execute(sql`INSERT INTO plan (code, version, name, base_price_cents, included_seats, seat_price_cents, trial_days, created_by, features)
      VALUES ('x', 1, 'X', 0, 0, 0, 0, 't', '{"ask": true}'::jsonb)`))).toMatch(/plan_features_check/);
  });

  it('notification accepts skipped', async () => {
    const [c] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'o@a1.example' }).returning({ id: contact.id });
    const base = { agencyId: IDS.agencyA, clientId: IDS.clientA1, contactId: c!.id, kind: 'alert', subjectType: 'alert', subjectId: IDS.clientA1, title: 't', body: 'b', channel: 'email' } as const;
    await dbs.service.insert(notification).values({ ...base, status: 'skipped', dedupeKey: 'k1' });
    expect(await errorText(dbs.service.insert(notification).values({ ...base, status: 'bogus', dedupeKey: 'k2' }))).toMatch(/notification_status_check/);
  });

  it('deleting an agency keeps its audit_log/llm_call/vendor_call rows', async () => {
    await dbs.service.insert(auditLog).values({ agencyId: IDS.agencyA, userId: 'u1', role: 'agency_admin', tool: 'list_clients', inputHash: 'h', outcome: 'ok', durationMs: 1 });
    const call = { agencyId: IDS.agencyA, clientId: IDS.clientA1, latencyMs: 1, ok: true };
    await dbs.service.insert(llmCall).values({ ...call, task: 't', provider: 'p', model: 'm', inputTokens: 1, outputTokens: 1 });
    await dbs.service.insert(vendorCall).values({ ...call, vendor: 'v', operation: 'o', units: 1 });
    await dbs.owner.execute(sql`DELETE FROM agency WHERE id = ${IDS.agencyA}`);
    expect(await dbs.owner.select().from(client).where(eq(client.agencyId, IDS.agencyA))).toHaveLength(0);
    const [a] = await dbs.owner.select({ agencyId: auditLog.agencyId }).from(auditLog);
    const [l] = await dbs.owner.select({ agencyId: llmCall.agencyId, clientId: llmCall.clientId }).from(llmCall);
    const [v] = await dbs.owner.select({ agencyId: vendorCall.agencyId, clientId: vendorCall.clientId }).from(vendorCall);
    expect(a?.agencyId).toBe(IDS.agencyA);
    expect(l).toEqual({ agencyId: IDS.agencyA, clientId: IDS.clientA1 });
    expect(v).toEqual({ agencyId: IDS.agencyA, clientId: IDS.clientA1 });
  });
});
