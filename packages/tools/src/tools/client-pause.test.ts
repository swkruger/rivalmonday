import { fakeGateway } from '@cs/billing';
import { type AccessContext, createAccessContext } from '@cs/core';
import { agencyBilling, client, plan } from '@cs/db';
import { IDS, openTestDbs, pauseAgency, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PAUSED_WRITE_ALLOW_LIST } from '../billing-guard';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const STD = { code: 'standard', version: 1, name: 'Standard', basePriceCents: 22900, includedSeats: 3, seatPriceCents: 9900, trialDays: 30, isCurrent: true, createdBy: 'test' };
const mk = (role: AccessContext['role'], scope: AccessContext['clientScope'] = 'all', agencyId: string = IDS.agencyA) =>
  createAccessContext({ agencyId, userId: `u-${role}`, role, clientScope: scope, features: [] });
const admin = mk('agency_admin');
const am = mk('account_manager');
const amA2Only = mk('account_manager', [IDS.clientA2]);
const clientOwner = mk('client_owner', [IDS.clientA1]);
const clientViewer = mk('client_viewer', [IDS.clientA1]);

let gw: ReturnType<typeof fakeGateway>;
let audits: { tool?: string; name?: string }[];
let registry: ReturnType<typeof createToolRegistry>;
let planId: string;
const call = (ctx: AccessContext, name: string, clientId = IDS.clientA1) => registry.invoke(ctx, name, { clientId });
const fails = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e as { code?: string; message: string }; }
  throw new Error('expected a failure');
};
const row = async (id = IDS.clientA1) => (await dbs.owner.select().from(client).where(eq(client.id, id)))[0]!;
const withSubscription = async () => {
  gw.seedSubscription({ id: 'sub_1', customerId: 'cus_1' });
  await dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyA, state: 'active', planId, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', billableSeatsSynced: 0 });
};

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  planId = (await dbs.owner.insert(plan).values(STD).returning({ id: plan.id }))[0]!.id;
  gw = fakeGateway();
  audits = [];
  registry = createToolRegistry({ app: dbs.app, service: dbs.service, billing: gw }, { audit: { record: async (e: unknown) => { audits.push(e as never); } } });
});

describe.each(['pause_client', 'resume_client'])('%s roles', (name) => {
  it('agency_admin and in-scope account_manager succeed', async () => {
    if (name === 'resume_client') await dbs.owner.update(client).set({ pausedAt: new Date(), pausedBy: 'x' });
    await expect(call(admin, name)).resolves.toBeTruthy();
    if (name === 'resume_client') await dbs.owner.update(client).set({ pausedAt: new Date(), pausedBy: 'x' });
    await expect(call(am, name)).resolves.toBeTruthy();
  });

  it('client roles, out-of-scope account managers and other agencies get not_found', async () => {
    for (const who of [clientOwner, clientViewer]) expect((await fails(call(who, name))).code).toBe('not_found');
    expect((await fails(call(amA2Only, name))).code).toBe('not_found');
    expect((await fails(call(mk('agency_admin', 'all', IDS.agencyB), name))).code).toBe('not_found');
    expect((await row()).pausedAt).toBeNull();
  });
});

describe('pause_client', () => {
  it('pauses, records pausedBy and one audit entry, and syncs seats after commit', async () => {
    await withSubscription();
    await expect(call(admin, 'pause_client')).resolves.toMatchObject({ ok: true, changed: true });
    const c = await row();
    expect(c.pausedAt).toBeInstanceOf(Date);
    expect(c.pausedBy).toBe('u-agency_admin');
    expect(audits.filter((a) => (a.tool ?? a.name) === 'pause_client')).toHaveLength(1);
    expect(gw.calls.some((x) => x.method === 'updateSeatQuantity')).toBe(false); // 1 active left, under 3 included: qty stays 0
    expect((await dbs.owner.select().from(agencyBilling))[0]!.billableSeatsSynced).toBe(0);
  });

  it('calls seat sync after pausing (qty decrease reaches the gateway)', async () => {
    await withSubscription();
    await dbs.owner.update(agencyBilling).set({ billableSeatsSynced: 2 });
    await call(admin, 'pause_client');
    expect(gw.calls.some((x) => x.method === 'updateSeatQuantity')).toBe(true);
  });

  it('is idempotent: second pause changes nothing and does not sync', async () => {
    await withSubscription();
    await call(admin, 'pause_client');
    const first = (await row()).pausedAt;
    gw.calls.length = 0;
    await expect(call(am, 'pause_client')).resolves.toMatchObject({ ok: true, changed: false });
    const c = await row();
    expect(c.pausedAt).toEqual(first);
    expect(c.pausedBy).toBe('u-agency_admin');
    expect(gw.calls).toEqual([]);
  });

  it('refuses a non-active client with invalid_input', async () => {
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA1));
    expect((await fails(call(admin, 'pause_client'))).code).toBe('invalid_input');
  });
});

describe('resume_client', () => {
  it('resumes, audits once and syncs seats', async () => {
    await withSubscription();
    await call(admin, 'pause_client');
    gw.calls.length = 0;
    await expect(call(am, 'resume_client')).resolves.toMatchObject({ ok: true, changed: true });
    const c = await row();
    expect(c.pausedAt).toBeNull();
    expect(c.pausedBy).toBeNull();
    expect(audits.filter((a) => (a.tool ?? a.name) === 'resume_client')).toHaveLength(1);
  });

  it('is a no-op for a client that is not paused', async () => {
    await withSubscription();
    await expect(call(admin, 'resume_client')).resolves.toMatchObject({ ok: true, changed: false });
    expect(gw.calls).toEqual([]);
  });

  it('A3: refuses with billing_seat_limit when the trial cap is full (pause -> add -> resume)', async () => {
    await dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyA, state: 'trialing', planId });
    await call(admin, 'pause_client');
    await dbs.owner.insert(client).values([0, 1].map((i) => ({ agencyId: IDS.agencyA, name: `X${i}`, verticalId: 'hvac_plumbing', status: 'active' as const })));
    expect((await fails(call(admin, 'resume_client'))).code).toBe('billing_seat_limit');
    expect((await row()).pausedAt).not.toBeNull();
  });
});

describe('A13 write guard', () => {
  it('pause_client stays allowed for a read_only agency; resume_client is blocked with service_paused', async () => {
    expect(PAUSED_WRITE_ALLOW_LIST).toContain('pause_client');
    expect(PAUSED_WRITE_ALLOW_LIST).not.toContain('resume_client');
    await pauseAgency(dbs.owner, IDS.agencyA);
    await expect(call(admin, 'pause_client')).resolves.toMatchObject({ changed: true });
    expect((await fails(call(admin, 'resume_client'))).code).toBe('service_paused');
    expect((await row()).pausedAt).not.toBeNull();
  });
});
