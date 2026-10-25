import { type Db, type Tx, agencyConnect, clientBilling, stripeConnectEvent } from '@cs/db';
import { and, eq } from 'drizzle-orm';
import type { ClientBillingSignal } from './client-billing-state';
import { liftAutoPause } from './client-pause';
import { applyClientBillingSignal, connectStatusFor, disconnectAgencyConnect, forgetConnectedAccount } from './connect-apply';
import type { ConnectEventLike } from './connect-gateway-types';
import { pauseIfHeld } from './hold';
import { syncSeats } from './seats';
import type { BillingGateway } from './types';
import { LIVE_SUBSCRIPTION_STATUSES } from './webhook';

export type ConnectWebhookResult = 'processed' | 'duplicate' | 'ignored';

const ACTOR = 'stripe:connect-webhook';
const MAX_ERROR_LENGTH = 500;

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const idOf = (v: unknown): string | null => str(v) ?? str(asObj(v)?.id);
/** An invoice's subscription: under `parent.subscription_details` on newer API versions, top-level on older ones. */
const invoiceSubscriptionId = (inv: Obj): string | null =>
  idOf(asObj(asObj(inv.parent)?.subscription_details)?.subscription) ?? idOf(inv.subscription);

const HANDLED = new Set([
  'account.updated',
  'account.application.deauthorized',
  'checkout.session.completed',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.deleted',
  'charge.refunded',
  'charge.dispute.created',
]);

/** Work to do after the transaction commits (Stripe calls never run inside it). Best effort. */
interface PostCommit {
  expireSession?: { account: string; sessionId: string };
  /** R23: a payment lifted an auto-pause, so the agency's 9a seat count changed. */
  syncSeatsFor?: string;
  /** Phase 15c3a: a subscription created while the agency is on hold is paused (no-op for an unheld agency). */
  pauseHeldFor?: { agencyId: string; subscriptionId: string; stripeAccount: string };
}

type Outcome = 'processed' | 'ignored';

function ignored(event: ConnectEventLike, reason: string): Outcome {
  // Ids and the reason only: never the payload.
  console.warn(`connect webhook: ignored (${reason}) event ${event.id} (${event.type})`);
  return 'ignored';
}

/** The client's billing row within this agency only (Review focus 1: a match in another agency is no match). */
async function clientIn(tx: Tx, agencyId: string, by: 'session' | 'subscription' | 'customer' | 'client', value: string | null): Promise<string | null> {
  if (!value) return null;
  const col = { session: clientBilling.checkoutSessionId, subscription: clientBilling.stripeSubscriptionId, customer: clientBilling.stripeCustomerId, client: clientBilling.clientId }[by];
  const [r] = await tx.select({ clientId: clientBilling.clientId }).from(clientBilling).where(and(eq(clientBilling.agencyId, agencyId), eq(col, value))).limit(1);
  return r?.clientId ?? null;
}

/** R15: the payload only identifies the account; the state persisted is Stripe's current one, so a late older event cannot regress it. */
async function onAccountUpdated(tx: Tx, gw: BillingGateway, agencyId: string, account: string, event: ConnectEventLike): Promise<Outcome> {
  const [row] = await tx.select().from(agencyConnect).where(eq(agencyConnect.agencyId, agencyId)).for('update');
  if (!row || row.status === 'disconnected') return ignored(event, 'disconnected');
  const live = await gw.getAccount({ stripeAccount: account });
  const status = connectStatusFor(live);
  const now = new Date();
  await tx
    .update(agencyConnect)
    .set({ chargesEnabled: live.chargesEnabled, detailsSubmitted: live.detailsSubmitted, status, ...(live.chargesEnabled && !row.connectedAt && { connectedAt: now }), updatedAt: now })
    .where(eq(agencyConnect.agencyId, agencyId));
  return 'processed';
}

