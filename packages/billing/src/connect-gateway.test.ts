import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import { stripeGateway } from './stripe-gateway';
import { InvalidSignature } from './types';
import { gatewayFor } from './gateway';

const ACCT = 'acct_1';
function mockClient() {
  return {
    accounts: {
      create: vi.fn(async () => ({ id: 'acct_new' })),
      retrieve: vi.fn(async () => ({ id: ACCT, charges_enabled: true, details_submitted: false })),
    },
    accountLinks: { create: vi.fn(async () => ({ url: 'https://connect/onboard' })) },
    products: { create: vi.fn(async () => ({ id: 'prod_c' })) },
    prices: {
      create: vi.fn(async () => ({ id: 'price_c' })),
      retrieve: vi.fn(async () => ({ id: 'price_c', currency: 'cad' })),
      update: vi.fn(async () => ({})),
    },
    checkout: {
      sessions: {
        create: vi.fn(async () => ({ id: 'cs_c', url: 'https://checkout/c' })),
        expire: vi.fn(async () => ({})),
        retrieve: vi.fn(async () => ({ id: 'cs_c', status: 'complete' })),
      },
    },
    charges: { retrieve: vi.fn(async () => ({ id: 'ch_c', customer: 'cus_c' })) },
    billingPortal: {
      sessions: { create: vi.fn(async () => ({ url: 'https://portal/c' })) },
      configurations: { create: vi.fn(async () => ({ id: 'bpc_c' })) },
    },
    subscriptions: {
      retrieve: vi.fn(async () => ({
        id: 'sub_c', status: 'active', customer: 'cus_c', cancel_at_period_end: false,
        items: { data: [{ id: 'si_c', current_period_end: 1_800_100_000, price: { id: 'price_old', unit_amount: 9900 } }] },
      })),
      update: vi.fn(async () => ({})),
    },
    webhooks: { constructEvent: vi.fn() },
  };
}
type Mock = ReturnType<typeof mockClient>;
const gw = (c: Mock, o: { connectWebhookSecret?: string; webhookSecret?: string } = {}) =>
  stripeGateway('sk_test', { client: c as unknown as Stripe, ...o });
const at = (fn: { mock: { calls: unknown[][] } }, n: number, i: number) => (fn.mock.calls[n] as unknown[])[i];
const arg = (fn: { mock: { calls: unknown[][] } }, i = 0, n = 0) => fn.mock.calls[n]![i] as Record<string, unknown>;
const checkout = { stripeAccount: ACCT, priceId: 'price_c', customerEmail: 'o@x.test', successUrl: 's', cancelUrl: 'c' };

