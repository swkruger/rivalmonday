import { type AgencyBillingRow, type Db, type Tx, agencyBilling, plan, stripeEvent } from '@cs/db';
import { eq, inArray } from 'drizzle-orm';
import { applyBillingSignal, lockBillingRow } from './apply';
import type { BillingSignal } from './state';
import type { BillingGateway, StripeEventLike } from './types';

export type WebhookResult = 'processed' | 'duplicate' | 'ignored';

const ACTOR = 'stripe:webhook';
const MAX_ERROR_LENGTH = 500;

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/** A Stripe reference is either an id string or an expanded object carrying `id`. */
const idOf = (v: unknown): string | null => str(v) ?? str(asObj(v)?.id);
const fromSeconds = (v: unknown): Date | null => {
  const s = num(v);
  return s === null ? null : new Date(s * 1000);
};

/** Subscription period end: top-level on older API versions, on the first item on newer ones. */
function periodEnd(sub: Obj): Date | null {
  const top = fromSeconds(sub.current_period_end);
  if (top) return top;
  const first = asObj((Array.isArray(asObj(sub.items)?.data) ? (asObj(sub.items)!.data as unknown[]) : [])[0]);
  return fromSeconds(first?.current_period_end);
}

/** Stripe statuses of a subscription that still bills (or will): one per agency (R22), the only ones worth recording (R26). */
export const LIVE_SUBSCRIPTION_STATUSES: readonly string[] = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'];
const isLive = (status: string | null) => status !== null && LIVE_SUBSCRIPTION_STATUSES.includes(status);

/** Events that change billing state; everything else is acknowledged and ignored. */
const STATE_EVENTS = new Set([
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
]);

/**
 * R12: facts (subscription id, plan, seats) are recorded even when the R3 guard skips the state signal, so a late
 * checkout event never leaves `stripe_subscription_id` null. Returns false when the event carries no subscription, or
 * one that is no longer live (R26: a replayed checkout must not bring an ended subscription back).
 */
async function recordCheckoutFacts(tx: Tx, gw: BillingGateway, row: AgencyBillingRow, obj: Obj, created: number): Promise<boolean> {
  const subscriptionId = idOf(obj.subscription);
  if (!subscriptionId) return false;
  // A different subscription id replaces the stored one (re-subscribe) unless the event is older than the newest applied one.
  const stale = !!row.lastStripeEventAt && created * 1000 < row.lastStripeEventAt.getTime();
  if (row.stripeSubscriptionId && row.stripeSubscriptionId !== subscriptionId && stale) return true;
  const sub = await gw.getSubscription(subscriptionId);
  if (!isLive(sub.status)) return false;
  const priceIds = sub.items.map((i) => i.priceId);
  const [matched] = priceIds.length ? await tx.select({ id: plan.id }).from(plan).where(inArray(plan.stripeBasePriceId, priceIds)).limit(1) : [];
  await tx
    .update(agencyBilling)
    .set({ stripeSubscriptionId: subscriptionId, billableSeatsSynced: sub.seatQuantity, ...(matched && { planId: matched.id }) })
    .where(eq(agencyBilling.agencyId, row.agencyId));
  return true;
}

/** The subscription facts that decide a billing signal (webhook payload and gateway read both reduce to this). */
export interface SubscriptionFacts {
  status: string | null;
  cancelAtPeriodEnd: boolean;
  /** When the cancellation takes effect; null when unknown. */
  cancelAt: Date | null;
  hasPaymentMethod: boolean;
}

/** Single Stripe subscription -> billing signal mapping, shared by the webhook and the daily reconciliation. */
export function signalForSubscription(f: SubscriptionFacts, now: Date): BillingSignal | null {
  if (f.status === 'past_due' || f.status === 'unpaid') return { kind: 'payment_failed', now };
  if (f.status === 'canceled') return { kind: 'subscription_ended', now };
  if (f.cancelAtPeriodEnd && f.cancelAt) return { kind: 'subscription_cancelled_at_period_end', at: f.cancelAt, now };
  if (f.status === 'active') return { kind: 'subscription_active', now };
  if (f.status === 'trialing' && f.hasPaymentMethod) return { kind: 'subscription_active', now };
  return null;
}

