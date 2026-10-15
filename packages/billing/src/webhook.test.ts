import { agencyBilling, agencyBillingEvent, plan, stripeEvent } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FakeGateway, fakeGateway } from './fake-gateway';
import { AGENCY, resetBilling, setBilling } from './test-util';
import type { StripeEventLike } from './types';
import { handleStripeEvent } from './webhook';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const CUS = 'cus_1';
const T0 = 1_790_000_000; // seconds
let planId: string;
let gw: FakeGateway;
beforeEach(async () => {
  planId = await resetBilling(dbs.owner);
  await dbs.owner.update(plan).set({ stripeBasePriceId: 'price_base', stripeSeatPriceId: 'price_seat' }).where(eq(plan.id, planId));
  gw = fakeGateway();
});

const ev = (id: string, type: string, object: Record<string, unknown>, created = T0): StripeEventLike => ({ id, type, created, data: { object: { customer: CUS, ...object } } });
const handle = (e: StripeEventLike) => handleStripeEvent(dbs.service, gw, e);
const row = async () => (await dbs.owner.select().from(agencyBilling).where(eq(agencyBilling.agencyId, AGENCY)))[0]!;
const record = async (id: string) => (await dbs.owner.select().from(stripeEvent).where(eq(stripeEvent.id, id)))[0];
const seed = (state: 'trialing' | 'active' | 'past_due', extra: Partial<typeof agencyBilling.$inferInsert> = {}) =>
  setBilling(dbs.owner, planId, { state, stripeCustomerId: CUS, ...extra });

