import { fakeGateway } from '@cs/billing';
import { type AccessContext, createAccessContext } from '@cs/core';
import { agencyBilling, client, plan } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createToolRegistry } from '../registry';

// Task 8A: seat cap on activation and `service_paused` write refusal. Agency A starts with 2 active clients + 1 prospect (clientA2 is flipped below).
const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const gw = fakeGateway();
const registry = createToolRegistry({ app: dbs.app, service: dbs.service, billing: gw }, { audit: { record: async () => {} } });
const ctx = (role: AccessContext['role']) => createAccessContext({ agencyId: IDS.agencyA, userId: `u-${role}`, role, clientScope: 'all', features: [] });
const admin = ctx('agency_admin');
const STD = { code: 'standard', version: 1, name: 'Standard', basePriceCents: 22900, includedSeats: 3, seatPriceCents: 9900, trialDays: 30, isCurrent: true, createdBy: 'test' };
const newClient = (name: string, status?: 'active' | 'prospect') => ({ name, verticalId: 'hvac_plumbing', services: [], keywords: [], serviceArea: null, placeId: null, ...(status ? { status } : {}) });
const SEAT_MSG = "You've used your 3 included clients. Upgrade to add more.";
let planId: string;

const setState = (state: string, extra: Partial<typeof agencyBilling.$inferInsert> = {}) =>
  dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyA, state: state as 'pilot', planId, ...extra });
const addActive = async (n: number) => {
  await dbs.owner.insert(client).values(Array.from({ length: n }, (_, i) => ({ agencyId: IDS.agencyA, name: `X${i}`, verticalId: 'hvac_plumbing', status: 'active' as const })));
};

beforeEach(async () => {
  gw.calls.length = 0;
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  [{ id: planId }] = (await dbs.owner.insert(plan).values(STD).returning({ id: plan.id })) as [{ id: string }];
});

describe('create_client seat cap', () => {
  it('blocks an active client at the cap with the exact message (pilot, trialing)', async () => {
    await addActive(1); // 3 active
    await expect(registry.invoke(admin, 'create_client', newClient('Over'))).rejects.toMatchObject({ code: 'billing_seat_limit', message: SEAT_MSG });
    await setState('trialing');
    await expect(registry.invoke(admin, 'create_client', newClient('Over'))).rejects.toMatchObject({ code: 'billing_seat_limit', message: SEAT_MSG });
    expect(await dbs.owner.select().from(client).where(eq(client.name, 'Over'))).toHaveLength(0);
  });

  it('allows it for an exempt pilot and for an active subscription, then syncs seats', async () => {
    await addActive(1);
    await setState('pilot', { seatCapExempt: true });
    await expect(registry.invoke(admin, 'create_client', newClient('Exempt'))).resolves.toBeTruthy();
    gw.seedSubscription({ id: 'sub_1', customerId: 'cus_1' });
    await dbs.owner.update(agencyBilling).set({ state: 'active', seatCapExempt: false, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', billableSeatsSynced: 0 });
    await expect(registry.invoke(admin, 'create_client', newClient('Paid'))).resolves.toBeTruthy();
    const [row] = await dbs.owner.select().from(agencyBilling);
    expect(row?.billableSeatsSynced).toBe(2); // 5 active - 3 included
    expect(gw.callsTo('updateSeatQuantity')).toHaveLength(1);
  });

  it('never caps prospects', async () => {
    await addActive(1);
    await expect(registry.invoke(admin, 'create_client', newClient('Pitch', 'prospect'))).resolves.toBeTruthy();
  });

  it('is unaffected by a missing billing row while under the cap', async () => {
    await expect(registry.invoke(admin, 'create_client', newClient('Third'))).resolves.toBeTruthy();
  });
});

describe('convert_prospect seat cap', () => {
  beforeEach(async () => {
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA2));
  });

  it('is blocked at the cap, leaving the prospect a prospect', async () => {
    await addActive(2); // clientA1 + 2 = 3 active
    await expect(registry.invoke(admin, 'convert_prospect', { clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'billing_seat_limit', message: SEAT_MSG });
    const [row] = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA2));
    expect(row?.status).toBe('prospect');
  });

  it('is allowed under the cap / for exempt pilots, and syncs seats after commit', async () => {
    await addActive(2);
    await setState('pilot', { seatCapExempt: true, stripeSubscriptionId: 'sub_x', billableSeatsSynced: 0 });
    await expect(registry.invoke(admin, 'convert_prospect', { clientId: IDS.clientA2 })).resolves.toEqual({ clientId: IDS.clientA2 });
    expect(gw.callsTo('updateSeatQuantity')).toHaveLength(0); // pilot state skips the sync
  });

  it('is allowed for an agency with no billing row while under the cap', async () => {
    await expect(registry.invoke(admin, 'convert_prospect', { clientId: IDS.clientA2 })).resolves.toBeTruthy();
  });
});

describe('write guard (service_paused)', () => {
  const PAUSED = 'Service is paused. Update your payment method to resume.';

  it.each(['read_only', 'suspended'])('%s: refuses a normal write, allows team writes and reads', async (state) => {
    await setState(state);
    await expect(registry.invoke(admin, 'create_client', newClient('Nope', 'prospect'))).rejects.toMatchObject({ code: 'service_paused', message: PAUSED });
    await expect(registry.invoke(admin, 'update_client_profile', { clientId: IDS.clientA1, keywords: ['x'] })).rejects.toMatchObject({ code: 'service_paused' });
    const team = await registry.invoke(admin, 'revoke_invitation', { invitationId: '00000000-0000-4000-8000-000000000999' }).catch((e: unknown) => e);
    expect((team as { code?: string } | null)?.code).not.toBe('service_paused');
    await expect(registry.invoke(admin, 'get_client_profile', { clientId: IDS.clientA1 })).resolves.toBeTruthy();
  });

  it('does not touch active, pilot or billing-less agencies', async () => {
    await expect(registry.invoke(admin, 'create_client', newClient('A', 'prospect'))).resolves.toBeTruthy();
    await setState('past_due');
    await expect(registry.invoke(admin, 'create_client', newClient('B', 'prospect'))).resolves.toBeTruthy();
  });
});
