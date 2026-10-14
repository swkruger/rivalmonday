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

  it('keeps coupons, promotion codes and customer discounts', async () => {
    const gw = fakeGateway();
    const { id: cus } = await gw.createCustomer({ agencyId: 'a', name: 'n' });
    const { id: coupon } = await gw.createCoupon({ percentOff: 20, duration: 'repeating', durationInMonths: 3, appliesToProductIds: ['prod_1'] });
    const { id: promo } = await gw.createPromotionCode({ couponId: coupon, code: 'SAVE', customerId: cus });
    await gw.attachCustomerDiscount({ customerId: cus, couponId: coupon });
    await gw.deactivatePromotionCode(promo);
    expect(gw.promotionCodes.get(promo)?.active).toBe(false);
    expect(gw.customers.get(cus)?.couponIds).toEqual([coupon]);
    await expect(gw.createCoupon({ percentOff: 5, duration: 'repeating' })).rejects.toThrow();
  });

  it('createPrices reuses a passed product id', async () => {
    const gw = fakeGateway();
    const p = await gw.createPrices({ code: 'standard', version: 2, name: 'Standard', basePriceCents: 1, seatPriceCents: 1, stripeProductId: 'prod_x' });
    expect(p.productId).toBe('prod_x');
  });

  it('verifyWebhook accepts only the fake signature', () => {
    const gw = fakeGateway();
    const body = JSON.stringify({ id: 'evt_1', type: 'x', created: 1, data: { object: {} } });
    expect(gw.verifyWebhook(body, FAKE_WEBHOOK_SIGNATURE).id).toBe('evt_1');
    expect(() => gw.verifyWebhook(body, 'nope')).toThrow(InvalidSignature);
  });
});
