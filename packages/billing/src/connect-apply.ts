import { randomUUID } from 'node:crypto';
import { type ClientBillingRow, type ClientBillingState, type Tx, agencyConnect, billingNotice, client, clientBilling } from '@cs/db';
import { and, eq, isNull, notInArray } from 'drizzle-orm';
import { type ClientBillingNoticeKind, type ClientBillingSignal, nextClientBillingState, noticeAudience } from './client-billing-state';

/**
 * Phase 9b f10 / R7: the agency's Stripe connection ends (admin disconnect, or `account.application.deauthorized`).
 * Locks the `agency_connect` row, marks it `disconnected` (charges off; the account id is kept, R24) and moves every
 * client's billing that is not already `off`/`disconnected` to `disconnected`, with billing turned off (R26). Local only: subscriptions keep running in the agency's Stripe account.
 * Idempotent: returns `changed: false` (no writes) when there is no connection or it is already disconnected.
 */
/** One status rule for stored and live Connect state (webhook and `get_connect_status`): connected = charges enabled; restricted = details submitted without charges; else pending. */
export function connectStatusFor(a: { chargesEnabled: boolean; detailsSubmitted: boolean }): 'connected' | 'restricted' | 'pending' {
  return a.chargesEnabled ? 'connected' : a.detailsSubmitted ? 'restricted' : 'pending';
}

export async function disconnectAgencyConnect(tx: Tx, agencyId: string, _actor: string): Promise<{ changed: boolean }> {
  const [row] = await tx.select({ status: agencyConnect.status }).from(agencyConnect).where(eq(agencyConnect.agencyId, agencyId)).for('update');
  if (!row || row.status === 'disconnected') return { changed: false };
  const now = new Date();
  await tx.update(agencyConnect).set({ status: 'disconnected', chargesEnabled: false, disconnectedAt: now, updatedAt: now }).where(eq(agencyConnect.agencyId, agencyId));
  await tx
    .update(clientBilling)
    .set({ state: 'disconnected', enabled: false, updatedAt: now })
    .where(and(eq(clientBilling.agencyId, agencyId), notInArray(clientBilling.state, ['disconnected', 'off'])));
  // R26: billing is off for every client; after a reconnect the admin turns it back on per client.
  await tx.update(clientBilling).set({ enabled: false, updatedAt: now }).where(and(eq(clientBilling.agencyId, agencyId), eq(clientBilling.enabled, true)));
  return { changed: true };
}

/**
 * R24: Stripe revoked the platform's access (`account.application.deauthorized`): the account id and the objects that
 * live on that account (product, default price, portal configuration) are forgotten, so a reconnect onboards a fresh
 * account. An admin disconnect keeps them (reconnecting reuses the same account).
 */
export async function forgetConnectedAccount(tx: Tx, agencyId: string): Promise<void> {
  await tx
    .update(agencyConnect)
    .set({ stripeAccountId: null, stripeProductId: null, stripeDefaultPriceId: null, portalConfigurationId: null, updatedAt: new Date() })
    .where(eq(agencyConnect.agencyId, agencyId));
}

/** Lock the client's `client_billing` row `FOR UPDATE`, first inserting the default `off` row. `null` when the client does not exist. */
async function lockClientBilling(tx: Tx, clientId: string): Promise<ClientBillingRow | null> {
  const lock = () => tx.select().from(clientBilling).where(eq(clientBilling.clientId, clientId)).for('update');
  let [row] = await lock();
  if (!row) {
    const [c] = await tx.select({ agencyId: client.agencyId }).from(client).where(eq(client.id, clientId));
    if (!c) return null;
    await tx.insert(clientBilling).values({ clientId, agencyId: c.agencyId, state: 'off' }).onConflictDoNothing();
    [row] = await lock();
  }
  return row ?? null;
}

/**
 * The one place client-billing transitions are persisted (Q2): lock row, `nextClientBillingState`, update and queue the
 * transition's outbox row (`billing_notice`, audience by kind) in the caller's transaction. `null` transition writes nothing.
 * A resent link supersedes earlier unsent ones for the client (their URLs are never mailed).
 */
export async function applyClientBillingSignal(
  tx: Tx,
  clientId: string,
  signal: ClientBillingSignal,
  _actor: string,
  now: Date = new Date(),
): Promise<{ changed: boolean; state: ClientBillingState | null; ignored?: 'untracked_subscription'; staleCheckoutSessionId?: string }> {
  const row = await lockClientBilling(tx, clientId);
  if (!row) return { changed: false, state: null };
  const t = nextClientBillingState(row, signal, now);
  if (t && 'ignored' in t) return { changed: false, state: row.state, ignored: t.ignored };
  if (!t) return { changed: false, state: row.state };
  await tx.update(clientBilling).set({ ...t.patch, state: t.state, updatedAt: now }).where(eq(clientBilling.clientId, clientId));
  if (signal.type === 'invited' || signal.type === 'disabled') {
    await tx.delete(billingNotice).where(and(eq(billingNotice.clientId, clientId), eq(billingNotice.kind, 'client-payment-link'), isNull(billingNotice.sentAt)));
  }
  // R13c: the client paid; any unsent payment-link mail is moot. A different tracked session is the caller's to expire (after commit).
  if (signal.type === 'checkout_completed') {
    await tx.delete(billingNotice).where(and(eq(billingNotice.clientId, clientId), eq(billingNotice.kind, 'client-payment-link'), isNull(billingNotice.sentAt)));
  }
  const queue = (kind: ClientBillingNoticeKind, params: Record<string, unknown>) =>
    tx.insert(billingNotice).values({ agencyId: row.agencyId, clientId, audience: noticeAudience(kind), kind, params, dedupeKey: `${kind}:${clientId}:${randomUUID()}` });
  if (t.notice) await queue(t.notice.kind, t.notice.params);
  // A failed payment also tells the client owner (the transition's own notice goes to the agency).
  if (signal.type === 'payment_failed') await queue('client-payment-needed', {});
  const stale = signal.type === 'checkout_completed' && row.checkoutSessionId && row.checkoutSessionId !== signal.sessionId ? row.checkoutSessionId : undefined;
  return { changed: true, state: t.state, ...(stale && { staleCheckoutSessionId: stale }) };
}
