import { type Db, agencyConnect, billingNotice, client, clientBilling } from '@cs/db';
import { and, eq, inArray, isNotNull, isNull, lte, ne, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { type ClientBillingSignal, noticeAudience } from './client-billing-state';
import { liftAutoPause, pauseClient } from './client-pause';
import { applyClientBillingSignal } from './connect-apply';
import type { ConnectedSubscription } from './connect-gateway-types';
import { syncSeats } from './seats';
import type { BillingGateway } from './types';

const ACTOR = 'job';
const DAY_MS = 86_400_000;

export interface ConnectDailyResult {
  paused: number;
  reconciled: number;
  /** 7b2 M3: auto-paused clients whose caught-up payment lifted the pause. */
  resumed: number;
}

/**
 * The one client-MRR definition (shared with `get_client_revenue` and the daily stat): the summed `billed_price_cents`
 * of enabled `active` subscriptions of `active`, non-archived clients. Paused clients still count (their subscription still bills).
 */
export async function clientMrrCents(db: Db, agencyId: string): Promise<number> {
  const rows = await db
    .select({ billed: clientBilling.billedPriceCents })
    .from(clientBilling)
    .innerJoin(client, eq(client.id, clientBilling.clientId))
    .where(and(eq(clientBilling.agencyId, agencyId), eq(clientBilling.enabled, true), eq(clientBilling.state, 'active'), eq(client.status, 'active'), isNull(client.archivedAt)));
  return rows.reduce((n, r) => n + (r.billed ?? 0), 0);
}

/** Stripe status -> our state. `undefined` = no opinion (incomplete / paused): leave the row untouched. */
export function reconcileTarget(status: ConnectedSubscription['status']): 'active' | 'payment_needed' | 'cancelled' | undefined {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'payment_needed';
    case 'canceled':
    case 'incomplete_expired':
      return 'cancelled';
    default:
      return undefined;
  }
}

const logRow = (step: string, clientId: string, subscriptionId: string | null, e: unknown) =>
  console.error(`[billing-daily] connect ${step} failed`, { clientId, subscriptionId, error: e instanceof Error ? e.name : 'Error' });

/**
 * The platform cannot reach the connected ACCOUNT (access revoked, account gone): Stripe answers `account_invalid` or a
 * permission error, never `resource_missing`. Nothing can be said about any subscription on it, so nothing is cancelled.
 */
export const isAccountUnreachable = (e: unknown): boolean => {
  const err = e as { code?: string; type?: string } | null;
  return err?.code === 'account_invalid' || err?.type === 'StripePermissionError';
};

/**
 * Stripe wins: read each tracked subscription and drive the row through the silent `reconciled` signal. Per-row try/catch;
 * a missing SUBSCRIPTION (`resource_missing`) cancels the row, an unreachable ACCOUNT stops this agency for the run.
 */
async function reconcileClients(db: Db, gw: BillingGateway, agencyId: string, stripeAccount: string, now: Date): Promise<{ changed: number; resumed: number }> {
  const rows = await db
    .select({ clientId: clientBilling.clientId, subscriptionId: clientBilling.stripeSubscriptionId })
    .from(clientBilling)
    .where(and(eq(clientBilling.agencyId, agencyId), inArray(clientBilling.state, ['invited', 'active', 'payment_needed']), isNotNull(clientBilling.stripeSubscriptionId)));
  let changed = 0;
  let resumed = 0;
  for (const { clientId, subscriptionId } of rows) {
    try {
      let signal: ClientBillingSignal;
      try {
        const sub = await gw.getConnectedSubscription({ stripeAccount, subscriptionId: subscriptionId! });
        const target = reconcileTarget(sub.status);
        if (target === undefined) continue;
        signal = { type: 'reconciled', subscriptionId: subscriptionId!, target, billedPriceCents: sub.unitAmountCents, paid: sub.status === 'active' };
      } catch (e) {
        if (isAccountUnreachable(e)) {
          console.error('[billing-daily] connect account unreachable; reconciliation stopped for this run', { agencyId, stripeAccount, clientId, subscriptionId });
          return { changed, resumed };
        }
        if ((e as { code?: string }).code !== 'resource_missing') throw e;
        signal = { type: 'reconciled', subscriptionId: subscriptionId!, target: 'cancelled', billedPriceCents: null };
      }
      const lift = await db.transaction(async (tx) => {
        const r = await applyClientBillingSignal(tx, clientId, signal, ACTOR, now);
        if (!r.changed) return null;
        // M3: a caught-up payment lifts the automatic pause in the same transaction (a manual pause stays).
        return r.state === 'active' && signal.type === 'reconciled' && signal.target === 'active' ? liftAutoPause(tx, clientId, ACTOR) : 'none';
      });
      if (lift === null) continue;
      changed++;
      if (lift === 'lifted') resumed++;
      else if (lift === 'refused') console.warn('[billing-daily] connect auto-pause not lifted', { clientId });
    } catch (e) {
      logRow('reconcile', clientId, subscriptionId, e);
    }
  }
  return { changed, resumed };
}

