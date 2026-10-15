import { type Db, agencyConnect, billingNotice, client, clientBilling } from '@cs/db';
import { and, eq, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { type ClientBillingSignal, noticeAudience } from './client-billing-state';
import { pauseClient } from './client-pause';
import { applyClientBillingSignal } from './connect-apply';
import type { ConnectedSubscription } from './connect-gateway-types';
import { syncSeats } from './seats';
import type { BillingGateway } from './types';

const ACTOR = 'job';
const DAY_MS = 86_400_000;

export interface ConnectDailyResult {
  paused: number;
  reconciled: number;
}

/**
 * The one client-MRR definition (shared with `get_client_revenue` and the daily stat): the summed `billed_price_cents`
 * of enabled `active` subscriptions of `active` clients. Paused clients still count (their subscription still bills).
 */
export async function clientMrrCents(db: Db, agencyId: string): Promise<number> {
  const rows = await db
    .select({ billed: clientBilling.billedPriceCents })
    .from(clientBilling)
    .innerJoin(client, eq(client.id, clientBilling.clientId))
    .where(and(eq(clientBilling.agencyId, agencyId), eq(clientBilling.enabled, true), eq(clientBilling.state, 'active'), eq(client.status, 'active')));
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

/** Stripe wins: read each tracked subscription and drive the row through the silent `reconciled` signal. Per-row try/catch. */
async function reconcileClients(db: Db, gw: BillingGateway, agencyId: string, stripeAccount: string, now: Date): Promise<number> {
  const rows = await db
    .select({ clientId: clientBilling.clientId, subscriptionId: clientBilling.stripeSubscriptionId })
    .from(clientBilling)
    .where(and(eq(clientBilling.agencyId, agencyId), inArray(clientBilling.state, ['invited', 'active', 'payment_needed']), isNotNull(clientBilling.stripeSubscriptionId)));
  let changed = 0;
  for (const { clientId, subscriptionId } of rows) {
    try {
      let signal: ClientBillingSignal;
      try {
        const sub = await gw.getConnectedSubscription({ stripeAccount, subscriptionId: subscriptionId! });
        const target = reconcileTarget(sub.status);
        if (target === undefined) continue;
        signal = { type: 'reconciled', subscriptionId: subscriptionId!, target, billedPriceCents: sub.unitAmountCents };
      } catch (e) {
        if ((e as { code?: string }).code !== 'resource_missing') throw e;
        signal = { type: 'reconciled', subscriptionId: subscriptionId!, target: 'cancelled', billedPriceCents: null };
      }
      if ((await db.transaction((tx) => applyClientBillingSignal(tx, clientId, signal, ACTOR, now))).changed) changed++;
    } catch (e) {
      logRow('reconcile', clientId, subscriptionId, e);
    }
  }
  return changed;
}

/** Pause clients whose payment has been failing for >= N days (exactly N pauses); one agency notice per pause. */
async function autoPause(db: Db, agencyId: string, days: number, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - days * DAY_MS);
  const due = await db
    .select({ clientId: clientBilling.clientId, name: client.name })
    .from(clientBilling)
    .innerJoin(client, eq(client.id, clientBilling.clientId))
    .where(and(eq(clientBilling.agencyId, agencyId), eq(clientBilling.state, 'payment_needed'), lte(clientBilling.paymentFailedSince, cutoff), eq(client.status, 'active'), isNull(client.pausedAt)));
  let paused = 0;
  for (const { clientId, name } of due) {
    try {
      const did = await db.transaction(async (tx) => {
        if (!(await pauseClient(tx, clientId, ACTOR, 'auto'))) return false;
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
 * silent) then auto-pause, then a seat sync when someone was paused. Disconnected agencies are skipped entirely
 * (R7 / Review focus 5); `disconnected` client rows are never reconciled or paused (not in the state filters).
 */
export async function runConnectDaily(db: Db, gw: BillingGateway | null, agencyId: string, now: Date): Promise<ConnectDailyResult> {
  const result: ConnectDailyResult = { paused: 0, reconciled: 0 };
  const [connect] = await db.select().from(agencyConnect).where(eq(agencyConnect.agencyId, agencyId));
  if (!connect || connect.status === 'disconnected') return result;
  if (gw && connect.stripeAccountId) result.reconciled = await reconcileClients(db, gw, agencyId, connect.stripeAccountId, now);
  if (connect.autoPauseAfterDays) result.paused = await autoPause(db, agencyId, connect.autoPauseAfterDays, now);
  if (gw && result.paused) await syncSeats(db, gw, agencyId); // never throws; failure sets seat_sync_pending for the next run
  return result;
}
