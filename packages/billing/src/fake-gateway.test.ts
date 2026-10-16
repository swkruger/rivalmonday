import { describe, expect, it } from 'vitest';
import { FAKE_WEBHOOK_SIGNATURE, fakeGateway } from './fake-gateway';
import { InvalidSignature } from './types';

describe('fakeGateway', () => {
  it('runs customer -> checkout -> seat update coherently and records calls', async () => {
    const gw = fakeGateway();
    const { id: customerId } = await gw.createCustomer({ agencyId: 'a1', name: 'Acme' });
    const { url } = await gw.createCheckoutSession({
      customerId, basePriceId: 'pb', seatPriceId: 'ps', seatQty: 2, allowPromotionCodes: true,
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

  it('mints prefixed ids with a random suffix (never a guessable counter)', async () => {
    const a = (await fakeGateway().createCustomer({ agencyId: 'a', name: 'n' })).id;
    const b = (await fakeGateway().createCustomer({ agencyId: 'a', name: 'n' })).id;
    expect(a).toMatch(/^cus_fake_[0-9a-f]{8}$/);
    expect(a).not.toBe(b);
  });

  it('checkout with no billable seats has no seat line; a later seat update adds it', async () => {
    const gw = fakeGateway();
    const { url } = await gw.createCheckoutSession({ customerId: 'c', basePriceId: 'pb', seatPriceId: 'ps', seatQty: 0, allowPromotionCodes: true, successUrl: 'https://x/ok', cancelUrl: 'https://x/no' });
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
    const p = await gw.createPrices({ code: 'standard', version: 2, name: 'Standard', basePriceCents: 1, seatPriceCents: 1, stripeProductId: 'prod_b', stripeSeatProductId: 'prod_s' });
    expect(p).toMatchObject({ baseProductId: 'prod_b', seatProductId: 'prod_s' });
    const fresh = await gw.createPrices({ code: 's', version: 1, name: 'S', basePriceCents: 1, seatPriceCents: 1 });
    expect(fresh.baseProductId).not.toBe(fresh.seatProductId);
  });

  it('verifyWebhook accepts only the fake signature', () => {
    const gw = fakeGateway();
    const body = JSON.stringify({ id: 'evt_1', type: 'x', created: 1, data: { object: {} } });
    expect(gw.verifyWebhook(body, FAKE_WEBHOOK_SIGNATURE).id).toBe('evt_1');
    expect(() => gw.verifyWebhook(body, 'nope')).toThrow(InvalidSignature);
  });
});
