import { agency, agencyBilling, client, plan } from '@cs/db';
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
  it('syncSeats skips a held agency', async () => {
    const gw = fakeGateway();
    await withSub(gw, { billableSeatsSynced: 5 });
    await dbs.owner.update(agency).set({ suspendedAt: new Date(), suspendedReason: 'unpaid invoice', suspendedBy: 'staff-1' }).where(eq(agency.id, AGENCY));
    expect(await syncSeats(dbs.service, gw, AGENCY)).toBe('skipped');
    expect(gw.calls).toHaveLength(0);
    expect(await row()).toMatchObject({ billableSeatsSynced: 5 });
  });

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
    expect(gw.callsTo('updateSeatQuantity')[0]!.args).toEqual(['sub_1', 2, { prorate: true, seatPriceId: null, invoiceNow: false }]);
    expect(await row()).toMatchObject({ billableSeatsSynced: 2, seatSyncPending: false });
  });

  it('decrease does not prorate', async () => {
    const gw = fakeGateway();
    await withSub(gw, { billableSeatsSynced: 4 });
    await addClients(dbs.owner, 3); // qty 2
    expect(await syncSeats(dbs.service, gw, AGENCY)).toBe('synced');
    expect(gw.callsTo('updateSeatQuantity')[0]!.args).toEqual(['sub_1', 2, { prorate: false, seatPriceId: null, invoiceNow: false }]);
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

  it('a yearly agency going 3 -> 4 clients is invoiced at once with the yearly seat price; a monthly one is not', async () => {
    await dbs.owner.update(plan).set({ stripeSeatPriceId: 'price_seat', stripeSeatPriceYearId: 'price_seat_year' }).where(eq(plan.id, planId));
    await addClients(dbs.owner, 2); // 4 active -> 1 extra
    const yearly = fakeGateway();
    await withSub(yearly, { billingInterval: 'year' });
    expect(await syncSeats(dbs.service, yearly, AGENCY)).toBe('synced');
    expect(yearly.callsTo('updateSeatQuantity')[0]!.args).toEqual(['sub_1', 1, { prorate: true, seatPriceId: 'price_seat_year', invoiceNow: true }]);
    await dbs.owner.update(agencyBilling).set({ billingInterval: 'month', billableSeatsSynced: 0 });
    const monthly = fakeGateway();
    monthly.seedSubscription({ id: 'sub_1', customerId: 'cus_1' });
    expect(await syncSeats(dbs.service, monthly, AGENCY)).toBe('synced');
    expect(monthly.callsTo('updateSeatQuantity')[0]!.args).toEqual(['sub_1', 1, { prorate: true, seatPriceId: 'price_seat', invoiceNow: false }]);
  });

  describe('yearly: decreases wait for renewal (final fix I4, spec D6)', () => {
    const yearly = async (paid: number) => {
      await dbs.owner.update(plan).set({ stripeSeatPriceId: 'price_seat', stripeSeatPriceYearId: 'price_seat_year' }).where(eq(plan.id, planId));
      const gw = fakeGateway();
      gw.seedSubscription({ id: 'sub_1', customerId: 'cus_1', seatQuantity: paid, interval: 'year' });
      await setBilling(dbs.owner, planId, { state: 'active', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', billingInterval: 'year', billableSeatsSynced: paid });
      return gw;
    };
    const setStatus = (id: string, status: 'active' | 'prospect') => dbs.owner.update(client).set({ status }).where(eq(client.id, id));

    it('a decrease then an increase back changes nothing in Stripe and invoices nothing', async () => {
      const gw = await yearly(2);
      const [extra] = await addClients(dbs.owner, 3); // 5 active -> 2 extra, all paid
      await setStatus(extra!, 'prospect'); // 4 active -> 1 extra
      expect(await syncSeats(dbs.service, gw, AGENCY)).toBe('deferred');
      expect(await row()).toMatchObject({ billableSeatsSynced: 2, seatSyncPending: false });
      await setStatus(extra!, 'active'); // back to 2 extra: still within the paid quantity
      expect(await syncSeats(dbs.service, gw, AGENCY)).toBe('synced');
      expect(gw.callsTo('updateSeatQuantity')).toEqual([]);
      expect(gw.subscriptions.get('sub_1')!.seatQuantity).toBe(2);
    });

    it('an increase above the paid quantity is prorated and invoiced now', async () => {
      const gw = await yearly(2);
      const [extra] = await addClients(dbs.owner, 3);
      await setStatus(extra!, 'prospect');
      await syncSeats(dbs.service, gw, AGENCY); // deferred: 1 wanted, 2 paid
      await addClients(dbs.owner, 2); // 6 active -> 3 extra
      expect(await syncSeats(dbs.service, gw, AGENCY)).toBe('synced');
      expect(gw.callsTo('updateSeatQuantity').map((c) => c.args)).toEqual([['sub_1', 3, { prorate: true, seatPriceId: 'price_seat_year', invoiceNow: true }]]);
      expect(await row()).toMatchObject({ billableSeatsSynced: 3, seatSyncPending: false });
    });

    it('applyYearlyDecrease (the renewal window) lowers the quantity without proration', async () => {
      const gw = await yearly(2);
      await addClients(dbs.owner, 2); // 4 active -> 1 extra
      expect(await syncSeats(dbs.service, gw, AGENCY, { applyYearlyDecrease: true })).toBe('synced');
      expect(gw.callsTo('updateSeatQuantity').map((c) => c.args)).toEqual([['sub_1', 1, { prorate: false, seatPriceId: 'price_seat_year', invoiceNow: false }]]);
      expect(await row()).toMatchObject({ billableSeatsSynced: 1, seatSyncPending: false });
    });
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
