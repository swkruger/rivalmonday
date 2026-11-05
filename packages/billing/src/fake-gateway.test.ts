import { describe, expect, it } from 'vitest';
import { FAKE_WEBHOOK_SIGNATURE, fakeGateway } from './fake-gateway';
import { InvalidSignature } from './types';

describe('fakeGateway', () => {
  it('runs customer -> checkout -> seat update coherently and records calls', async () => {
    const gw = fakeGateway();
    const { id: customerId } = await gw.createCustomer({ agencyId: 'a1', name: 'Acme' });
    const { url } = await gw.createCheckoutSession({
      customerId, basePriceId: 'pb', seatPriceId: 'ps', seatQty: 2, interval: 'month', allowPromotionCodes: true,
      successUrl: 'https://x/ok', cancelUrl: 'https://x/no',
    });
    const subId = url.split('fake_checkout=')[1]!;
    expect((await gw.getSubscription(subId)).seatQuantity).toBe(2);
    await gw.updateSeatQuantity(subId, 5, { prorate: true });
    const s = await gw.getSubscription(subId);
    expect(s.seatQuantity).toBe(5);
    expect(s.items.find((i) => i.priceId === 'ps')?.quantity).toBe(5);
    expect(gw.callsTo('updateSeatQuantity')).toHaveLength(1);
    expect(gw.calls.map((c) => c.method)).toEqual(['createCustomer', 'createCheckoutSession', 'getSubscription', 'updateSeatQuantity', 'getSubscription']);
  });

  it('swapSubscriptionPlan records swaps and updates items', async () => {
    const gw = fakeGateway();
    gw.seedSubscription({ id: 'sub_1', customerId: 'cus_1', seatQuantity: 1, items: [{ id: 'si_base_1', priceId: 'pb', quantity: 1 }, { id: 'si_seat_1', priceId: 'ps', quantity: 1 }] });
    const i = { basePriceId: 'pb2', seatPriceId: 'ps2', seatQuantity: 4 };
    await gw.swapSubscriptionPlan('sub_1', i);
    expect(gw.swaps).toEqual([{ subscriptionId: 'sub_1', ...i }]);
    const s = await gw.getSubscription('sub_1');
    expect(s.seatQuantity).toBe(4);
    expect(s.items.map((x) => x.priceId).sort()).toEqual(['pb2', 'ps2']);
    await gw.swapSubscriptionPlan('sub_1', { ...i, seatQuantity: 0 });
    expect((await gw.getSubscription('sub_1')).items.map((x) => x.priceId)).toEqual(['pb2']);
    gw.failNext();
    await expect(gw.swapSubscriptionPlan('sub_1', i)).rejects.toThrow(/fake gateway failure/);
  });

  it('mints prefixed ids with a random suffix (never a guessable counter)', async () => {
    const a = (await fakeGateway().createCustomer({ agencyId: 'a', name: 'n' })).id;
    const b = (await fakeGateway().createCustomer({ agencyId: 'a', name: 'n' })).id;
    expect(a).toMatch(/^cus_fake_[0-9a-f]{8}$/);
    expect(a).not.toBe(b);
  });

  it('checkout with no billable seats has no seat line; a later seat update adds it', async () => {
    const gw = fakeGateway();
    const { url } = await gw.createCheckoutSession({ customerId: 'c', basePriceId: 'pb', seatPriceId: 'ps', seatQty: 0, interval: 'month', allowPromotionCodes: true, successUrl: 'https://x/ok', cancelUrl: 'https://x/no' });
    const subId = url.split('fake_checkout=')[1]!;
    expect((await gw.getSubscription(subId)).items.map((i) => i.priceId)).toEqual(['pb']);
    await gw.updateSeatQuantity(subId, 2, { prorate: true, seatPriceId: 'ps' });
    const s = await gw.getSubscription(subId);
    expect(s.seatQuantity).toBe(2);
    expect(s.items.find((i) => i.priceId === 'ps')?.quantity).toBe(2);
  });

  it('an unknown subscription is resource_missing, like Stripe', async () => {
    await expect(fakeGateway().getSubscription('sub_nope')).rejects.toMatchObject({ code: 'resource_missing' });
  });

  it('fails exactly the next call', async () => {
    const gw = fakeGateway();
    gw.failNext(new Error('boom'));
    await expect(gw.createCustomer({ agencyId: 'a', name: 'n' })).rejects.toThrow('boom');
    await expect(gw.createCustomer({ agencyId: 'a', name: 'n' })).resolves.toHaveProperty('id');
  });

  it('serves seeded subscriptions, invoices and upcoming invoice', async () => {
    const gw = fakeGateway();
    gw.seedSubscription({ id: 'sub_1', customerId: 'cus_1', seatQuantity: 4, status: 'past_due' });
    gw.seedInvoice('cus_1', { id: 'in_1', amountPaidCents: 22900 });
    gw.seedUpcoming('sub_1', { amountDueCents: 1, periodEnd: new Date(0), discountCents: 0 });
    expect((await gw.getSubscription('sub_1')).status).toBe('past_due');
    expect(await gw.listInvoices('cus_1')).toHaveLength(1);
    expect((await gw.upcomingInvoice('sub_1'))?.amountDueCents).toBe(1);
  });

  it('keeps coupons, promotion codes and subscription discounts', async () => {
    const gw = fakeGateway();
    const { id: cus } = await gw.createCustomer({ agencyId: 'a', name: 'n' });
    const { id: coupon } = await gw.createCoupon({ percentOff: 20, duration: 'repeating', durationInMonths: 3, appliesToProductIds: ['prod_1'] });
    const { id: promo } = await gw.createPromotionCode({ couponId: coupon, code: 'SAVE', customerId: cus });
    gw.seedSubscription({ id: 'sub_1', customerId: cus });
    await gw.attachSubscriptionDiscount({ subscriptionId: 'sub_1', couponId: coupon });
    await gw.deactivatePromotionCode(promo);
    expect(gw.promotionCodes.get(promo)?.active).toBe(false);
    expect(gw.subscriptionCoupons.get('sub_1')).toEqual([coupon]);
    await expect(gw.attachSubscriptionDiscount({ subscriptionId: 'sub_nope', couponId: coupon })).rejects.toThrow();
    await expect(gw.createCoupon({ percentOff: 5, duration: 'repeating' })).rejects.toThrow();
  });

  it('updateCustomer records the call and merges details into the customer', async () => {
    const gw = fakeGateway();
    const { id } = await gw.createCustomer({ agencyId: 'a1', name: 'Acme' });
    const d = { email: 'b@acme.test', name: 'Acme LLC', address: { line1: '1 Main', city: 'Austin', state: 'TX', postal_code: '78701', country: 'US' }, taxId: '12-3456789' };
    await gw.updateCustomer(id, d);
    expect(gw.callsTo('updateCustomer')).toEqual([{ method: 'updateCustomer', args: [id, d] }]);
    expect(gw.customers.get(id)).toMatchObject({ name: 'Acme LLC', email: 'b@acme.test', address: d.address, taxId: '12-3456789' });
    await expect(gw.updateCustomer('cus_missing', {})).rejects.toMatchObject({ code: 'resource_missing' });
  });

  it('updateCustomer records only valid EINs, normalised to NN-NNNNNNN', async () => {
    const gw = fakeGateway();
    const { id } = await gw.createCustomer({ agencyId: 'a1', name: 'Acme' });
    await gw.updateCustomer(id, { taxId: 'GB123456789' });
    expect(gw.customers.get(id)!.taxId).toBeUndefined();
    await gw.updateCustomer(id, { taxId: '12-345678' });
    expect(gw.customers.get(id)!.taxId).toBeUndefined();
    await gw.updateCustomer(id, { taxId: ' 123456789 ' });
    expect(gw.customers.get(id)!.taxId).toBe('12-3456789');
  });

  it('createPrices reuses passed base and seat product ids', async () => {
    const gw = fakeGateway();
    const tiers = [{ upTo: null, unitCents: 1 }];
    const p = await gw.createPrices({ code: 'standard', version: 2, name: 'Standard', basePriceCents: 1, basePriceYearCents: null, seatTiers: tiers, stripeProductId: 'prod_b', stripeSeatProductId: 'prod_s' });
    expect(p).toMatchObject({ baseProductId: 'prod_b', seatProductId: 'prod_s', basePriceYearId: null, seatPriceYearId: null });
    const fresh = await gw.createPrices({ code: 's', version: 1, name: 'S', basePriceCents: 1, basePriceYearCents: null, seatTiers: tiers });
    expect(fresh.baseProductId).not.toBe(fresh.seatProductId);
  });

  const V2 = { code: 'standard', version: 2, name: 'Standard', basePriceCents: 22900, basePriceYearCents: 229000, seatTiers: [{ upTo: 7, unitCents: 7900 }, { upTo: null, unitCents: 5900 }] };
  const co = (gw: ReturnType<typeof fakeGateway>, interval: 'month' | 'year', base: string, seat: string, seatQty: number) =>
    gw.createCheckoutSession({ customerId: 'c', basePriceId: base, seatPriceId: seat, seatQty, interval, allowPromotionCodes: true, successUrl: 'https://x/ok', cancelUrl: 'https://x/no' });

  it('createPrices mints four prices for a yearly plan and records tiers and interval', async () => {
    const gw = fakeGateway();
    const p = await gw.createPrices(V2);
    expect([p.basePriceYearId, p.seatPriceYearId].every((x) => x && x !== p.basePriceId)).toBe(true);
    expect(gw.prices.get(p.seatPriceYearId!)).toMatchObject({ role: 'seat', interval: 'year' });
    expect(gw.prices.get(p.seatPriceId)!.plan.seatTiers).toEqual(V2.seatTiers);
  });

  it('checkout stores the interval; upcomingInvoice prices via planCents (graduated, yearly = 12 x seats)', async () => {
    const gw = fakeGateway();
    const p = await gw.createPrices(V2);
    const m = (await co(gw, 'month', p.basePriceId, p.seatPriceId, 9)).url.split('fake_checkout=')[1]!; // 9 extra: 7 x 79 + 2 x 59
    const y = (await co(gw, 'year', p.basePriceYearId!, p.seatPriceYearId!, 9)).url.split('fake_checkout=')[1]!;
    expect((await gw.getSubscription(m)).interval).toBe('month');
    expect((await gw.getSubscription(y)).interval).toBe('year');
    expect((await gw.upcomingInvoice(m))!.amountDueCents).toBe(22900 + 7 * 7900 + 2 * 5900);
    expect((await gw.upcomingInvoice(y))!.amountDueCents).toBe(229000 + 12 * (7 * 7900 + 2 * 5900));
    gw.seedUpcoming(m, null);
    expect(await gw.upcomingInvoice(m)).toBeNull();
  });

  it('switchSubscriptionInterval moves to the yearly prices, records the call and flips the interval', async () => {
    const gw = fakeGateway();
    const p = await gw.createPrices(V2);
    const id = (await co(gw, 'month', p.basePriceId, p.seatPriceId, 2)).url.split('fake_checkout=')[1]!;
    const i = { basePriceId: p.basePriceYearId!, seatPriceId: p.seatPriceYearId!, seatQuantity: 2 };
    await gw.switchSubscriptionInterval(id, i);
    const s = await gw.getSubscription(id);
    expect(s.interval).toBe('year');
    expect(s.items.map((x) => x.priceId).sort()).toEqual([i.basePriceId, i.seatPriceId].sort());
    expect(gw.switches).toEqual([{ subscriptionId: id, ...i }]);
    expect(gw.swaps).toEqual([]);
    gw.failNext();
    await expect(gw.switchSubscriptionInterval(id, i)).rejects.toThrow(/fake gateway failure/);
  });

  it('verifyWebhook accepts only the fake signature', () => {
    const gw = fakeGateway();
    const body = JSON.stringify({ id: 'evt_1', type: 'x', created: 1, data: { object: {} } });
    expect(gw.verifyWebhook(body, FAKE_WEBHOOK_SIGNATURE).id).toBe('evt_1');
    expect(() => gw.verifyWebhook(body, 'nope')).toThrow(InvalidSignature);
  });

  it('pauseCollection / resumeCollection track state, check the target and honour per-subscription failures', async () => {
    const gw = fakeGateway();
    gw.seedSubscription({ id: 'sub_p', customerId: 'cus' });
    gw.seedConnectedAccount({ id: 'acct_1' });
    gw.seedConnectedSubscription({ id: 'sub_c', stripeAccount: 'acct_1', customerId: 'cus_c' });
    await gw.pauseCollection('sub_p');
    await gw.pauseCollection('sub_c', { stripeAccount: 'acct_1' });
    expect([...gw.pausedCollection].sort()).toEqual(['sub_c', 'sub_p']);
    await gw.resumeCollection('sub_p');
    expect([...gw.pausedCollection]).toEqual(['sub_c']);
    await expect(gw.pauseCollection('sub_none')).rejects.toMatchObject({ code: 'resource_missing' });
    gw.failCollectionFor('sub_p');
    await expect(gw.pauseCollection('sub_p')).rejects.toThrow();
    gw.clearCollectionFailures();
    await gw.pauseCollection('sub_p');
    expect(gw.callsTo('pauseCollection')).toHaveLength(5);
  });
});