describe('handleStripeEvent', () => {
  it('checkout.session.completed stores subscription, plan and seats, then activates', async () => {
    await dbs.owner.update(plan).set({ stripeBasePriceId: 'price_other', isCurrent: false }).where(eq(plan.id, planId));
    const [v2] = await dbs.owner
      .insert(plan)
      .values({ code: 'standard', version: 2, name: 'S2', basePriceCents: 1, includedSeats: 3, seatPriceCents: 1, trialDays: 30, createdBy: 't', isCurrent: true, stripeBasePriceId: 'price_base' })
      .returning({ id: plan.id });
    await seed('trialing');
    gw.seedSubscription({ id: 'sub_1', customerId: CUS, seatQuantity: 5, items: [{ id: 'i1', priceId: 'price_base', quantity: 1 }, { id: 'i2', priceId: 'price_seat', quantity: 5 }] });
    expect(await handle(ev('evt_1', 'checkout.session.completed', { subscription: 'sub_1' }))).toBe('processed');
    expect(await row()).toMatchObject({ state: 'active', stripeSubscriptionId: 'sub_1', planId: v2!.id, billableSeatsSynced: 5, lastStripeEventAt: new Date(T0 * 1000) });
    expect((await record('evt_1'))?.processedAt).not.toBeNull();
  });

  it('a stale checkout.session.completed still records subscription, plan and seats (R12)', async () => {
    await seed('trialing');
    gw.seedSubscription({ id: 'sub_1', customerId: CUS, seatQuantity: 4, items: [{ id: 'i1', priceId: 'price_base', quantity: 1 }] });
    expect(await handle(ev('new', 'invoice.paid', {}, T0 + 5))).toBe('processed');
    expect(await handle(ev('old', 'checkout.session.completed', { subscription: 'sub_1' }, T0))).toBe('ignored');
    expect(await row()).toMatchObject({ state: 'active', stripeSubscriptionId: 'sub_1', planId, billableSeatsSynced: 4, lastStripeEventAt: new Date((T0 + 5) * 1000) });
  });

  it('re-subscribe: a newer checkout replaces the ended subscription facts; an older replay does not (R12)', async () => {
    await seed('active', { stripeSubscriptionId: 'sub_old', lastStripeEventAt: new Date(T0 * 1000) });
    await handle(ev('end', 'customer.subscription.deleted', { id: 'sub_old' }, T0 + 1));
    expect((await row()).state).toBe('past_due');
    gw.seedSubscription({ id: 'sub_new', customerId: CUS, seatQuantity: 6, items: [{ id: 'i1', priceId: 'price_base', quantity: 1 }] });
    expect(await handle(ev('co_new', 'checkout.session.completed', { subscription: 'sub_new' }, T0 + 10))).toBe('processed');
    expect(await row()).toMatchObject({ state: 'active', stripeSubscriptionId: 'sub_new', billableSeatsSynced: 6, planId });
    expect(await handle(ev('co_old', 'checkout.session.completed', { subscription: 'sub_old' }, T0 + 2))).toBe('ignored');
    expect((await row()).stripeSubscriptionId).toBe('sub_new');
  });

  it('customer.subscription.deleted forgets the subscription (R26)', async () => {
    await seed('active', { stripeSubscriptionId: 'sub_1', billableSeatsSynced: 2, seatSyncPending: true });
    expect(await handle(ev('e1', 'customer.subscription.deleted', { id: 'sub_1', status: 'canceled' }))).toBe('processed');
    expect(await row()).toMatchObject({ state: 'past_due', stripeSubscriptionId: null, billableSeatsSynced: null, seatSyncPending: false });
  });

  it('customer.subscription.updated with status canceled ends the subscription (R26)', async () => {
    await seed('active', { stripeSubscriptionId: 'sub_1', billableSeatsSynced: 1 });
    expect(await handle(ev('e1', 'customer.subscription.updated', { id: 'sub_1', status: 'canceled' }))).toBe('processed');
    expect(await row()).toMatchObject({ state: 'past_due', stripeSubscriptionId: null, billableSeatsSynced: null });
  });

  it('customer.subscription.* for another subscription than the stored one is ignored (R26)', async () => {
    await seed('active', { stripeSubscriptionId: 'sub_new', billableSeatsSynced: 2 });
    expect(await handle(ev('e1', 'customer.subscription.deleted', { id: 'sub_old', status: 'canceled' }, T0 + 5))).toBe('ignored');
    expect(await handle(ev('e2', 'customer.subscription.updated', { id: 'sub_old', status: 'past_due' }, T0 + 6))).toBe('ignored');
    expect(await row()).toMatchObject({ state: 'active', stripeSubscriptionId: 'sub_new', billableSeatsSynced: 2, lastStripeEventAt: null });
    expect(await dbs.owner.select().from(agencyBillingEvent)).toEqual([]);
    expect((await record('e1'))?.processedAt).not.toBeNull();
  });

  it('fill-when-null only for a live subscription status (R26)', async () => {
    await seed('past_due', { pastDueSince: new Date(T0 * 1000) });
    await handle(ev('e1', 'customer.subscription.updated', { id: 'sub_dead', status: 'canceled' }));
    await handle(ev('e2', 'customer.subscription.deleted', { id: 'sub_dead' }, T0 + 1));
    expect((await row()).stripeSubscriptionId).toBeNull();
  });

  it('a replayed checkout for an ended subscription does not bring its id back', async () => {
    await seed('past_due', { pastDueSince: new Date(T0 * 1000), lastStripeEventAt: new Date((T0 + 10) * 1000) });
    gw.seedSubscription({ id: 'sub_old', customerId: CUS, status: 'canceled' });
    expect(await handle(ev('co_old', 'checkout.session.completed', { subscription: 'sub_old' }, T0))).toBe('ignored');
    expect(await row()).toMatchObject({ state: 'past_due', stripeSubscriptionId: null });
  });

  it('customer.subscription.* fills a missing stripe_subscription_id from the object id', async () => {
    await seed('active');
    await handle(ev('e1', 'customer.subscription.updated', { id: 'sub_9', status: 'incomplete' }));
    expect((await row()).stripeSubscriptionId).toBe('sub_9');
  });

  it('subscription.updated: active, trialing with/without payment method', async () => {
    await seed('past_due', { pastDueSince: new Date(T0 * 1000 - 864e5) });
    expect(await handle(ev('e1', 'customer.subscription.updated', { id: 'sub_1', status: 'active' }))).toBe('processed');
    expect((await row()).state).toBe('active');

    await dbs.owner.update(agencyBilling).set({ state: 'trialing' });
    expect(await handle(ev('e2', 'customer.subscription.updated', { id: 'sub_1', status: 'trialing' }, T0 + 1))).toBe('ignored');
    expect((await row()).state).toBe('trialing');
    expect(await handle(ev('e3', 'customer.subscription.updated', { id: 'sub_1', status: 'trialing', default_payment_method: 'pm_1' }, T0 + 2))).toBe('processed');
    expect((await row()).state).toBe('active');
  });

  it('subscription.updated: past_due and unpaid => payment_failed with Stripe time', async () => {
    await seed('active');
    await handle(ev('e1', 'customer.subscription.updated', { id: 'sub_1', status: 'past_due' }));
    expect(await row()).toMatchObject({ state: 'past_due', pastDueSince: new Date(T0 * 1000) });
    await dbs.owner.update(agencyBilling).set({ state: 'active', pastDueSince: null });
    expect(await handle(ev('e2', 'customer.subscription.updated', { id: 'sub_1', status: 'unpaid' }, T0 + 5))).toBe('processed');
    expect((await row()).state).toBe('past_due');
  });

  it('subscription.updated: cancel_at_period_end => cancelled at cancel_at / current_period_end', async () => {
    await seed('active');
    await handle(ev('e1', 'customer.subscription.updated', { id: 'sub_1', status: 'active', cancel_at_period_end: true, cancel_at: T0 + 1000 }));
    expect(await row()).toMatchObject({ state: 'cancelled', cancelAt: new Date((T0 + 1000) * 1000) });
    await dbs.owner.update(agencyBilling).set({ state: 'active', cancelAt: null });
    await handle(ev('e2', 'customer.subscription.updated', { id: 'sub_1', status: 'active', cancel_at_period_end: true, current_period_end: T0 + 2000 }, T0 + 1));
    expect(await row()).toMatchObject({ state: 'cancelled', cancelAt: new Date((T0 + 2000) * 1000) });
  });

  it('subscription.updated with other statuses is ignored', async () => {
    await seed('active');
    expect(await handle(ev('e1', 'customer.subscription.updated', { id: 'sub_1', status: 'incomplete' }))).toBe('ignored');
    expect((await record('e1'))?.processedAt).not.toBeNull();
  });

  it('subscription.deleted, invoice.paid, invoice.payment_failed', async () => {
    await seed('active');
    await handle(ev('e1', 'customer.subscription.deleted', { id: 'sub_1' }));
    expect(await row()).toMatchObject({ state: 'past_due', pastDueSince: new Date(T0 * 1000) });
    await handle(ev('e2', 'invoice.paid', {}, T0 + 10));
    expect((await row()).state).toBe('active');
    await handle(ev('e3', 'invoice.payment_failed', {}, T0 + 20));
    expect((await row()).state).toBe('past_due');
    const evs = await dbs.owner.select().from(agencyBillingEvent);
    expect(evs.map((e) => e.stripeEventId).sort()).toEqual(['e1', 'e2', 'e3']);
  });

  it('duplicate delivery is a no-op', async () => {
    await seed('active');
    const e = ev('e1', 'invoice.payment_failed', {});
    expect(await handle(e)).toBe('processed');
    expect(await handle(e)).toBe('duplicate');
    expect(await dbs.owner.select().from(agencyBillingEvent)).toHaveLength(1);
  });

  it('a stale payment_failed after a newer invoice.paid is ignored', async () => {
    await seed('past_due', { pastDueSince: new Date(T0 * 1000 - 1000) });
    await handle(ev('new', 'invoice.paid', {}, T0 + 100));
    expect((await row()).state).toBe('active');
    expect(await handle(ev('old', 'invoice.payment_failed', {}, T0 + 50))).toBe('ignored');
    expect(await row()).toMatchObject({ state: 'active', lastStripeEventAt: new Date((T0 + 100) * 1000) });
  });

  it('unknown customer and unrelated event types are ignored (and marked processed)', async () => {
    await seed('active');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await handle({ id: 'e1', type: 'invoice.paid', created: T0, data: { object: { customer: 'cus_nope' } } })).toBe('ignored');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('e1'));
    warn.mockRestore();
    expect(await handle(ev('e2', 'charge.succeeded', {}))).toBe('ignored');
    expect((await record('e1'))?.processedAt).not.toBeNull();
    expect((await row()).state).toBe('active');
  });

  it('a failing handler rolls back, records the error, rethrows; a retry is reprocessed', async () => {
    await seed('trialing');
    const e = ev('e1', 'checkout.session.completed', { subscription: 'sub_missing' });
    await expect(handle(e)).rejects.toThrow(/no subscription/);
    expect(await record('e1')).toMatchObject({ processedAt: null, error: expect.stringContaining('no subscription') });
    expect((await row()).state).toBe('trialing');
    gw.seedSubscription({ id: 'sub_missing', customerId: CUS, seatQuantity: 3, items: [{ id: 'i1', priceId: 'price_base', quantity: 1 }] });
    expect(await handle(e)).toBe('processed');
    expect(await record('e1')).toMatchObject({ error: null });
    expect((await row()).state).toBe('active');
  });
});
