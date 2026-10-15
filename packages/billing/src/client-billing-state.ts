import type { ClientBillingRow, ClientBillingState } from '@cs/db';

/**
 * Phase 9b Q2: every change to `client_billing` is a typed signal. Tasks 5-7 produce them (tools, webhook, daily job);
 * this file is the pure transition table, `applyClientBillingSignal` (connect-apply.ts) persists it.
 * `eventAt` is the Stripe event time of webhook-originated signals (the out-of-order guard, R1); tool signals omit it.
 */
export type ClientBillingSignal = (
  | { type: 'invited'; priceCents: number; setupFeeCents: number; stripePriceId: string; checkoutUrl: string; checkoutSessionId: string }
  /** `priceCents` = what the new subscription actually charges per month (Task 6 reads it from Stripe). */
  | { type: 'checkout_completed'; customerId: string; subscriptionId: string; priceCents: number; /** The completed Checkout session (R13c: a different tracked one is superseded). */ sessionId?: string }
  | { type: 'payment_succeeded'; subscriptionId: string }
  | { type: 'payment_failed'; subscriptionId: string }
  | { type: 'subscription_cancelled'; subscriptionId: string }
  | { type: 'disabled' }
  | { type: 'refunded' }
  | { type: 'disputed' }
  /** `billed`: the live subscription was moved to this price too (next_bill); otherwise only the price of the next Checkout changes. */
  | { type: 'price_changed'; priceCents: number; stripePriceId: string; billed?: boolean }
  | { type: 'disconnected' }
) & { eventAt?: Date };

export type ClientBillingNoticeKind = 'client-payment-link' | 'client-payment-needed' | 'client-payment-failed' | 'client-paid' | 'client-auto-paused';

export interface ClientBillingTransition {
  state: ClientBillingState;
  patch: Partial<ClientBillingRow>;
  /** Outbox row to queue in the same transaction (audience follows the kind, see `noticeAudience`). */
  notice?: { kind: ClientBillingNoticeKind; params: Record<string, unknown> };
}

/** Who reads a notice: the client owner (agency-branded) or the agency admins (Rival Monday-branded). */
export const noticeAudience = (kind: ClientBillingNoticeKind): 'agency' | 'client' =>
  kind === 'client-paid' || kind === 'client-payment-failed' || kind === 'client-auto-paused' ? 'agency' : 'client';

const SUBSCRIBED: readonly ClientBillingState[] = ['active', 'payment_needed'];

/** R11: a subscription event for a subscription this client is not tracked with (the caller logs it). */
export interface ClientBillingIgnored { ignored: 'untracked_subscription' }

/** `null` = nothing to write (signal does not apply to this state, already applied, or stale). */
export function nextClientBillingState(row: ClientBillingRow, s: ClientBillingSignal, now: Date): ClientBillingTransition | ClientBillingIgnored | null {
  if (s.eventAt && row.lastStripeEventAt && s.eventAt < row.lastStripeEventAt) return null;
  const stamp = s.eventAt && (!row.lastStripeEventAt || s.eventAt > row.lastStripeEventAt) ? { lastStripeEventAt: s.eventAt } : {};
  const out = (state: ClientBillingState, patch: Partial<ClientBillingRow> = {}, notice?: ClientBillingTransition['notice']): ClientBillingTransition => ({
    state, patch: { ...patch, ...stamp }, ...(notice && { notice }),
  });
  const st = row.state;
  // R11: a tracked live subscription only answers to its own id; non-checkout subscription events need a tracked id.
  if ((s.type === 'payment_succeeded' || s.type === 'payment_failed' || s.type === 'subscription_cancelled') && row.stripeSubscriptionId !== s.subscriptionId) return { ignored: 'untracked_subscription' };
  if (s.type === 'checkout_completed' && SUBSCRIBED.includes(st) && row.stripeSubscriptionId && row.stripeSubscriptionId !== s.subscriptionId) return { ignored: 'untracked_subscription' };
  switch (s.type) {
    case 'invited':
      // A running subscription is managed through set_client_price / disable, never re-invited.
      if (SUBSCRIBED.includes(st)) return null;
      return out('invited', { enabled: true, priceCents: s.priceCents, setupFeeCents: s.setupFeeCents, stripePriceId: s.stripePriceId, checkoutSentAt: now, paymentFailedSince: null, checkoutSessionId: s.checkoutSessionId },
        { kind: 'client-payment-link', params: { checkoutUrl: s.checkoutUrl, issuedAt: now.toISOString() } });
    case 'checkout_completed':
      // Whoever pays is tracked, even after a disable: they now hold a subscription. A disconnected agency gets no webhooks.
      if (st === 'disconnected') return null;
      return out('active', { enabled: true, stripeCustomerId: s.customerId, stripeSubscriptionId: s.subscriptionId, billedPriceCents: s.priceCents, checkoutSessionId: null, lastPaidAt: now, paymentFailedSince: null },
        st === 'active' ? undefined : { kind: 'client-paid', params: {} });
    case 'payment_succeeded':
      if (!SUBSCRIBED.includes(st)) return null;
      // A payment seen before any recorded one is the client's first (agency is told once).
      return out('active', { lastPaidAt: now, paymentFailedSince: null }, row.lastPaidAt ? undefined : { kind: 'client-paid', params: {} });
    case 'payment_failed':
      if (st !== 'active') return null;
      return out('payment_needed', { paymentFailedSince: now }, { kind: 'client-payment-failed', params: {} });
    case 'subscription_cancelled':
      if (st !== 'active' && st !== 'payment_needed') return null;
      return out('cancelled', { enabled: false, paymentFailedSince: null });
    case 'disabled': {
      // A live subscription keeps its state until Stripe confirms the cancellation at period end; otherwise billing is simply off.
      const next: ClientBillingState = SUBSCRIBED.includes(st) && row.stripeSubscriptionId ? st : st === 'cancelled' || st === 'disconnected' ? st : 'off';
      if (next === st && !row.enabled) return null;
      return out(next, { enabled: false, ...(next === 'off' && { checkoutSessionId: null }) });
    }
    case 'refunded':
      return row.refundedAt ? null : out(st, { refundedAt: now });
    case 'disputed':
      return row.disputedAt ? null : out(st, { disputedAt: now });
    case 'price_changed':
      return out(st, { priceCents: s.priceCents, stripePriceId: s.stripePriceId, ...(s.billed && { billedPriceCents: s.priceCents }) });
    case 'disconnected':
      if (st === 'off' || st === 'disconnected') return null;
      return out('disconnected');
  }
}
