import { hashInput } from '@cs/core/server';
import { agency, agencyBilling, client, clientBilling, platformAuditLog } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { archiveTenant, liveBilling } from './archive';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const NOW = new Date('2026-10-21T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const UNKNOWN = '00000000-0000-4000-8000-0000000000ff';
const archivedAt = async (table: typeof agency | typeof client, id: string) =>
  (await dbs.owner.select({ at: table.archivedAt }).from(table).where(eq(table.id, id)))[0]?.at;
const platformRows = () => dbs.owner.select().from(platformAuditLog).orderBy(platformAuditLog.createdAt);

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await dbs.owner.execute(sql`truncate auth."user" cascade`);
  await seedTenancy(dbs.owner);
});

describe('archiveTenant', () => {
  it('archive then --undo clears archived_at, one platform audit row each', async () => {
    expect(await archiveTenant(dbs.service, { kind: 'client', id: IDS.clientA1, undo: false }, { now: NOW })).toEqual({ ok: true });
    expect(await archivedAt(client, IDS.clientA1)).toEqual(NOW);
    expect(await archiveTenant(dbs.service, { kind: 'client', id: IDS.clientA1, undo: true }, { now: NOW })).toEqual({ ok: true });
    expect(await archivedAt(client, IDS.clientA1)).toBeNull();
    expect(await archiveTenant(dbs.service, { kind: 'agency', id: IDS.agencyB, undo: false }, { now: NOW })).toEqual({ ok: true });
    expect(await archivedAt(agency, IDS.agencyB)).toEqual(NOW);
    const rows = await platformRows();
    expect(rows.map((r) => [r.userId, r.tool, r.outcome])).toEqual([
      ['cli', 'archive_client', 'ok'],
      ['cli', 'unarchive_client', 'ok'],
      ['cli', 'archive_agency', 'ok'],
    ]);
    expect(rows[0]!.inputHash).toBe(hashInput({ kind: 'client', id: IDS.clientA1, undo: false }));
  });

  it('re-archiving keeps the original archived_at (the purge clock does not restart)', async () => {
    await archiveTenant(dbs.service, { kind: 'agency', id: IDS.agencyB, undo: false }, { now: daysAgo(40) });
    await archiveTenant(dbs.service, { kind: 'agency', id: IDS.agencyB, undo: false }, { now: NOW });
    expect(await archivedAt(agency, IDS.agencyB)).toEqual(daysAgo(40));
  });

  it('unknown id is not_found and writes no audit row', async () => {
    const r = await archiveTenant(dbs.service, { kind: 'agency', id: UNKNOWN, undo: false }, { now: NOW });
    expect(r).toMatchObject({ error: 'not_found' });
    expect(await archiveTenant(dbs.service, { kind: 'client', id: UNKNOWN, undo: true }, { now: NOW })).toMatchObject({ error: 'not_found' });
    expect(await platformRows()).toHaveLength(0);
  });

  it.each(['trialing', 'active', 'past_due', 'read_only', 'suspended'] as const)('refuses an agency with a live Stripe subscription (%s)', async (state) => {
    await dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyA, state, stripeSubscriptionId: 'sub_1' });
    const r = await archiveTenant(dbs.service, { kind: 'agency', id: IDS.agencyA, undo: false }, { now: NOW });
    expect(r).toMatchObject({ error: 'billing_active' });
    if ('error' in r) expect(r.message).toMatch(/cancel the subscription in Stripe first/i);
    expect(await archivedAt(agency, IDS.agencyA)).toBeNull();
    expect(await platformRows()).toHaveLength(0);
  });

  it.each([
    ['pilot', 'sub_1'],
    ['cancelled', 'sub_1'],
    ['active', null],
  ] as const)('allows an agency in %s with subscription %s', async (state, sub) => {
    await dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyA, state, stripeSubscriptionId: sub });
    expect(await archiveTenant(dbs.service, { kind: 'agency', id: IDS.agencyA, undo: false }, { now: NOW })).toEqual({ ok: true });
  });

  it.each(['active', 'payment_needed'] as const)('refuses a client (and its agency) with enabled client billing in %s', async (state) => {
    await dbs.owner.insert(clientBilling).values({ clientId: IDS.clientA2, agencyId: IDS.agencyA, enabled: true, state, stripeSubscriptionId: 'sub_c' });
    const onClient = await archiveTenant(dbs.service, { kind: 'client', id: IDS.clientA2, undo: false }, { now: NOW });
    expect(onClient).toMatchObject({ error: 'billing_active' });
    if ('error' in onClient) expect(onClient.message).toMatch(/cancel the subscription in Stripe first/i);
    expect(await archiveTenant(dbs.service, { kind: 'agency', id: IDS.agencyA, undo: false }, { now: NOW })).toMatchObject({ error: 'billing_active' });
    expect(await archivedAt(client, IDS.clientA2)).toBeNull();
    expect(await archivedAt(agency, IDS.agencyA)).toBeNull();
    // Another client of the agency is not blocked by its sibling's billing.
    expect(await archiveTenant(dbs.service, { kind: 'client', id: IDS.clientA1, undo: false }, { now: NOW })).toEqual({ ok: true });
  });

  it.each([
    [false, 'active'],
    [true, 'cancelled'],
    [true, 'invited'],
    [true, 'off'],
  ] as const)('allows a client with client billing enabled=%s state %s', async (enabled, state) => {
    await dbs.owner.insert(clientBilling).values({ clientId: IDS.clientA2, agencyId: IDS.agencyA, enabled, state });
    expect(await archiveTenant(dbs.service, { kind: 'client', id: IDS.clientA2, undo: false }, { now: NOW })).toEqual({ ok: true });
    expect(await archiveTenant(dbs.service, { kind: 'agency', id: IDS.agencyA, undo: false }, { now: NOW })).toEqual({ ok: true });
  });

  it('--undo is never refused', async () => {
    await dbs.owner.update(agency).set({ archivedAt: daysAgo(5) }).where(eq(agency.id, IDS.agencyA));
    await dbs.owner.update(client).set({ archivedAt: daysAgo(5) }).where(eq(client.id, IDS.clientA2));
    await dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyA, state: 'active', stripeSubscriptionId: 'sub_1' });
    await dbs.owner.insert(clientBilling).values({ clientId: IDS.clientA2, agencyId: IDS.agencyA, enabled: true, state: 'active' });
    expect(await archiveTenant(dbs.service, { kind: 'agency', id: IDS.agencyA, undo: true }, { now: NOW })).toEqual({ ok: true });
    expect(await archiveTenant(dbs.service, { kind: 'client', id: IDS.clientA2, undo: true }, { now: NOW })).toEqual({ ok: true });
    expect(await archivedAt(agency, IDS.agencyA)).toBeNull();
    expect(await archivedAt(client, IDS.clientA2)).toBeNull();
  });
});

