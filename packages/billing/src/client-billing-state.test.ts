import type { ClientBillingRow, ClientBillingState } from '@cs/db';
import { describe, expect, it } from 'vitest';
import { type ClientBillingSignal, nextClientBillingState, noticeAudience } from './client-billing-state';

const NOW = new Date('2026-10-15T12:00:00Z');
const row = (state: ClientBillingState, v: Partial<ClientBillingRow> = {}): ClientBillingRow => ({
  clientId: 'c', agencyId: 'a', enabled: ['invited', 'active', 'payment_needed'].includes(state), priceCents: 9900, setupFeeCents: 0, stripePriceId: 'price_1', stripeCustomerId: null,
  stripeSubscriptionId: null, billedPriceCents: null, checkoutSessionId: null, state, checkoutSentAt: null, paymentFailedSince: null, lastPaidAt: null, refundedAt: null, disputedAt: null,
  lastStripeEventAt: null, updatedAt: NOW, ...v,
});
const INVITED: ClientBillingSignal = { type: 'invited', priceCents: 9900, setupFeeCents: 0, stripePriceId: 'price_1', checkoutUrl: 'https://x', checkoutSessionId: 'cs_1' };
const PAID: ClientBillingSignal = { type: 'checkout_completed', customerId: 'cus_1', subscriptionId: 'sub_1', priceCents: 9900 };
const SUB = 'sub_1';
const raw = (r: ClientBillingRow, s: ClientBillingSignal) => nextClientBillingState(r, s, NOW);
const next = (r: ClientBillingRow, s: ClientBillingSignal) => {
  const t = raw(r, s);
  return t && 'state' in t ? t : null;
};