/** Refund charges carry their customer; dispute objects carry only a charge id, so the customer is read from Stripe. */
async function customerOfCharge(gw: BillingGateway, account: string, obj: Obj, type: string): Promise<string | null> {
  const direct = idOf(obj.customer);
  if (direct) return direct;
  const chargeId = type === 'charge.refunded' ? str(obj.id) : idOf(obj.charge);
  if (!chargeId) return null;
  return (await gw.getConnectedCharge({ stripeAccount: account, chargeId })).customerId;
}

async function dispatch(tx: Tx, gw: BillingGateway, event: ConnectEventLike, post: PostCommit): Promise<Outcome> {
  if (!HANDLED.has(event.type)) return 'ignored';
  const account = event.account;
  if (!account) return ignored(event, 'no_account');
  const [conn] = await tx.select({ agencyId: agencyConnect.agencyId, status: agencyConnect.status }).from(agencyConnect).where(eq(agencyConnect.stripeAccountId, account));
  if (!conn) return ignored(event, 'unknown_account');
  const { agencyId } = conn;
  const obj = asObj(event.data?.object);
  if (!obj) return ignored(event, 'no_object');

  if (event.type === 'account.application.deauthorized') {
    await disconnectAgencyConnect(tx, agencyId, ACTOR);
    await forgetConnectedAccount(tx, agencyId); // R24: also after an admin disconnect, which kept the id
    return 'processed';
  }
  if (event.type === 'account.updated') return onAccountUpdated(tx, gw, agencyId, account, event);
  // A disconnected agency is no longer tracked: late events change nothing.
  if (conn.status === 'disconnected') return ignored(event, 'disconnected');

  const eventAt = new Date(event.created * 1000);
  let clientId: string | null;
  let signal: ClientBillingSignal;
  switch (event.type) {
    case 'checkout.session.completed': {
      const subscriptionId = idOf(obj.subscription);
      const customerId = idOf(obj.customer);
      if (!subscriptionId || !customerId) return ignored(event, 'no_subscription');
      clientId = (await clientIn(tx, agencyId, 'session', str(obj.id))) ?? (await clientIn(tx, agencyId, 'client', str(obj.client_reference_id)));
      if (!clientId) return ignored(event, 'unknown_client');
      // The price actually billed comes from Stripe, not from the event (or from what we last intended to charge).
      const sub = await gw.getConnectedSubscription({ stripeAccount: account, subscriptionId });
      if (!LIVE_SUBSCRIPTION_STATUSES.includes(sub.status)) return ignored(event, 'subscription_not_live');
      post.pauseHeldFor = { agencyId, subscriptionId, stripeAccount: account };
      const [row] = await tx.select({ priceCents: clientBilling.priceCents }).from(clientBilling).where(eq(clientBilling.clientId, clientId));
      // Never record 0: with neither Stripe's amount nor the intended price the billed price is left as it was.
      const priceCents = sub.unitAmountCents ?? row?.priceCents ?? null;
      if (priceCents === null) console.warn(`connect webhook: billed price unknown on event ${event.id}`);
      // R16: an unpaid session (async payment method) tracks the subscription but waits for invoice.paid.
      signal = { type: 'checkout_completed', customerId, subscriptionId, priceCents, ...(obj.payment_status === 'unpaid' && { unpaid: true }), sessionId: str(obj.id) ?? undefined, eventAt };
      break;
    }
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const subscriptionId = invoiceSubscriptionId(obj);
      clientId = await clientIn(tx, agencyId, 'subscription', subscriptionId);
      if (!subscriptionId || !clientId) return ignored(event, 'unknown_client');
      signal = { type: event.type === 'invoice.paid' ? 'payment_succeeded' : 'payment_failed', subscriptionId, eventAt };
      break;
    }
    case 'customer.subscription.deleted': {
      const subscriptionId = str(obj.id);
      clientId = await clientIn(tx, agencyId, 'subscription', subscriptionId);
      if (!subscriptionId || !clientId) return ignored(event, 'unknown_client');
      signal = { type: 'subscription_cancelled', subscriptionId, eventAt };
      break;
    }
    default: {
      // charge.refunded / charge.dispute.created: found by the Stripe customer, within this agency.
      clientId = await clientIn(tx, agencyId, 'customer', await customerOfCharge(gw, account, obj, event.type));
      if (!clientId) return ignored(event, 'unknown_client');
      signal = { type: event.type === 'charge.refunded' ? 'refunded' : 'disputed', eventAt };
    }
  }

  // R3/R11: the transition table drops older deliveries and subscriptions other than the tracked one.
  const r = await applyClientBillingSignal(tx, clientId, signal, ACTOR, eventAt);
  if (r.ignored) return ignored(event, r.ignored);
  if (!r.changed) return ignored(event, 'no_change');
  if (r.staleCheckoutSessionId) post.expireSession = { account, sessionId: r.staleCheckoutSessionId };

  // R14: a payment lifts only the automatic pause; a manual pause stays. A seat-cap refusal leaves the client paused.
  if (signal.type === 'payment_succeeded') {
    // Only the seat-cap refusal and an operator hold are expected ('refused'); anything else fails the event so Stripe retries.
    const lifted = await liftAutoPause(tx, clientId, ACTOR);
    if (lifted === 'lifted') post.syncSeatsFor = agencyId;
    else if (lifted === 'refused') console.warn(`connect webhook: auto-pause not lifted on event ${event.id}`);
  }
  return 'processed';
}