describe('stripeGateway Connect', () => {
  it('createAccountLink without accountId creates a standard account on the platform, then an onboarding link', async () => {
    const c = mockClient();
    const r = await gw(c).createAccountLink({ refreshUrl: 'r', returnUrl: 'ret' });
    expect(r).toEqual({ url: 'https://connect/onboard', accountId: 'acct_new' });
    expect(arg(c.accounts.create)).toMatchObject({ type: 'standard' });
    expect(c.accounts.create.mock.calls[0]).toHaveLength(1); // no stripeAccount option: platform-level
    expect(arg(c.accountLinks.create)).toEqual({ account: 'acct_new', refresh_url: 'r', return_url: 'ret', type: 'account_onboarding' });
  });

  it('createAccountLink with accountId reuses it', async () => {
    const c = mockClient();
    const r = await gw(c).createAccountLink({ accountId: ACCT, refreshUrl: 'r', returnUrl: 'ret' });
    expect(r.accountId).toBe(ACCT);
    expect(c.accounts.create).not.toHaveBeenCalled();
    expect(arg(c.accountLinks.create).account).toBe(ACCT);
  });

  it('getAccount maps flags', async () => {
    const c = mockClient();
    expect(await gw(c).getAccount({ stripeAccount: ACCT })).toEqual({ id: ACCT, chargesEnabled: true, detailsSubmitted: false });
    expect(c.accounts.retrieve).toHaveBeenCalledWith(ACCT);
  });

  it('product, price create and archive pass the stripeAccount option', async () => {
    const c = mockClient();
    const g = gw(c);
    expect(await g.createConnectedProduct({ stripeAccount: ACCT, name: 'Reports' })).toEqual({ id: 'prod_c' });
    expect(at(c.products.create, 0, 1)).toEqual({ stripeAccount: ACCT });
    expect(await g.createConnectedPrice({ stripeAccount: ACCT, productId: 'prod_c', unitAmountCents: 9900 })).toEqual({ id: 'price_c' });
    expect(arg(c.prices.create)).toMatchObject({ product: 'prod_c', unit_amount: 9900, currency: 'usd', recurring: { interval: 'month' } });
    expect(at(c.prices.create, 0, 1)).toEqual({ stripeAccount: ACCT });
    await g.archiveConnectedPrice({ stripeAccount: ACCT, priceId: 'price_c' });
    expect(c.prices.update).toHaveBeenCalledWith('price_c', { active: false }, { stripeAccount: ACCT });
  });

  it('Checkout: subscription mode, fee omitted at 0, no setup line, 24 h expiry, account option', async () => {
    const c = mockClient();
    const before = Math.floor(Date.now() / 1000);
    expect(await gw(c).createConnectedCheckout({ ...checkout, applicationFeePercent: 0, setupFeeCents: 0 })).toEqual({ url: 'https://checkout/c', id: 'cs_c' });
    const p = arg(c.checkout.sessions.create);
    expect(p).toMatchObject({ mode: 'subscription', customer_email: 'o@x.test', success_url: 's', cancel_url: 'c' });
    expect(p.line_items).toEqual([{ price: 'price_c', quantity: 1 }]);
    expect(p.subscription_data).toBeUndefined();
    expect(p.expires_at as number).toBeGreaterThanOrEqual(before + 86_400 - 300);
    expect(p.expires_at as number).toBeLessThanOrEqual(before + 86_400 - 300 + 5);
    expect(at(c.checkout.sessions.create, 0, 1)).toEqual({ stripeAccount: ACCT });
    expect(c.prices.retrieve).not.toHaveBeenCalled();
  });

  it('Checkout carries the client reference id when given', async () => {
    const c = mockClient();
    await gw(c).createConnectedCheckout({ ...checkout, clientReferenceId: 'client-1' });
    expect(arg(c.checkout.sessions.create)).toMatchObject({ client_reference_id: 'client-1' });
    await gw(c).createConnectedCheckout(checkout);
    expect(arg(c.checkout.sessions.create, 0, 1)).not.toHaveProperty('client_reference_id');
  });

  it('getConnectedCheckout maps the session status; getConnectedCharge reads the customer, both on the account', async () => {
    const c = mockClient();
    const g = gw(c);
    expect(await g.getConnectedCheckout({ stripeAccount: ACCT, sessionId: 'cs_c' })).toEqual({ id: 'cs_c', status: 'complete' });
    expect(c.checkout.sessions.retrieve).toHaveBeenCalledWith('cs_c', {}, { stripeAccount: ACCT });
    c.checkout.sessions.retrieve.mockResolvedValueOnce({ id: 'cs_c', status: 'open' });
    expect((await g.getConnectedCheckout({ stripeAccount: ACCT, sessionId: 'cs_c' })).status).toBe('open');
    expect(await g.getConnectedCharge({ stripeAccount: ACCT, chargeId: 'ch_c' })).toEqual({ id: 'ch_c', customerId: 'cus_c' });
    expect(c.charges.retrieve).toHaveBeenCalledWith('ch_c', {}, { stripeAccount: ACCT });
  });

  it('expireConnectedCheckout expires the session on the connected account', async () => {
    const c = mockClient();
    await gw(c).expireConnectedCheckout({ stripeAccount: ACCT, sessionId: 'cs_c' });
    expect(c.checkout.sessions.expire).toHaveBeenCalledWith('cs_c', {}, { stripeAccount: ACCT });
  });

  it('Checkout: fee attached > 0, setup fee as one-time price_data in the price currency', async () => {
    const c = mockClient();
    await gw(c).createConnectedCheckout({ ...checkout, applicationFeePercent: 2.5, setupFeeCents: 15000 });
    const p = arg(c.checkout.sessions.create);
    expect(p.subscription_data).toEqual({ application_fee_percent: 2.5 });
    expect(p.line_items).toEqual([
      { price: 'price_c', quantity: 1 },
      { quantity: 1, price_data: { currency: 'cad', unit_amount: 15000, product_data: { name: 'Setup fee' } } },
    ]);
    expect(c.prices.retrieve).toHaveBeenCalledWith('price_c', {}, { stripeAccount: ACCT });
  });

  it('portal, get/update/cancel subscription use the account option', async () => {
    const c = mockClient();
    const g = gw(c);
    expect(await g.createConnectedPortal({ stripeAccount: ACCT, customerId: 'cus_c', returnUrl: 'r' })).toEqual({ url: 'https://portal/c' });
    expect(c.billingPortal.sessions.create).toHaveBeenCalledWith({ customer: 'cus_c', return_url: 'r' }, { stripeAccount: ACCT });
    expect(await g.getConnectedSubscription({ stripeAccount: ACCT, subscriptionId: 'sub_c' })).toEqual({
      id: 'sub_c', status: 'active', customerId: 'cus_c', priceId: 'price_old', unitAmountCents: 9900, currentPeriodEnd: new Date(1_800_100_000_000), cancelAtPeriodEnd: false,
    });
    expect(at(c.subscriptions.retrieve, 0, 2)).toEqual({ stripeAccount: ACCT });
    await g.updateConnectedSubscriptionPrice({ stripeAccount: ACCT, subscriptionId: 'sub_c', priceId: 'price_new', prorate: false });
    expect(c.subscriptions.update).toHaveBeenCalledWith('sub_c', { items: [{ id: 'si_c', price: 'price_new' }], proration_behavior: 'none' }, { stripeAccount: ACCT });
    await g.cancelConnectedSubscriptionAtPeriodEnd({ stripeAccount: ACCT, subscriptionId: 'sub_c' });
    expect(c.subscriptions.update).toHaveBeenLastCalledWith('sub_c', { cancel_at_period_end: true }, { stripeAccount: ACCT });
  });

  it('R20: getConnectedPrice reads active and amount on the connected account', async () => {
    const c = mockClient();
    c.prices.retrieve.mockResolvedValueOnce({ id: 'price_c', currency: 'usd', active: false, unit_amount: 4200 } as never);
    expect(await gw(c).getConnectedPrice({ stripeAccount: ACCT, priceId: 'price_c' })).toEqual({ id: 'price_c', active: false, unitAmountCents: 4200 });
    expect(c.prices.retrieve).toHaveBeenCalledWith('price_c', {}, { stripeAccount: ACCT });
  });

  it('R25: the portal configuration is created on the connected account (payment method + invoices, no cancel) and passed to sessions', async () => {
    const c = mockClient();
    const g = gw(c);
    expect(await g.createConnectedPortalConfiguration({ stripeAccount: ACCT })).toEqual({ id: 'bpc_c' });
    expect(c.billingPortal.configurations.create).toHaveBeenCalledWith(
      { features: { payment_method_update: { enabled: true }, invoice_history: { enabled: true }, subscription_cancel: { enabled: false } } },
      { stripeAccount: ACCT },
    );
    await g.createConnectedPortal({ stripeAccount: ACCT, customerId: 'cus_c', returnUrl: 'r', configuration: 'bpc_c' });
    expect(c.billingPortal.sessions.create).toHaveBeenLastCalledWith({ customer: 'cus_c', return_url: 'r', configuration: 'bpc_c' }, { stripeAccount: ACCT });
  });

  it('verifyConnectWebhook uses the Connect secret and carries account', () => {
    const c = mockClient();
    c.webhooks.constructEvent.mockReturnValue({ id: 'evt_1', type: 'account.updated', created: 5, account: ACCT, data: { object: { id: ACCT } } });
    const e = gw(c, { connectWebhookSecret: 'whsec_connect', webhookSecret: 'whsec_platform' }).verifyConnectWebhook('{}', 'sig');
    expect(c.webhooks.constructEvent).toHaveBeenCalledWith('{}', 'sig', 'whsec_connect');
    expect(e).toEqual({ id: 'evt_1', type: 'account.updated', created: 5, account: ACCT, data: { object: { id: ACCT } } });
  });

  it('verifyConnectWebhook: bad signature -> InvalidSignature; missing secret -> plain error', () => {
    const c = mockClient();
    c.webhooks.constructEvent.mockImplementation(() => { throw new Error('bad'); });
    expect(() => gw(c, { connectWebhookSecret: 's' }).verifyConnectWebhook('{}', 'x')).toThrow(InvalidSignature);
    expect(() => gw(c).verifyConnectWebhook('{}', 'x')).toThrow('STRIPE_CONNECT_WEBHOOK_SECRET is not configured');
  });

  it('gatewayFor wires STRIPE_CONNECT_WEBHOOK_SECRET into the real gateway', () => {
    const g = gatewayFor({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_c' }, 'dev')!;
    expect(() => g.verifyConnectWebhook('{}', 'bad')).toThrow(InvalidSignature); // secret present -> signature check, not "not configured"
  });
});