describe('nextClientBillingState transition table', () => {
  // [from state, signal, expected state | null (no write)]
  const TABLE: [ClientBillingState, ClientBillingSignal, ClientBillingState | null][] = [
    ['off', INVITED, 'invited'], ['cancelled', INVITED, 'invited'], ['disconnected', INVITED, 'invited'], ['invited', INVITED, 'invited'],
    ['active', INVITED, null], ['payment_needed', INVITED, null],
    ['invited', PAID, 'active'], ['payment_needed', PAID, 'active'], ['cancelled', PAID, 'active'], ['off', PAID, 'active'], ['active', PAID, 'active'], ['disconnected', PAID, null],
    ['payment_needed', { type: 'payment_succeeded', subscriptionId: SUB }, 'active'], ['active', { type: 'payment_succeeded', subscriptionId: SUB }, 'active'], ['invited', { type: 'payment_succeeded', subscriptionId: SUB }, null],
    ['active', { type: 'payment_failed', subscriptionId: SUB }, 'payment_needed'], ['payment_needed', { type: 'payment_failed', subscriptionId: SUB }, null], ['invited', { type: 'payment_failed', subscriptionId: SUB }, null],
    ['active', { type: 'subscription_cancelled', subscriptionId: SUB }, 'cancelled'], ['payment_needed', { type: 'subscription_cancelled', subscriptionId: SUB }, 'cancelled'], ['invited', { type: 'subscription_cancelled', subscriptionId: SUB }, null],
    ['cancelled', { type: 'subscription_cancelled', subscriptionId: SUB }, null], ['off', { type: 'subscription_cancelled', subscriptionId: SUB }, null], ['disconnected', { type: 'subscription_cancelled', subscriptionId: SUB }, null],
    ['invited', { type: 'disabled' }, 'off'], ['off', { type: 'disabled' }, null], ['cancelled', { type: 'disabled' }, null],
    ['active', { type: 'disconnected' }, 'disconnected'], ['invited', { type: 'disconnected' }, 'disconnected'], ['payment_needed', { type: 'disconnected' }, 'disconnected'],
    ['cancelled', { type: 'disconnected' }, 'disconnected'], ['off', { type: 'disconnected' }, null], ['disconnected', { type: 'disconnected' }, null],
  ];
  it.each(TABLE)('%s + %j -> %s', (from, signal, to) => {
    const r = next(row(from, { stripeSubscriptionId: signal.type === 'invited' || ['off', 'invited', 'disconnected'].includes(from) ? null : 'sub_1' }), signal);
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
    const f = next(row('active', { stripeSubscriptionId: SUB }), { type: 'payment_failed', subscriptionId: SUB })!;
    expect(f.patch.paymentFailedSince).toEqual(NOW);
    expect(f.notice?.kind).toBe('client-payment-failed');
    const ok = next(row('payment_needed', { paymentFailedSince: NOW, stripeSubscriptionId: SUB }), { type: 'payment_succeeded', subscriptionId: SUB })!;
    expect(ok.patch).toMatchObject({ paymentFailedSince: null, lastPaidAt: NOW });
  });

  it('payment_succeeded queues client-paid only when no payment was recorded before; notices go to the right audience', () => {
    const first = next(row('active', { stripeSubscriptionId: SUB, lastPaidAt: null }), { type: 'payment_succeeded', subscriptionId: SUB })!;
    expect(first.notice?.kind).toBe('client-paid');
    expect(next(row('active', { stripeSubscriptionId: SUB, lastPaidAt: NOW }), { type: 'payment_succeeded', subscriptionId: SUB })!.notice).toBeUndefined();
    expect(['client-paid', 'client-payment-failed', 'client-auto-paused'].map((k) => noticeAudience(k as never))).toEqual(['agency', 'agency', 'agency']);
    expect(['client-payment-link', 'client-payment-needed'].map((k) => noticeAudience(k as never))).toEqual(['client', 'client']);
  });

  it('disabled keeps state (and enabled=false) while a subscription is still running, so the webhook ends it', () => {
    const r = next(row('active', { stripeSubscriptionId: 'sub_1' }), { type: 'disabled' })!;
    expect(r.state).toBe('active');
    expect(r.patch.enabled).toBe(false);
    expect(next(row('active', { stripeSubscriptionId: 'sub_1', enabled: false }), { type: 'disabled' })).toBeNull();
  });

  it('subscription_cancelled turns billing off for good', () => {
    const r = next(row('active', { stripeSubscriptionId: 'sub_1' }), { type: 'subscription_cancelled', subscriptionId: SUB })!;
    expect(r.state).toBe('cancelled');
    expect(r.patch.enabled).toBe(false);
  });

  it('refunded and disputed only stamp their timestamp (state unchanged), once', () => {
    const r = next(row('active'), { type: 'refunded' })!;
    expect(r.state).toBe('active');
    expect(r.patch.refundedAt).toEqual(NOW);
    expect(next(row('active', { disputedAt: NOW }), { type: 'disputed' })).toBeNull();
  });

  it('invited records the Checkout session id; checkout_completed stores the billed price and clears the session', () => {
    expect(next(row('off'), INVITED)!.patch.checkoutSessionId).toBe('cs_1');
    const r = next(row('invited', { checkoutSessionId: 'cs_1', priceCents: 9900 }), { ...PAID, priceCents: 8800 })!;
    expect(r.patch).toMatchObject({ billedPriceCents: 8800, checkoutSessionId: null });
  });

  it('R11: events for a subscription other than the tracked one are ignored (flagged), never applied', () => {
    const tracked = row('active', { stripeSubscriptionId: 'sub_1' });
    const other = { subscriptionId: 'sub_other' };
    for (const s of [{ type: 'payment_failed', ...other }, { type: 'payment_succeeded', ...other }, { type: 'subscription_cancelled', ...other }, { ...PAID, ...other }] as ClientBillingSignal[]) {
      expect(raw(tracked, s)).toEqual({ ignored: 'untracked_subscription' });
    }
    // no tracked id at all: non-checkout subscription events are ignored too
    expect(raw(row('invited'), { type: 'payment_failed', subscriptionId: 'sub_x' })).toEqual({ ignored: 'untracked_subscription' });
    // the tracked subscription's own checkout event is idempotent
    expect(raw(tracked, PAID)).toMatchObject({ state: 'active' });
  });

  it('price_changed with billed also moves the billed price; without it the billed price is untouched', () => {
    const sub = row('active', { stripeSubscriptionId: SUB, billedPriceCents: 9900 });
    expect(next(sub, { type: 'price_changed', priceCents: 7000, stripePriceId: 'p' })!.patch).not.toHaveProperty('billedPriceCents');
    expect(next(sub, { type: 'price_changed', priceCents: 7000, stripePriceId: 'p', billed: true })!.patch.billedPriceCents).toBe(7000);
  });

  it('price_changed patches the stored price only', () => {
    const r = next(row('active', { stripeSubscriptionId: 'sub_1' }), { type: 'price_changed', priceCents: 7000, stripePriceId: 'price_7' })!;
    expect(r.state).toBe('active');
    expect(r.patch).toMatchObject({ priceCents: 7000, stripePriceId: 'price_7' });
  });

  it('ignores a webhook signal older than the newest applied Stripe event, and advances the watermark otherwise', () => {
    const r = row('active', { stripeSubscriptionId: SUB, lastStripeEventAt: new Date('2026-10-15T11:00:00Z') });
    expect(next(r, { type: 'payment_failed', subscriptionId: SUB, eventAt: new Date('2026-10-15T10:00:00Z') })).toBeNull();
    expect(next(r, { type: 'payment_failed', subscriptionId: SUB, eventAt: new Date('2026-10-15T11:30:00Z') })!.patch.lastStripeEventAt).toEqual(new Date('2026-10-15T11:30:00Z'));
  });
});
