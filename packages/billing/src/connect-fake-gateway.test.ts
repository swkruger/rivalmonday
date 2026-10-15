import { describe, expect, it } from 'vitest';
import { FAKE_WEBHOOK_SIGNATURE, fakeGateway } from './fake-gateway';
import { InvalidSignature } from './types';

const code = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string }) => e.code);

describe('fakeGateway Connect', () => {
  it('createAccountLink creates an account (charges disabled) and getAccount mirrors it; toggle via seed', async () => {
    const gw = fakeGateway();
    const { accountId, url } = await gw.createAccountLink({ refreshUrl: 'r', returnUrl: 'https://app/ret' });
    expect(url).toContain('https://app/ret');
    expect(await gw.getAccount({ stripeAccount: accountId })).toEqual({ id: accountId, chargesEnabled: false, detailsSubmitted: false });
    gw.seedConnectedAccount({ id: accountId, chargesEnabled: true, detailsSubmitted: true });
    expect((await gw.getAccount({ stripeAccount: accountId })).chargesEnabled).toBe(true);
    expect((await gw.createAccountLink({ accountId, refreshUrl: 'r', returnUrl: 'x' })).accountId).toBe(accountId);
    expect(gw.callsTo('createAccountLink')[0]!.args[0]).toMatchObject({ refreshUrl: 'r' });
  });

  it('a second createAccountLink does not finish onboarding by default (Stripe-like); completeOnboarding does (final wave)', async () => {
    const gw = fakeGateway();
    const { accountId } = await gw.createAccountLink({ refreshUrl: 'r', returnUrl: 'x' });
    await gw.createAccountLink({ accountId, refreshUrl: 'r', returnUrl: 'x' });
    expect(await gw.getAccount({ stripeAccount: accountId })).toEqual({ id: accountId, chargesEnabled: false, detailsSubmitted: false });
    gw.completeOnboarding(accountId);
    expect(await gw.getAccount({ stripeAccount: accountId })).toEqual({ id: accountId, chargesEnabled: true, detailsSubmitted: true });
  });

  it('opt-in completeOnboardingOnRelink: following a link for an existing account finishes onboarding (E2E wiring only)', async () => {
    const gw = fakeGateway({ completeOnboardingOnRelink: true });
    const { accountId } = await gw.createAccountLink({ refreshUrl: 'r', returnUrl: 'x' });
    expect((await gw.getAccount({ stripeAccount: accountId })).chargesEnabled).toBe(false);
    await gw.createAccountLink({ accountId, refreshUrl: 'r', returnUrl: 'x' });
    expect(await gw.getAccount({ stripeAccount: accountId })).toEqual({ id: accountId, chargesEnabled: true, detailsSubmitted: true });
  });

  it('an unknown account throws the account-level code (account_invalid); unknown subscription/price throw resource_missing', async () => {
    const gw = fakeGateway();
    expect(await code(gw.getAccount({ stripeAccount: 'acct_nope' }))).toBe('account_invalid');
    expect(await code(gw.createAccountLink({ accountId: 'acct_nope', refreshUrl: 'r', returnUrl: 'x' }))).toBe('account_invalid');
    expect(await code(gw.createConnectedProduct({ stripeAccount: 'acct_nope', name: 'n' }))).toBe('account_invalid');
    expect(await code(gw.getConnectedSubscription({ stripeAccount: 'acct_nope', subscriptionId: 'sub_nope' }))).toBe('account_invalid');
    gw.seedConnectedAccount({ id: 'acct_1' });
    expect(await code(gw.getConnectedSubscription({ stripeAccount: 'acct_1', subscriptionId: 'sub_nope' }))).toBe('resource_missing');
    expect(await code(gw.archiveConnectedPrice({ stripeAccount: 'acct_1', priceId: 'price_nope' }))).toBe('resource_missing');
    expect(await code(gw.cancelConnectedSubscriptionAtPeriodEnd({ stripeAccount: 'acct_1', subscriptionId: 'sub_nope' }))).toBe('resource_missing');
  });

  it('Checkout and subscription price updates refuse unknown, other-account and archived prices (final wave, hid I2)', async () => {
    const gw = fakeGateway();
    gw.seedConnectedAccount({ id: 'acct_1' });
    gw.seedConnectedAccount({ id: 'acct_2' });
    const args = { stripeAccount: 'acct_1', customerEmail: 'o@x.test', successUrl: 's', cancelUrl: 'c' };
    expect(await code(gw.createConnectedCheckout({ ...args, priceId: 'price_nope' }))).toBe('resource_missing');
    gw.seedConnectedPrice({ id: 'price_other', stripeAccount: 'acct_2', unitAmountCents: 100 });
    expect(await code(gw.createConnectedCheckout({ ...args, priceId: 'price_other' }))).toBe('resource_missing');
    const p = gw.seedConnectedPrice({ id: 'price_1', stripeAccount: 'acct_1', unitAmountCents: 100 });
    expect(p).toMatchObject({ productId: 'prod_fake', currency: 'usd', active: true });
    await expect(gw.createConnectedCheckout({ ...args, priceId: 'price_1' })).resolves.toMatchObject({ id: expect.any(String) });
    await gw.archiveConnectedPrice({ stripeAccount: 'acct_1', priceId: 'price_1' });
    expect(await code(gw.createConnectedCheckout({ ...args, priceId: 'price_1' }))).toBe('price_inactive');
    gw.seedConnectedSubscription({ stripeAccount: 'acct_1', id: 'sub_1', customerId: 'cus_1' });
    expect(await code(gw.updateConnectedSubscriptionPrice({ stripeAccount: 'acct_1', subscriptionId: 'sub_1', priceId: 'price_1', prorate: false }))).toBe('price_inactive');
    expect(await code(gw.updateConnectedSubscriptionPrice({ stripeAccount: 'acct_1', subscriptionId: 'sub_1', priceId: 'price_nope', prorate: false }))).toBe('resource_missing');
  });

  it('getConnectedPrice reports active and amount per account (R20)', async () => {
    const gw = fakeGateway();
    gw.seedConnectedAccount({ id: 'acct_1' });
    gw.seedConnectedPrice({ id: 'price_1', stripeAccount: 'acct_1', unitAmountCents: 4200 });
    expect(await gw.getConnectedPrice({ stripeAccount: 'acct_1', priceId: 'price_1' })).toEqual({ id: 'price_1', active: true, unitAmountCents: 4200 });
    await gw.archiveConnectedPrice({ stripeAccount: 'acct_1', priceId: 'price_1' });
    expect((await gw.getConnectedPrice({ stripeAccount: 'acct_1', priceId: 'price_1' })).active).toBe(false);
    expect(await code(gw.getConnectedPrice({ stripeAccount: 'acct_1', priceId: 'price_nope' }))).toBe('resource_missing');
  });

  it('portal configuration lives on the connected account and portal sessions record it (R25)', async () => {
    const gw = fakeGateway();
    expect(await code(gw.createConnectedPortalConfiguration({ stripeAccount: 'acct_nope' }))).toBe('account_invalid');
    gw.seedConnectedAccount({ id: 'acct_1' });
    const { id } = await gw.createConnectedPortalConfiguration({ stripeAccount: 'acct_1' });
    expect(id).toMatch(/^bpc_/);
    expect(gw.connectedPortalConfigurations.get(id)).toEqual({ id, stripeAccount: 'acct_1' });
    await gw.createConnectedPortal({ stripeAccount: 'acct_1', customerId: 'cus_1', returnUrl: 'https://r', configuration: id });
    expect(gw.callsTo('createConnectedPortal')[0]!.args[0]).toMatchObject({ configuration: id });
    expect(await code(gw.createConnectedPortal({ stripeAccount: 'acct_1', customerId: 'cus_1', returnUrl: 'https://r', configuration: 'bpc_nope' }))).toBe('resource_missing');
  });

  it('subscriptions are scoped per account', async () => {
    const gw = fakeGateway();
    gw.seedConnectedAccount({ id: 'acct_1' });
    gw.seedConnectedAccount({ id: 'acct_2' });
    gw.seedConnectedSubscription({ stripeAccount: 'acct_1', id: 'sub_1', customerId: 'cus_1', priceId: 'price_a' });
    expect((await gw.getConnectedSubscription({ stripeAccount: 'acct_1', subscriptionId: 'sub_1' })).priceId).toBe('price_a');
    expect(await code(gw.getConnectedSubscription({ stripeAccount: 'acct_2', subscriptionId: 'sub_1' }))).toBe('resource_missing');
  });

  it('product/price/update/cancel/archive flow records stripeAccount', async () => {
    const gw = fakeGateway();
    gw.seedConnectedAccount({ id: 'acct_1', chargesEnabled: true });
    const { id: prod } = await gw.createConnectedProduct({ stripeAccount: 'acct_1', name: 'Reports' });
    const { id: price } = await gw.createConnectedPrice({ stripeAccount: 'acct_1', productId: prod, unitAmountCents: 9900 });
    const { id: price2 } = await gw.createConnectedPrice({ stripeAccount: 'acct_1', productId: prod, unitAmountCents: 12900 });
    gw.seedConnectedSubscription({ stripeAccount: 'acct_1', id: 'sub_1', customerId: 'cus_1', priceId: price });
    await gw.updateConnectedSubscriptionPrice({ stripeAccount: 'acct_1', subscriptionId: 'sub_1', priceId: price2, prorate: false });
    expect((await gw.getConnectedSubscription({ stripeAccount: 'acct_1', subscriptionId: 'sub_1' })).priceId).toBe(price2);
    await gw.cancelConnectedSubscriptionAtPeriodEnd({ stripeAccount: 'acct_1', subscriptionId: 'sub_1' });
    expect((await gw.getConnectedSubscription({ stripeAccount: 'acct_1', subscriptionId: 'sub_1' })).cancelAtPeriodEnd).toBe(true);
    await gw.archiveConnectedPrice({ stripeAccount: 'acct_1', priceId: price });
    expect(gw.connectedPrices.get(price)?.active).toBe(false);
    expect(gw.callsTo('archiveConnectedPrice')[0]!.args[0]).toMatchObject({ stripeAccount: 'acct_1', priceId: price });
  });

  it('checkout seeds an active connected subscription and records fee/setup args; portal returns url', async () => {
    const gw = fakeGateway();
    gw.seedConnectedAccount({ id: 'acct_1', chargesEnabled: true });
    const { id: price } = await gw.createConnectedPrice({ stripeAccount: 'acct_1', productId: 'prod_x', unitAmountCents: 100 });
    const { url } = await gw.createConnectedCheckout({ stripeAccount: 'acct_1', priceId: price, customerEmail: 'o@x.test', setupFeeCents: 500, applicationFeePercent: 1, successUrl: 'https://s', cancelUrl: 'c' });
    expect(url).toContain('fake_connect_checkout=');
    const subId = new URL(url).searchParams.get('fake_connect_checkout')!;
    expect(gw.connectedSubscriptions.get(subId)).toMatchObject({ stripeAccount: 'acct_1', priceId: price, status: 'active' });
    expect(gw.callsTo('createConnectedCheckout')[0]!.args[0]).toMatchObject({ stripeAccount: 'acct_1', setupFeeCents: 500, applicationFeePercent: 1 });
    expect((await gw.createConnectedPortal({ stripeAccount: 'acct_1', customerId: 'cus_1', returnUrl: 'https://r' })).url).toContain('fake_portal=1');
  });

  it('checkout returns a session id; expire marks it expired, repeats are no-ops, completed or unknown sessions reject', async () => {
    const gw = fakeGateway();
    gw.seedConnectedAccount({ id: 'acct_1', chargesEnabled: true });
    gw.seedConnectedPrice({ id: 'p', stripeAccount: 'acct_1', unitAmountCents: 100 });
    const a = await gw.createConnectedCheckout({ stripeAccount: 'acct_1', priceId: 'p', customerEmail: 'o@x.test', successUrl: 's', cancelUrl: 'c' });
    const b = await gw.createConnectedCheckout({ stripeAccount: 'acct_1', priceId: 'p', customerEmail: 'o@x.test', successUrl: 's', cancelUrl: 'c' });
    expect(a.id).toMatch(/^cs_/);
    expect(a.id).not.toBe(b.id);
    expect(gw.connectedCheckouts.get(a.id)?.status).toBe('open');
    await gw.expireConnectedCheckout({ stripeAccount: 'acct_1', sessionId: a.id });
    await gw.expireConnectedCheckout({ stripeAccount: 'acct_1', sessionId: a.id });
    expect(gw.connectedCheckouts.get(a.id)?.status).toBe('expired');
    expect(gw.connectedCheckouts.get(b.id)?.status).toBe('open');
    gw.connectedCheckouts.get(b.id)!.status = 'complete';
    await expect(gw.expireConnectedCheckout({ stripeAccount: 'acct_1', sessionId: b.id })).rejects.toThrow();
    await expect(gw.expireConnectedCheckout({ stripeAccount: 'acct_1', sessionId: 'cs_nope' })).rejects.toMatchObject({ code: 'resource_missing' });
  });

  it('failNext hits the next Connect call once', async () => {
    const gw = fakeGateway();
    gw.seedConnectedAccount({ id: 'acct_1' });
    gw.failNext(new Error('boom'));
    await expect(gw.getAccount({ stripeAccount: 'acct_1' })).rejects.toThrow('boom');
    await expect(gw.getAccount({ stripeAccount: 'acct_1' })).resolves.toMatchObject({ id: 'acct_1' });
  });

  it('getConnectedCheckout reports the session status (open / expired / complete) per account; charges are seedable', async () => {
    const gw = fakeGateway();
    gw.seedConnectedAccount({ id: 'acct_1' });
    gw.seedConnectedAccount({ id: 'acct_2' });
    gw.seedConnectedPrice({ id: 'p', stripeAccount: 'acct_1', unitAmountCents: 100 });
    const { id } = await gw.createConnectedCheckout({ stripeAccount: 'acct_1', priceId: 'p', customerEmail: 'a@b.c', clientReferenceId: 'cl_1', successUrl: 's', cancelUrl: 'c' });
    expect(await gw.getConnectedCheckout({ stripeAccount: 'acct_1', sessionId: id })).toEqual({ id, status: 'open' });
    expect(gw.connectedCheckouts.get(id)?.clientReferenceId).toBe('cl_1');
    gw.connectedCheckouts.get(id)!.status = 'complete';
    expect((await gw.getConnectedCheckout({ stripeAccount: 'acct_1', sessionId: id })).status).toBe('complete');
    expect(await code(gw.expireConnectedCheckout({ stripeAccount: 'acct_1', sessionId: id }))).toBe('resource_invalid_request_error');
    expect(await code(gw.getConnectedCheckout({ stripeAccount: 'acct_2', sessionId: id }))).toBe('resource_missing');
    gw.seedConnectedCharge({ id: 'ch_1', stripeAccount: 'acct_1', customerId: 'cus_1' });
    expect(await gw.getConnectedCharge({ stripeAccount: 'acct_1', chargeId: 'ch_1' })).toEqual({ id: 'ch_1', customerId: 'cus_1' });
    expect(await code(gw.getConnectedCharge({ stripeAccount: 'acct_2', chargeId: 'ch_1' }))).toBe('resource_missing');
  });

  it('getConnectedSubscription reports the billed amount: seeded, else the connected price amount, else null', async () => {
    const gw = fakeGateway();
    gw.seedConnectedAccount({ id: 'acct_1' });
    const prod = await gw.createConnectedProduct({ stripeAccount: 'acct_1', name: 'n' });
    const price = await gw.createConnectedPrice({ stripeAccount: 'acct_1', productId: prod.id, unitAmountCents: 12300 });
    gw.seedConnectedSubscription({ id: 's1', stripeAccount: 'acct_1', customerId: 'c', priceId: price.id });
    gw.seedConnectedSubscription({ id: 's2', stripeAccount: 'acct_1', customerId: 'c', unitAmountCents: 500 });
    gw.seedConnectedSubscription({ id: 's3', stripeAccount: 'acct_1', customerId: 'c' });
    expect((await gw.getConnectedSubscription({ stripeAccount: 'acct_1', subscriptionId: 's1' })).unitAmountCents).toBe(12300);
    expect((await gw.getConnectedSubscription({ stripeAccount: 'acct_1', subscriptionId: 's2' })).unitAmountCents).toBe(500);
    expect((await gw.getConnectedSubscription({ stripeAccount: 'acct_1', subscriptionId: 's3' })).unitAmountCents).toBeNull();
  });

  it('verifyConnectWebhook accepts only fake-sig', () => {
    const gw = fakeGateway();
    const body = JSON.stringify({ id: 'evt_1', type: 'account.updated', created: 1, account: 'acct_1', data: { object: {} } });
    expect(gw.verifyConnectWebhook(body, FAKE_WEBHOOK_SIGNATURE).account).toBe('acct_1');
    expect(() => gw.verifyConnectWebhook(body, 'nope')).toThrow(InvalidSignature);
  });
});