/**
 * Pause clients whose payment has been failing for >= N days (exactly N pauses); one agency notice per pause. R22: at most
 * once per failure episode (`auto_paused_failure_at` = the episode's `payment_failed_since`), so a manual resume sticks
 * until a new failure. The candidate is re-checked under `FOR UPDATE` inside the transaction: a payment (or a disable)
 * landing after the select must not pause the client.
 */
async function autoPause(db: Db, agencyId: string, days: number, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - days * DAY_MS);
  const due = await db
    .select({ clientId: clientBilling.clientId, name: client.name })
    .from(clientBilling)
    .innerJoin(client, eq(client.id, clientBilling.clientId))
    .where(and(
      eq(clientBilling.agencyId, agencyId), eq(clientBilling.state, 'payment_needed'), eq(clientBilling.enabled, true), lte(clientBilling.paymentFailedSince, cutoff),
      or(isNull(clientBilling.autoPausedFailureAt), ne(clientBilling.autoPausedFailureAt, clientBilling.paymentFailedSince)),
      eq(client.status, 'active'), isNull(client.pausedAt), isNull(client.archivedAt),
    ));
  let paused = 0;
  for (const { clientId, name } of due) {
    try {
      const did = await db.transaction(async (tx) => {
        const [b] = await tx.select().from(clientBilling).where(eq(clientBilling.clientId, clientId)).for('update');
        const since = b?.paymentFailedSince ?? null;
        if (!b || b.state !== 'payment_needed' || !b.enabled || !since || since > cutoff || b.autoPausedFailureAt?.getTime() === since.getTime()) return false;
        if (!(await pauseClient(tx, clientId, ACTOR, 'auto'))) return false;
        await tx.update(clientBilling).set({ autoPausedFailureAt: since, updatedAt: now }).where(eq(clientBilling.clientId, clientId));
        await tx.insert(billingNotice).values({
          agencyId, clientId, audience: noticeAudience('client-auto-paused'), kind: 'client-auto-paused', params: { clientName: name, n: days },
          dedupeKey: `client-auto-paused:${clientId}:${randomUUID()}`,
        });
        return true;
      });
      if (did) paused++;
    } catch (e) {
      logRow('auto-pause', clientId, null, e);
    }
  }
  return paused;
}

/**
 * Daily Phase 9b step for one agency (after the 9a steps): Connect reconciliation (only with a gateway, Stripe wins,
 * silent) then auto-pause, then a seat sync when someone was paused or resumed. Disconnected agencies are skipped entirely
 * (R7 / Review focus 5); `disconnected` client rows are never reconciled or paused (not in the state filters).
 */
export async function runConnectDaily(db: Db, gw: BillingGateway | null, agencyId: string, now: Date): Promise<ConnectDailyResult> {
  const result: ConnectDailyResult = { paused: 0, reconciled: 0, resumed: 0 };
  const [connect] = await db.select().from(agencyConnect).where(eq(agencyConnect.agencyId, agencyId));
  if (!connect || connect.status === 'disconnected') return result;
  if (gw && connect.stripeAccountId) ({ changed: result.reconciled, resumed: result.resumed } = await reconcileClients(db, gw, agencyId, connect.stripeAccountId, now));
  if (connect.autoPauseAfterDays) result.paused = await autoPause(db, agencyId, connect.autoPauseAfterDays, now);
  if (gw && (result.paused || result.resumed)) await syncSeats(db, gw, agencyId); // never throws; failure sets seat_sync_pending for the next run
  return result;
}
