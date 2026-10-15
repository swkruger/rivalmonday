import type { ClientBillingRow, ClientBillingState } from '@cs/db';
import { describe, expect, it } from 'vitest';
import { type ClientBillingSignal, nextClientBillingState } from './client-billing-state';

const NOW = new Date('2026-10-15T12:00:00Z');
const row = (state: ClientBillingState, v: Partial<ClientBillingRow> = {}): ClientBillingRow => ({
  clientId: 'c', agencyId: 'a', enabled: ['invited', 'active', 'payment_needed'].includes(state), priceCents: 9900, setupFeeCents: 0, stripePriceId: 'price_1', stripeCustomerId: null,
  stripeSubscriptionId: null, state, checkoutSentAt: null, paymentFailedSince: null, lastPaidAt: null, refundedAt: null, disputedAt: null,
  lastStripeEventAt: null, updatedAt: NOW, ...v,
});
const INVITED: ClientBillingSignal = { type: 'invited', priceCents: 9900, setupFeeCents: 0, stripePriceId: 'price_1', checkoutUrl: 'https://x' };
const PAID: ClientBillingSignal = { type: 'checkout_completed', customerId: 'cus_1', subscriptionId: 'sub_1' };
const next = (r: ClientBillingRow, s: ClientBillingSignal) => nextClientBillingState(r, s, NOW);

describe('nextClientBillingState transition table', () => {
  // [from state, signal, expected state | null (no write)]
  const TABLE: [ClientBillingState, ClientBillingSignal, ClientBillingState | null][] = [
    ['off', INVITED, 'invited'], ['cancelled', INVITED, 'invited'], ['disconnected', INVITED, 'invited'], ['invited', INVITED, 'invited'],
    ['active', INVITED, null], ['payment_needed', INVITED, null],
    ['invited', PAID, 'active'], ['payment_needed', PAID, 'active'], ['cancelled', PAID, 'active'], ['off', PAID, 'active'], ['active', PAID, 'active'], ['disconnected', PAID, null],
    ['payment_needed', { type: 'payment_succeeded' }, 'active'], ['active', { type: 'payment_succeeded' }, 'active'], ['invited', { type: 'payment_succeeded' }, null],
    ['active', { type: 'payment_failed' }, 'payment_needed'], ['payment_needed', { type: 'payment_failed' }, null], ['invited', { type: 'payment_failed' }, null],
    ['active', { type: 'subscription_cancelled' }, 'cancelled'], ['payment_needed', { type: 'subscription_cancelled' }, 'cancelled'], ['invited', { type: 'subscription_cancelled' }, 'cancelled'],
    ['cancelled', { type: 'subscription_cancelled' }, null], ['off', { type: 'subscription_cancelled' }, null], ['disconnected', { type: 'subscription_cancelled' }, null],
    ['invited', { type: 'disabled' }, 'off'], ['off', { type: 'disabled' }, null], ['cancelled', { type: 'disabled' }, null],
    ['active', { type: 'disconnected' }, 'disconnected'], ['invited', { type: 'disconnected' }, 'disconnected'], ['payment_needed', { type: 'disconnected' }, 'disconnected'],
    ['cancelled', { type: 'disconnected' }, 'disconnected'], ['off', { type: 'disconnected' }, null], ['disconnected', { type: 'disconnected' }, null],
  ];
  it.each(TABLE)('%s + %j -> %s', (from, signal, to) => {
    const r = next(row(from, { stripeSubscriptionId: signal.type === 'subscription_cancelled' ? 'sub_1' : null }), signal);
    expect(r?.state ?? null).toBe(to);
  });

  it('invited: enables, stores the price snapshot, stamps checkout_sent_at and queues the payment link notice', () => {
    const r = next(row('off', { paymentFailedSince: NOW }), { ...INVITED, priceCents: 5000, setupFeeCents: 100, stripePriceId: 'price_9' })!;
    expect(r.patch).toMatchObject({ enabled: true, priceCents: 5000, setupFeeCents: 100, stripePriceId: 'price_9', checkoutSentAt: NOW, paymentFailedSince: null });
    expect(r.notice).toEqual({ kind: 'client-payment-link', params: { checkoutUrl: 'https://x', issuedAt: NOW.toISOString() } });
  });

  it('checkout_completed: records ids, clears failure, queues client-paid only on the first activation', () => {
    const first = next(row('invited'), PAID)!;
    expect(first.patch).toMatchObject({ enabled: true, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', lastPaidAt: NOW, paymentFailedSince: null });
    expect(first.notice?.kind).toBe('client-paid');
    expect(next(row('active', { stripeSubscriptionId: 'sub_1' }), PAID)!.notice).toBeUndefined();
  });

  it('payment_failed stamps payment_failed_since and queues the failure notice; payment_succeeded clears it', () => {
    const f = next(row('active'), { type: 'payment_failed' })!;
    expect(f.patch.paymentFailedSince).toEqual(NOW);
    expect(f.notice?.kind).toBe('client-payment-failed');
    const ok = next(row('payment_needed', { paymentFailedSince: NOW }), { type: 'payment_succeeded' })!;
    expect(ok.patch).toMatchObject({ paymentFailedSince: null, lastPaidAt: NOW });
  });

  it('disabled keeps state (and enabled=false) while a subscription is still running, so the webhook ends it', () => {
    const r = next(row('active', { stripeSubscriptionId: 'sub_1' }), { type: 'disabled' })!;
    expect(r.state).toBe('active');
    expect(r.patch.enabled).toBe(false);
    expect(next(row('active', { stripeSubscriptionId: 'sub_1', enabled: false }), { type: 'disabled' })).toBeNull();
  });

  it('subscription_cancelled turns billing off for good', () => {
    const r = next(row('active', { stripeSubscriptionId: 'sub_1' }), { type: 'subscription_cancelled' })!;
    expect(r.state).toBe('cancelled');
    expect(r.patch.enabled).toBe(false);
  });

  it('refunded and disputed only stamp their timestamp (state unchanged), once', () => {
    const r = next(row('active'), { type: 'refunded' })!;
    expect(r.state).toBe('active');
    expect(r.patch.refundedAt).toEqual(NOW);
    expect(next(row('active', { disputedAt: NOW }), { type: 'disputed' })).toBeNull();
  });

  it('price_changed patches the stored price only', () => {
    const r = next(row('active', { stripeSubscriptionId: 'sub_1' }), { type: 'price_changed', priceCents: 7000, stripePriceId: 'price_7' })!;
    expect(r.state).toBe('active');
    expect(r.patch).toMatchObject({ priceCents: 7000, stripePriceId: 'price_7' });
  });

  it('ignores a webhook signal older than the newest applied Stripe event, and advances the watermark otherwise', () => {
    const r = row('active', { lastStripeEventAt: new Date('2026-10-15T11:00:00Z') });
    expect(next(r, { type: 'payment_failed', eventAt: new Date('2026-10-15T10:00:00Z') })).toBeNull();
    expect(next(r, { type: 'payment_failed', eventAt: new Date('2026-10-15T11:30:00Z') })!.patch.lastStripeEventAt).toEqual(new Date('2026-10-15T11:30:00Z'));
  });
});