describe('archive options', () => {
  it("audit 'none' writes no platform_audit_log row", async () => {
    expect(await archiveTenant(dbs.service, { kind: 'client', id: IDS.clientA1, undo: false }, { now: NOW, audit: 'none' })).toEqual({ ok: true });
    expect(await archivedAt(client, IDS.clientA1)).toEqual(NOW);
    expect(await platformRows()).toHaveLength(0);
  });
});

describe('liveBilling', () => {
  it('counts client subscriptions and the agency plan', async () => {
    expect(await liveBilling(dbs.service, IDS.agencyA)).toEqual({ agencyPlan: false, clientSubscriptions: 0 });
    await dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyA, state: 'active', stripeSubscriptionId: 'sub_1' });
    await dbs.owner.insert(clientBilling).values({ clientId: IDS.clientA2, agencyId: IDS.agencyA, enabled: true, state: 'payment_needed', stripeSubscriptionId: 'sub_c' });
    await dbs.owner.insert(clientBilling).values({ clientId: IDS.clientA1, agencyId: IDS.agencyA, enabled: false, state: 'active' });
    expect(await liveBilling(dbs.service, IDS.agencyA)).toEqual({ agencyPlan: true, clientSubscriptions: 1 });
    expect(await liveBilling(dbs.service, IDS.agencyB)).toEqual({ agencyPlan: false, clientSubscriptions: 0 });
  });
});