async function onSubscriptionUpdated(gw: BillingGateway, obj: Obj, now: Date): Promise<BillingSignal | null> {
  const cancelAtPeriodEnd = obj.cancel_at_period_end === true;
  let cancelAt: Date | null = null;
  if (cancelAtPeriodEnd) {
    cancelAt = fromSeconds(obj.cancel_at) ?? periodEnd(obj);
    const id = str(obj.id);
    if (!cancelAt && id) cancelAt = (await gw.getSubscription(id)).currentPeriodEnd;
  }
  return signalForSubscription(
    { status: str(obj.status), cancelAtPeriodEnd, cancelAt, hasPaymentMethod: !!(idOf(obj.default_payment_method) || idOf(obj.default_source)) },
    now,
  );
}

async function dispatch(tx: Tx, gw: BillingGateway, event: StripeEventLike): Promise<'processed' | 'ignored'> {
  if (!STATE_EVENTS.has(event.type)) return 'ignored';
  const obj = asObj(event.data?.object);
  const customerId = obj && idOf(obj.customer);
  if (!obj || !customerId) return 'ignored';

  const [found] = await tx.select({ agencyId: agencyBilling.agencyId }).from(agencyBilling).where(eq(agencyBilling.stripeCustomerId, customerId));
  if (!found) {
    console.warn(`stripe webhook: no agency for customer on event ${event.id} (${event.type})`);
    return 'ignored';
  }
  const { agencyId } = found;
  const row = await lockBillingRow(tx, agencyId);
  // R26: an event about a subscription other than the one we hold (e.g. the ended one after a re-subscribe) is stale news.
  const isSubscriptionEvent = event.type.startsWith('customer.subscription.');
  if (isSubscriptionEvent && row.stripeSubscriptionId && str(obj.id) !== row.stripeSubscriptionId) return 'ignored';
  // R12: record facts first, independent of ordering.
  let hasSubscription = true;
  if (event.type === 'checkout.session.completed') hasSubscription = await recordCheckoutFacts(tx, gw, row, obj, event.created);
  else if (isSubscriptionEvent && !row.stripeSubscriptionId && str(obj.id) && isLive(str(obj.status))) {
    await tx.update(agencyBilling).set({ stripeSubscriptionId: str(obj.id) }).where(eq(agencyBilling.agencyId, agencyId));
  }
  // R3 ordering guard: a delivery older than the newest applied event must not overwrite newer state.
  if (row.lastStripeEventAt && event.created * 1000 < row.lastStripeEventAt.getTime()) return 'ignored';

  const now = new Date(event.created * 1000);
  let signal: BillingSignal | null;
  switch (event.type) {
    case 'checkout.session.completed':
      signal = hasSubscription ? { kind: 'subscription_active', now } : null;
      break;
    case 'customer.subscription.updated':
      signal = await onSubscriptionUpdated(gw, obj, now);
      break;
    case 'customer.subscription.deleted':
      signal = { kind: 'subscription_ended', now };
      break;
    case 'invoice.paid':
      signal = { kind: 'subscription_active', now };
      break;
    default: // invoice.payment_failed
      signal = { kind: 'payment_failed', now };
  }
  if (!signal) return 'ignored';

  await applyBillingSignal(tx, agencyId, signal, ACTOR, event.id);
  await tx.update(agencyBilling).set({ lastStripeEventAt: now }).where(eq(agencyBilling.agencyId, agencyId));
  return 'processed';
}

/**
 * Persist + dispatch one verified Stripe event in a single transaction (dedupe by event id, `FOR UPDATE` on the
 * `stripe_event` row). A previously failed delivery (`processed_at` null) is reprocessed. On error the transaction
 * rolls back, the message (never the payload) is recorded on the event row, and the error is rethrown.
 */
export async function handleStripeEvent(db: Db, gw: BillingGateway, event: StripeEventLike): Promise<WebhookResult> {
  try {
    return await db.transaction(async (tx) => {
      await tx.insert(stripeEvent).values({ id: event.id, type: event.type }).onConflictDoNothing();
      const [rec] = await tx.select().from(stripeEvent).where(eq(stripeEvent.id, event.id)).for('update');
      if (rec?.processedAt) return 'duplicate';
      const result = await dispatch(tx, gw, event);
      await tx.update(stripeEvent).set({ processedAt: new Date(), error: null }).where(eq(stripeEvent.id, event.id));
      return result;
    });
  } catch (e) {
    const error = (e instanceof Error ? e.message : String(e)).slice(0, MAX_ERROR_LENGTH);
    try {
      await db.insert(stripeEvent).values({ id: event.id, type: event.type, error }).onConflictDoUpdate({ target: stripeEvent.id, set: { error } });
    } catch {
      // recording the failure is best effort; the original error is what matters
    }
    throw e;
  }
}
