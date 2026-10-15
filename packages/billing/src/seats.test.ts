import { agencyBilling, plan } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeGateway } from './fake-gateway';
import { syncSeats } from './seats';
import { AGENCY, addClients, resetBilling, setBilling } from './test-util';

afterEach(() => vi.restoreAllMocks());
const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

let planId: string;
beforeEach(async () => {
  planId = await resetBilling(dbs.owner); // 2 active clients, 3 included
});

const row = async () => (await dbs.owner.select().from(agencyBilling).where(eq(agencyBilling.agencyId, AGENCY)))[0]!;
const withSub = (gw: ReturnType<typeof fakeGateway>, v: Partial<typeof agencyBilling.$inferInsert> = {}) => {
  gw.seedSubscription({ id: 'sub_1', customerId: 'cus_1' });
  return setBilling(dbs.owner, planId, { state: 'active', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', ...v });
};

describe('syncSeats', () => {
  it('skips without a subscription and for pilots', async () => {
    const gw = fakeGateway();
    expect(await syncSeats(dbs.service, gw, AGENCY)).toBe('skipped'); // no row
    await setBilling(dbs.owner, planId, { state: 'trialing' });
    expect(await syncSeats(dbs.service, gw, AGENCY)).toBe('skipped');
    await dbs.owner.update(agencyBilling).set({ state: 'pilot', stripeSubscriptionId: 'sub_1' });
    expect(await syncSeats(dbs.service, gw, AGENCY)).toBe('skipped');
    expect(gw.callsTo('updateSeatQuantity')).toHaveLength(0);
  });

  it('does not call the gateway when quantity is unchanged (null counts as 0)', async () => {
    const gw = fakeGateway();
    await withSub(gw); // 2 active <= 3 included -> qty 0
    expect(await syncSeats(dbs.service, gw, AGENCY)).toBe('synced');
    expect(gw.callsTo('updateSeatQuantity')).toHaveLength(0);
    expect(await row()).toMatchObject({ billableSeatsSynced: 0, seatSyncPending: false });
  });

  it('increase prorates', async () => {
    const gw = fakeGateway();
    await withSub(gw);
    await addClients(dbs.owner, 3); // 5 active -> 2 extra
    expect(await syncSeats(dbs.service, gw, AGENCY)).toBe('synced');
    expect(gw.callsTo('updateSeatQuantity')[0]!.args).toEqual(['sub_1', 2, { prorate: true, seatPriceId: null }]);
    expect(await row()).toMatchObject({ billableSeatsSynced: 2, seatSyncPending: false });
  });

  it('decrease does not prorate', async () => {
    const gw = fakeGateway();
    await withSub(gw, { billableSeatsSynced: 4 });
    await addClients(dbs.owner, 3); // qty 2
    expect(await syncSeats(dbs.service, gw, AGENCY)).toBe('synced');
    expect(gw.callsTo('updateSeatQuantity')[0]!.args).toEqual(['sub_1', 2, { prorate: false, seatPriceId: null }]);
    expect((await row()).billableSeatsSynced).toBe(2);
  });

  it('adds the seat line (plan seat price) when the subscription was bought with no billable seats', async () => {
    const gw = fakeGateway();
    await dbs.owner.update(plan).set({ stripeSeatPriceId: 'price_seat' }).where(eq(plan.id, planId));
    gw.seedSubscription({ id: 'sub_1', customerId: 'cus_1', items: [{ id: 'si_base_1', priceId: 'price_base', quantity: 1 }] });
    await setBilling(dbs.owner, planId, { state: 'active', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', billableSeatsSynced: 0 });
    await addClients(dbs.owner, 2); // 4 active -> 1 extra
    expect(await syncSeats(dbs.service, gw, AGENCY)).toBe('synced');
    expect(gw.subscriptions.get('sub_1')!.items.find((i) => i.priceId === 'price_seat')?.quantity).toBe(1);
    expect(await row()).toMatchObject({ billableSeatsSynced: 1, seatSyncPending: false });
  });

  it('gateway failure sets seat_sync_pending, never throws, and a retry clears it', async () => {
    const gw = fakeGateway();
    await withSub(gw);
    await addClients(dbs.owner, 1); // 3 active -> still qty 0; add another to force a call
    await addClients(dbs.owner, 1); // 4 active -> qty 1
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    gw.failNext();
    expect(await syncSeats(dbs.service, gw, AGENCY)).toBe('pending');
    expect(log).toHaveBeenCalledWith('[billing] seat sync failed', { agencyId: AGENCY });
    expect(await row()).toMatchObject({ seatSyncPending: true, billableSeatsSynced: null });
    expect(await syncSeats(dbs.service, gw, AGENCY)).toBe('synced');
    expect(await row()).toMatchObject({ seatSyncPending: false, billableSeatsSynced: 1 });
  });
});