/**
 * Persist + dispatch one verified Connect event in a single transaction (dedupe by event id in `stripe_connect_event`,
 * `FOR UPDATE` on that row). A previously failed delivery (`processed_at` null) is reprocessed. On error the transaction
 * rolls back, the message (never the payload) is recorded on the event row, and the error is rethrown.
 */
export async function handleConnectEvent(db: Db, gw: BillingGateway, event: ConnectEventLike): Promise<ConnectWebhookResult> {
  const post: PostCommit = {};
  const accountId = event.account ?? '';
  let result: ConnectWebhookResult;
  try {
    result = await db.transaction(async (tx) => {
      await tx.insert(stripeConnectEvent).values({ id: event.id, accountId, type: event.type }).onConflictDoNothing();
      const [rec] = await tx.select().from(stripeConnectEvent).where(eq(stripeConnectEvent.id, event.id)).for('update');
      if (rec?.processedAt) return 'duplicate';
      const outcome = await dispatch(tx, gw, event, post);
      await tx.update(stripeConnectEvent).set({ processedAt: new Date(), error: null }).where(eq(stripeConnectEvent.id, event.id));
      return outcome;
    });
  } catch (e) {
    const error = (e instanceof Error ? e.message : String(e)).slice(0, MAX_ERROR_LENGTH);
    try {
      await db.insert(stripeConnectEvent).values({ id: event.id, accountId, type: event.type, error }).onConflictDoUpdate({ target: stripeConnectEvent.id, set: { error } });
    } catch {
      // recording the failure is best effort; the original error is what matters
    }
    throw e;
  }
  if (post.syncSeatsFor) {
    // R23: the lifted client takes a seat again. Never throws; a failure sets seat_sync_pending for the daily job.
    await syncSeats(db, gw, post.syncSeatsFor).catch((e: unknown) =>
      console.error('[billing] seat sync after auto-pause lift failed', { agencyId: post.syncSeatsFor }, (e as { name?: string } | null)?.name));
  }
  if (post.pauseHeldFor) {
    await pauseIfHeld(db, gw, post.pauseHeldFor.agencyId, post.pauseHeldFor.subscriptionId, { stripeAccount: post.pauseHeldFor.stripeAccount });
  }
  if (post.expireSession) {
    // R13c: the link the client did not use is superseded by the one they paid with. Best effort, after commit.
    await gw.expireConnectedCheckout({ stripeAccount: post.expireSession.account, sessionId: post.expireSession.sessionId }).catch((e: unknown) =>
      console.error('[billing] expireConnectedCheckout failed', (e as { name?: string } | null)?.name));
  }
  return result;
}
