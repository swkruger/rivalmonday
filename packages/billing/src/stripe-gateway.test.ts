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
      createTaxId: vi.fn(async () => ({ id: 'txi_1' })),
      listTaxIds: vi.fn(async (): Promise<{ data: Array<{ type: string; value: string }> }> => ({ data: [] })),
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
    products: { create: vi.fn().mockResolvedValueOnce({ id: 'prod_base' }).mockResolvedValueOnce({ id: 'prod_seat' }) },
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

  it('Checkout with Stripe Tax lets Checkout save the address and name on the existing customer', async () => {
    const c = mockClient();
    await gw(c, { taxEnabled: true }).createCheckoutSession(checkout);
    const p = firstArg(c.checkout.sessions.create);
    expect(p.customer_update).toEqual({ address: 'auto', name: 'auto' });
    expect(p.billing_address_collection).toBe('required');
    await gw(c).createCheckoutSession(checkout);
    const off = firstArg(c.checkout.sessions.create, 1);
    expect(off.customer_update).toBeUndefined();
    expect(off.billing_address_collection).toBeUndefined();
  });

  it('Checkout omits a trial_end less than 49 h ahead (Stripe needs 48 h)', async () => {
    const c = mockClient();
    await gw(c).createCheckoutSession({ ...checkout, trialEnd: new Date(Date.now() + 24 * 3600_000) });
    expect(firstArg(c.checkout.sessions.create).subscription_data).toBeUndefined();
    const later = new Date(Date.now() + 50 * 3600_000);
    await gw(c).createCheckoutSession({ ...checkout, trialEnd: later });
    expect(firstArg(c.checkout.sessions.create, 1).subscription_data).toEqual({ trial_end: Math.floor(later.getTime() / 1000) });
  });

  it('Checkout omits the seat line when no seat is billable', async () => {
    const c = mockClient();
    await gw(c).createCheckoutSession({ ...checkout, seatQty: 0 });
    expect(firstArg(c.checkout.sessions.create).line_items).toEqual([{ price: 'price_b', quantity: 1 }]);
  });

  it('updateSeatQuantity adds the seat line when the subscription has none', async () => {
    const c = mockClient();
    const noSeat = { id: 'sub_1', items: { data: [{ id: 'si_b', quantity: 1, price: { id: 'price_b', metadata: { [PRICE_ROLE_KEY]: 'base' } } }] } };
    c.subscriptions.retrieve.mockResolvedValueOnce(noSeat as never);
    await gw(c).updateSeatQuantity('sub_1', 2, { prorate: true, seatPriceId: 'price_s' });
    expect(c.subscriptions.update).toHaveBeenCalledWith('sub_1', { items: [{ price: 'price_s', quantity: 2 }], proration_behavior: 'create_prorations' });
  });

  it('updateSeatQuantity without a seat line: qty 0 is a no-op, no seat price is an error', async () => {
    const c = mockClient();
    const noSeat = { id: 'sub_1', items: { data: [{ id: 'si_b', quantity: 1, price: { id: 'price_b', metadata: { [PRICE_ROLE_KEY]: 'base' } } }] } };
    c.subscriptions.retrieve.mockResolvedValueOnce(noSeat as never).mockResolvedValueOnce(noSeat as never);
    await gw(c).updateSeatQuantity('sub_1', 0, { prorate: false, seatPriceId: 'price_s' });
    expect(c.subscriptions.update).not.toHaveBeenCalled();
    await expect(gw(c).updateSeatQuantity('sub_1', 1, { prorate: true })).rejects.toThrow(/seat/);
  });

  it('attachSubscriptionDiscount sets the coupon as a subscription discount', async () => {
    const c = mockClient();
    await gw(c).attachSubscriptionDiscount({ subscriptionId: 'sub_1', couponId: 'co_1' });
    expect(c.subscriptions.update).toHaveBeenCalledWith('sub_1', { discounts: [{ coupon: 'co_1' }] });
    expect(c.customers.update).not.toHaveBeenCalled();
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

  it('createPrices creates a base and a seat product once, then reuses both ids', async () => {
    const c = mockClient();
    const r = await gw(c).createPrices({ code: 'standard', version: 1, name: 'Standard', basePriceCents: 22900, seatPriceCents: 9900 });
    expect(r).toEqual({ baseProductId: 'prod_base', seatProductId: 'prod_seat', basePriceId: 'price_22900', seatPriceId: 'price_9900' });
    expect(c.products.create).toHaveBeenCalledTimes(2);
    expect(firstArg(c.prices.create, 0)).toMatchObject({ product: 'prod_base', tax_behavior: 'exclusive', metadata: { [PRICE_ROLE_KEY]: 'base' } });
    expect(firstArg(c.prices.create, 1)).toMatchObject({ product: 'prod_seat', currency: 'usd', unit_amount: 9900, recurring: { interval: 'month' }, tax_behavior: 'exclusive', metadata: { [PRICE_ROLE_KEY]: 'seat' } });
    c.products.create.mockClear();
    const r2 = await gw(c).createPrices({ code: 'standard', version: 2, name: 'Standard', basePriceCents: 1, seatPriceCents: 1, stripeProductId: 'prod_base', stripeSeatProductId: 'prod_seat' });
    expect(c.products.create).not.toHaveBeenCalled();
    expect(r2).toMatchObject({ baseProductId: 'prod_base', seatProductId: 'prod_seat' });
  });

  it('coupon appliesTo resolves to base, seat or both product lists', async () => {
    const c = mockClient();
    for (const ids of [['prod_base'], ['prod_seat'], ['prod_base', 'prod_seat']]) {
      await gw(c).createCoupon({ percentOff: 10, duration: 'once', appliesToProductIds: ids });
    }
    expect([0, 1, 2].map((n) => (firstArg(c.coupons.create, n).applies_to as { products: string[] }).products)).toEqual([['prod_base'], ['prod_seat'], ['prod_base', 'prod_seat']]);
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

  it('updateCustomer maps email, name and address to Stripe fields', async () => {
    const c = mockClient();
    await gw(c).updateCustomer('cus_1', {
      email: 'billing@acme.test', name: 'Acme LLC',
      address: { line1: '1 Main St', line2: 'Suite 2', city: 'Austin', state: 'TX', postal_code: '78701', country: 'US' },
    });
    expect(c.customers.update).toHaveBeenCalledWith('cus_1', {
      email: 'billing@acme.test', name: 'Acme LLC',
      address: { line1: '1 Main St', line2: 'Suite 2', city: 'Austin', state: 'TX', postal_code: '78701', country: 'US' },
    });
    expect(c.customers.createTaxId).not.toHaveBeenCalled();
  });

  it('updateCustomer omits absent fields and adds a US EIN tax id only when it looks like one', async () => {
    const c = mockClient();
    await gw(c).updateCustomer('cus_1', { email: 'b@x.test', taxId: '12-3456789' });
    expect(c.customers.update).toHaveBeenCalledWith('cus_1', { email: 'b@x.test' });
    expect(c.customers.createTaxId).toHaveBeenCalledWith('cus_1', { type: 'us_ein', value: '12-3456789' });
    c.customers.createTaxId.mockClear();
    await gw(c).updateCustomer('cus_1', { taxId: 'GB123456789' });
    await gw(c).updateCustomer('cus_1', { taxId: '12-345678' });
    expect(c.customers.createTaxId).not.toHaveBeenCalled();
  });

  it('updateCustomer normalises an EIN to NN-NNNNNNN before sending', async () => {
    const c = mockClient();
    await gw(c).updateCustomer('cus_1', { taxId: ' 123456789 ' });
    expect(c.customers.listTaxIds).toHaveBeenCalledWith('cus_1', { limit: 100 });
    expect(c.customers.createTaxId).toHaveBeenCalledWith('cus_1', { type: 'us_ein', value: '12-3456789' });
  });

  it('updateCustomer skips the EIN when the customer already has it (either spelling)', async () => {
    const c = mockClient();
    c.customers.listTaxIds.mockResolvedValue({ data: [{ type: 'us_ein', value: '12-3456789' }] });
    await gw(c).updateCustomer('cus_1', { taxId: '123456789' });
    c.customers.listTaxIds.mockResolvedValue({ data: [{ type: 'us_ein', value: '123456789' }] });
    await gw(c).updateCustomer('cus_1', { taxId: '12-3456789' });
    expect(c.customers.createTaxId).not.toHaveBeenCalled();
    // a different EIN, or the same digits under another type, is still added
    c.customers.listTaxIds.mockResolvedValue({ data: [{ type: 'us_ein', value: '98-7654321' }, { type: 'eu_vat', value: '12-3456789' }] });
    await gw(c).updateCustomer('cus_1', { taxId: '12-3456789' });
    expect(c.customers.createTaxId).toHaveBeenCalledTimes(1);
  });

  it('updateCustomer propagates every createTaxId error (no message-based swallow)', async () => {
    const c = mockClient();
    c.customers.createTaxId.mockRejectedValueOnce(Object.assign(new Error('Tax ID already exists'), { code: 'api_error' }));
    await expect(gw(c).updateCustomer('cus_1', { taxId: '123456789' })).rejects.toThrow('already exists');
    c.customers.createTaxId.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'api_error' }));
    await expect(gw(c).updateCustomer('cus_1', { taxId: '123456789' })).rejects.toThrow('boom');
  });
});
