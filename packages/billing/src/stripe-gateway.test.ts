import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import { PRICE_ROLE_KEY, stripeGateway } from './stripe-gateway';
import { InvalidSignature } from './types';

function mockClient() {
  return {
    customers: {
      create: vi.fn(async () => ({ id: 'cus_1' })),
      retrieve: vi.fn(async () => ({ id: 'cus_1', invoice_settings: { default_payment_method: 'pm_1' } })),
      update: vi.fn(async () => ({})),
    },
    checkout: { sessions: { create: vi.fn(async () => ({ url: 'https://checkout/s' })) } },
    billingPortal: { sessions: { create: vi.fn(async () => ({ url: 'https://portal/s' })) } },
    subscriptions: {
      retrieve: vi.fn(async () => ({
        id: 'sub_1', status: 'trialing', customer: 'cus_1', cancel_at_period_end: false, trial_end: 1_800_000_000, default_payment_method: null,
        items: { data: [
          { id: 'si_b', quantity: 1, current_period_end: 1_800_100_000, price: { id: 'price_b', metadata: { [PRICE_ROLE_KEY]: 'base' } } },
          { id: 'si_s', quantity: 4, current_period_end: 1_800_100_000, price: { id: 'price_s', metadata: { [PRICE_ROLE_KEY]: 'seat' } } },
        ] },
      })),
      update: vi.fn(async () => ({})),
    },
    invoices: { createPreview: vi.fn(), list: vi.fn() },
    products: { create: vi.fn(async () => ({ id: 'prod_new' })) },
    prices: { create: vi.fn(async (p: { unit_amount: number }) => ({ id: `price_${p.unit_amount}` })) },
    coupons: { create: vi.fn(async () => ({ id: 'co_1' })) },
    promotionCodes: { create: vi.fn(async () => ({ id: 'promo_1' })), update: vi.fn(async () => ({})) },
    webhooks: { constructEvent: vi.fn() },
  };
}
type Mock = ReturnType<typeof mockClient>;
const gw = (c: Mock, o: { taxEnabled?: boolean; webhookSecret?: string } = {}) =>
  stripeGateway('sk_test', { client: c as unknown as Stripe, ...o });

const checkout = { customerId: 'cus_1', basePriceId: 'price_b', seatPriceId: 'price_s', seatQty: 3, allowPromotionCodes: true, successUrl: 's', cancelUrl: 'c' };
const firstArg = (fn: { mock: { calls: unknown[][] } }, n = 0) => fn.mock.calls[n]![0] as Record<string, unknown>;

