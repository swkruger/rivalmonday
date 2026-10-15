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

  it('unknown account/subscription/price throw resource_missing', async () => {
    const gw = fakeGateway();
    expect(await code(gw.getAccount({ stripeAccount: 'acct_nope' }))).toBe('resource_missing');
    expect(await code(gw.createAccountLink({ accountId: 'acct_nope', refreshUrl: 'r', returnUrl: 'x' }))).toBe('resource_missing');
    expect(await code(gw.createConnectedProduct({ stripeAccount: 'acct_nope', name: 'n' }))).toBe('resource_missing');
    gw.seedConnectedAccount({ id: 'acct_1' });
    expect(await code(gw.getConnectedSubscription({ stripeAccount: 'acct_1', subscriptionId: 'sub_nope' }))).toBe('resource_missing');
    expect(await code(gw.archiveConnectedPrice({ stripeAccount: 'acct_1', priceId: 'price_nope' }))).toBe('resource_missing');
    expect(await code(gw.cancelConnectedSubscriptionAtPeriodEnd({ stripeAccount: 'acct_1', subscriptionId: 'sub_nope' }))).toBe('resource_missing');
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

  it('failNext hits the next Connect call once', async () => {
    const gw = fakeGateway();
    gw.seedConnectedAccount({ id: 'acct_1' });
    gw.failNext(new Error('boom'));
    await expect(gw.getAccount({ stripeAccount: 'acct_1' })).rejects.toThrow('boom');
    await expect(gw.getAccount({ stripeAccount: 'acct_1' })).resolves.toMatchObject({ id: 'acct_1' });
  });

  it('verifyConnectWebhook accepts only fake-sig', () => {
    const gw = fakeGateway();
    const body = JSON.stringify({ id: 'evt_1', type: 'account.updated', created: 1, account: 'acct_1', data: { object: {} } });
    expect(gw.verifyConnectWebhook(body, FAKE_WEBHOOK_SIGNATURE).account).toBe('acct_1');
    expect(() => gw.verifyConnectWebhook(body, 'nope')).toThrow(InvalidSignature);
  });
});
