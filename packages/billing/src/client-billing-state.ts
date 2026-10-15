import type { ClientBillingRow, ClientBillingState } from '@cs/db';

/**
 * Phase 9b Q2: every change to `client_billing` is a typed signal. Tasks 5-7 produce them (tools, webhook, daily job);
 * this file is the pure transition table, `applyClientBillingSignal` (connect-apply.ts) persists it.
 * `eventAt` is the Stripe event time of webhook-originated signals (the out-of-order guard, R1); tool signals omit it.
 */
export type ClientBillingSignal = (
  | { type: 'invited'; priceCents: number; setupFeeCents: number; stripePriceId: string; checkoutUrl: string }
  | { type: 'checkout_completed'; customerId: string; subscriptionId: string }
  | { type: 'payment_succeeded' }
  | { type: 'payment_failed' }
  | { type: 'subscription_cancelled' }
  | { type: 'disabled' }
  | { type: 'refunded' }
  | { type: 'disputed' }
  | { type: 'price_changed'; priceCents: number; stripePriceId: string }
  | { type: 'disconnected' }
) & { eventAt?: Date };

export type ClientBillingNoticeKind = 'client-payment-link' | 'client-payment-needed' | 'client-payment-failed' | 'client-paid' | 'client-auto-paused';

export interface ClientBillingTransition {
  state: ClientBillingState;
  patch: Partial<ClientBillingRow>;
  /** Outbox row (audience `client`) to queue in the same transaction. */
  notice?: { kind: ClientBillingNoticeKind; params: Record<string, unknown> };
}

const SUBSCRIBED: readonly ClientBillingState[] = ['active', 'payment_needed'];

/** `null` = nothing to write (signal does not apply to this state, already applied, or stale). */
export function nextClientBillingState(row: ClientBillingRow, s: ClientBillingSignal, now: Date): ClientBillingTransition | null {
  if (s.eventAt && row.lastStripeEventAt && s.eventAt < row.lastStripeEventAt) return null;
  const stamp = s.eventAt && (!row.lastStripeEventAt || s.eventAt > row.lastStripeEventAt) ? { lastStripeEventAt: s.eventAt } : {};
  const out = (state: ClientBillingState, patch: Partial<ClientBillingRow> = {}, notice?: ClientBillingTransition['notice']): ClientBillingTransition => ({
    state, patch: { ...patch, ...stamp }, ...(notice && { notice }),
  });
  const st = row.state;
  switch (s.type) {
    case 'invited':
      // A running subscription is managed through set_client_price / disable, never re-invited.
      if (SUBSCRIBED.includes(st)) return null;
      return out('invited', { enabled: true, priceCents: s.priceCents, setupFeeCents: s.setupFeeCents, stripePriceId: s.stripePriceId, checkoutSentAt: now, paymentFailedSince: null },
        { kind: 'client-payment-link', params: { checkoutUrl: s.checkoutUrl, issuedAt: now.toISOString() } });
    case 'checkout_completed':
      // Whoever pays is tracked, even after a disable: they now hold a subscription. A disconnected agency gets no webhooks.
      if (st === 'disconnected') return null;
      return out('active', { enabled: true, stripeCustomerId: s.customerId, stripeSubscriptionId: s.subscriptionId, lastPaidAt: now, paymentFailedSince: null },
        st === 'active' ? undefined : { kind: 'client-paid', params: {} });
    case 'payment_succeeded':
      if (!SUBSCRIBED.includes(st)) return null;
      return out('active', { lastPaidAt: now, paymentFailedSince: null });
    case 'payment_failed':
      if (st !== 'active') return null;
      return out('payment_needed', { paymentFailedSince: now }, { kind: 'client-payment-failed', params: {} });
    case 'subscription_cancelled':
      if (st !== 'active' && st !== 'payment_needed' && st !== 'invited') return null;
      return out('cancelled', { enabled: false, paymentFailedSince: null });
    case 'disabled': {
      // A live subscription keeps its state until Stripe confirms the cancellation at period end; otherwise billing is simply off.
      const next: ClientBillingState = SUBSCRIBED.includes(st) && row.stripeSubscriptionId ? st : st === 'cancelled' || st === 'disconnected' ? st : 'off';
      if (next === st && !row.enabled) return null;
      return out(next, { enabled: false });
    }
    case 'refunded':
      return row.refundedAt ? null : out(st, { refundedAt: now });
    case 'disputed':
      return row.disputedAt ? null : out(st, { disputedAt: now });
    case 'price_changed':
      return out(st, { priceCents: s.priceCents, stripePriceId: s.stripePriceId });
    case 'disconnected':
      if (st === 'off' || st === 'disconnected') return null;
      return out('disconnected');
  }
}