describe('stripeGateway', () => {
  it('Checkout: seat line quantity, trial_end seconds, automatic_tax from flag', async () => {
    const c = mockClient();
    await gw(c, { taxEnabled: true }).createCheckoutSession({ ...checkout, trialEnd: new Date(1_800_000_000_000) });
    const p = firstArg(c.checkout.sessions.create);
    expect(p.mode).toBe('subscription');
    expect(p.line_items).toEqual([{ price: 'price_b', quantity: 1 }, { price: 'price_s', quantity: 3 }]);
    expect(p.subscription_data).toEqual({ trial_end: 1_800_000_000 });
    expect(p.automatic_tax).toEqual({ enabled: true });
    expect(p.allow_promotion_codes).toBe(true);
    expect(p.discounts).toBeUndefined();
  });

  it('Checkout: tax off by default, coupon replaces allow_promotion_codes, no trial', async () => {
    const c = mockClient();
    await gw(c).createCheckoutSession({ ...checkout, couponId: 'co_1' });
    const p = firstArg(c.checkout.sessions.create);
    expect(p.automatic_tax).toEqual({ enabled: false });
    expect(p.discounts).toEqual([{ coupon: 'co_1' }]);
    expect(p.allow_promotion_codes).toBeUndefined();
    expect(p.subscription_data).toBeUndefined();
  });

  it('updateSeatQuantity targets the seat line with the proration mode', async () => {
    const c = mockClient();
    await gw(c).updateSeatQuantity('sub_1', 7, { prorate: false });
    expect(c.subscriptions.update).toHaveBeenCalledWith('sub_1', { items: [{ id: 'si_s', quantity: 7 }], proration_behavior: 'none' });
    await gw(c).updateSeatQuantity('sub_1', 8, { prorate: true });
    expect(c.subscriptions.update).toHaveBeenLastCalledWith('sub_1', { items: [{ id: 'si_s', quantity: 8 }], proration_behavior: 'create_prorations' });
  });

  it('getSubscription maps seat quantity, payment method and dates', async () => {
    const s = await gw(mockClient()).getSubscription('sub_1');
    expect(s).toMatchObject({ id: 'sub_1', status: 'trialing', customerId: 'cus_1', seatQuantity: 4, hasDefaultPaymentMethod: true, cancelAtPeriodEnd: false });
    expect(s.currentPeriodEnd).toEqual(new Date(1_800_100_000_000));
    expect(s.items).toHaveLength(2);
  });

  it('upcomingInvoice maps cents and returns null when none', async () => {
    const c = mockClient();
    c.invoices.createPreview.mockResolvedValueOnce({ amount_due: 31800, period_end: 1_800_000_000, total_discount_amounts: [{ amount: 500 }, { amount: 100 }] });
    expect(await gw(c).upcomingInvoice('sub_1')).toEqual({ amountDueCents: 31800, periodEnd: new Date(1_800_000_000_000), discountCents: 600 });
    c.invoices.createPreview.mockRejectedValueOnce(Object.assign(new Error('none'), { code: 'invoice_upcoming_none' }));
    expect(await gw(c).upcomingInvoice('sub_1')).toBeNull();
  });

  it('createPrices makes a product (or reuses one) and role-tagged monthly USD prices', async () => {
    const c = mockClient();
    const r = await gw(c).createPrices({ code: 'standard', version: 1, name: 'Standard', basePriceCents: 22900, seatPriceCents: 9900 });
    expect(r).toEqual({ productId: 'prod_new', basePriceId: 'price_22900', seatPriceId: 'price_9900' });
    expect(firstArg(c.prices.create, 1)).toMatchObject({ product: 'prod_new', currency: 'usd', unit_amount: 9900, recurring: { interval: 'month' }, metadata: { [PRICE_ROLE_KEY]: 'seat' } });
    c.products.create.mockClear();
    await gw(c).createPrices({ code: 'standard', version: 2, name: 'Standard', basePriceCents: 1, seatPriceCents: 1, stripeProductId: 'prod_old' });
    expect(c.products.create).not.toHaveBeenCalled();
  });

  it('createCoupon maps percent/amount, repeating months and applies_to', async () => {
    const c = mockClient();
    await gw(c).createCoupon({ percentOff: 25, duration: 'repeating', durationInMonths: 6, appliesToProductIds: ['prod_1'] });
    expect(firstArg(c.coupons.create)).toMatchObject({ percent_off: 25, duration: 'repeating', duration_in_months: 6, applies_to: { products: ['prod_1'] } });
    await gw(c).createCoupon({ amountOffCents: 5000, duration: 'once' });
    expect(firstArg(c.coupons.create, 1)).toMatchObject({ amount_off: 5000, currency: 'usd', duration: 'once' });
    await expect(gw(c).createCoupon({ duration: 'once' })).rejects.toThrow();
  });

  it('createPromotionCode passes customer, expiry seconds and max redemptions', async () => {
    const c = mockClient();
    await gw(c).createPromotionCode({ couponId: 'co_1', code: 'SAVE', customerId: 'cus_1', expiresAt: new Date(1_800_000_000_000), maxRedemptions: 3 });
    expect(firstArg(c.promotionCodes.create)).toMatchObject({ promotion: { type: 'coupon', coupon: 'co_1' }, code: 'SAVE', customer: 'cus_1', expires_at: 1_800_000_000, max_redemptions: 3 });
  });

  it('verifyWebhook maps bad signatures to InvalidSignature', () => {
    const c = mockClient();
    c.webhooks.constructEvent.mockImplementationOnce(() => { throw new Error('bad sig'); });
    expect(() => gw(c, { webhookSecret: 'whsec' }).verifyWebhook('{}', 'x')).toThrow(InvalidSignature);
    c.webhooks.constructEvent.mockReturnValueOnce({ id: 'evt_1', type: 't', created: 1, data: { object: { a: 1 } } });
    expect(gw(c, { webhookSecret: 'whsec' }).verifyWebhook('{}', 'x').id).toBe('evt_1');
  });
});
