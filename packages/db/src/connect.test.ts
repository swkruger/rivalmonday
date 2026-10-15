import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDS, errorText, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { clientServiceable } from './filters';
import { agencyBilling, agencyConnect, billingNotice, client, clientBilling, platformSetting, stripeConnectEvent } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('Connect tables (9b)', () => {
  it('are invisible to app_user and forced-RLS', async () => {
    for (const t of [agencyConnect, clientBilling, stripeConnectEvent, platformSetting]) {
      expect(await errorText(dbs.app.select().from(t))).toMatch(/permission denied/);
    }
    const rows = (await dbs.owner.execute(sql`
      SELECT relname, relrowsecurity AS rls, relforcerowsecurity AS force FROM pg_class
      WHERE relname IN ('agency_connect','client_billing','stripe_connect_event','platform_setting')`)) as unknown as { rls: boolean; force: boolean }[];
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.rls && r.force)).toBe(true);
  });

  it('app_user cannot write client.paused_at / paused_by', async () => {
    for (const set of [{ pausedAt: new Date() }, { pausedBy: 'x' }]) {
      const text = await errorText(
        withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.update(client).set(set).where(eq(client.id, IDS.clientA1))),
      );
      expect(text).toMatch(/permission denied/i);
    }
  });

  it('enforces CHECKs, cascades with the client, and billing_notice gains client_id / audience (R2)', async () => {
    await dbs.service.insert(agencyConnect).values({ agencyId: IDS.agencyA, status: 'pending' });
    expect(await errorText(dbs.service.insert(agencyConnect).values({ agencyId: IDS.agencyB, status: 'bogus' as never }))).toMatch(/agency_connect_status_check/);
    expect(await errorText(dbs.service.update(agencyConnect).set({ autoPauseAfterDays: 91 }))).toMatch(/auto_pause_after_days_check/);
    await dbs.service.insert(clientBilling).values({ clientId: IDS.clientA1, agencyId: IDS.agencyA, state: 'off' });
    expect(await errorText(dbs.service.update(clientBilling).set({ state: 'bogus' as never }))).toMatch(/client_billing_state_check/);
    await dbs.service.insert(agencyBilling).values({ agencyId: IDS.agencyA, state: 'active' });
    await dbs.service.insert(billingNotice).values({ agencyId: IDS.agencyA, kind: 'k', dedupeKey: 'plain' });
    await dbs.service.insert(billingNotice).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, audience: 'client', kind: 'k', dedupeKey: 'c1' });
    expect((await dbs.service.select().from(billingNotice).where(eq(billingNotice.dedupeKey, 'plain')))[0]).toMatchObject({ clientId: null, audience: 'agency' });
    expect(await errorText(dbs.service.insert(billingNotice).values({ agencyId: IDS.agencyA, audience: 'x' as never, kind: 'k', dedupeKey: 'c2' }))).toMatch(/billing_notice_audience_check/);
    await dbs.owner.execute(sql`delete from client where id = ${IDS.clientA1}`);
    expect(await dbs.service.select().from(clientBilling)).toHaveLength(0);
    expect(await dbs.service.select().from(billingNotice).where(eq(billingNotice.dedupeKey, 'c1'))).toHaveLength(0);
    await dbs.owner.execute(sql`delete from agency where id = ${IDS.agencyA}`);
    expect(await dbs.service.select().from(agencyConnect)).toHaveLength(0);
  });
});

describe('clientServiceable', () => {
  const ids = async () => (await dbs.service.select({ id: client.id }).from(client).where(clientServiceable(client))).map((r) => r.id);
  const idsAliased = async (alias: string) =>
    ((await dbs.service.execute(sql`SELECT ${sql.raw(alias)}.id FROM client ${sql.raw(alias)} WHERE ${clientServiceable(alias)}`)) as unknown as { id: string }[]).map((r) => r.id);

  it('requires status active and not paused (Drizzle table and raw alias)', async () => {
    expect(await ids()).toContain(IDS.clientA1);
    await dbs.owner.update(client).set({ pausedAt: new Date(), pausedBy: 'auto' }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA2));
    for (const got of [await ids(), await idsAliased('cl'), await idsAliased('c')]) {
      expect(got).not.toContain(IDS.clientA1);
      expect(got).not.toContain(IDS.clientA2);
      expect(got).toContain(IDS.clientB1);
    }
  });

  it('rejects an unsafe alias', () => {
    expect(() => clientServiceable('c; drop table client')).toThrow();
  });
});

