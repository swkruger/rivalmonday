import { type Db, agencyBilling, agencyBillingEvent, agencyConnect, client, clientBilling } from '@cs/db';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { type BillingDb, isOnHold } from './access';
import type { BillingGateway } from './types';

/** Phase 15c3a: `agency_billing_event.reason` of the collection pause/resume attempt that follows a hold or lift. */
export const HOLD_BILLING_OK = 'admin_hold_billing_ok';
export const HOLD_BILLING_FAILED = 'admin_hold_billing_failed';

export interface HoldBillingResult {
  done: number;
  failed: { kind: 'agency' | 'client'; clientId?: string; clientName?: string }[];
}

const errName = (e: unknown): string => (e as { name?: string } | null)?.name ?? 'Error';

async function recordEvent(db: BillingDb, agencyId: string, reason: string, actor: string): Promise<void> {
  const [b] = await db.select({ state: agencyBilling.state }).from(agencyBilling).where(eq(agencyBilling.agencyId, agencyId));
  const state = b?.state ?? 'pilot';
  await db.insert(agencyBillingEvent).values({ agencyId, fromState: state, toState: state, reason, actor });
}

/**
 * Pauses (hold) or resumes (lift) Stripe collection on the agency's platform subscription and on its clients' Connect
 * subscriptions. Stripe calls run outside any transaction; one try/catch per target, failures are logged (ids + error
 * name) and returned. One event records the outcome. A null gateway (billing not configured) calls nothing.
 */
export async function applyHoldCollection(db: Db, gw: BillingGateway | null, agencyId: string, mode: 'pause' | 'resume', actor: string): Promise<HoldBillingResult> {
  const result: HoldBillingResult = { done: 0, failed: [] };
  if (gw) {
    const call = (id: string, o?: { stripeAccount?: string }) => (mode === 'pause' ? gw.pauseCollection(id, o) : gw.resumeCollection(id, o));
    const [ab] = await db.select({ subscriptionId: agencyBilling.stripeSubscriptionId, state: agencyBilling.state }).from(agencyBilling).where(eq(agencyBilling.agencyId, agencyId));
    if (ab?.subscriptionId && ab.state !== 'cancelled') {
      try {
        await call(ab.subscriptionId);
        result.done++;
      } catch (e) {
        console.error('[billing] hold collection failed', { agencyId, mode, kind: 'agency' }, errName(e));
        result.failed.push({ kind: 'agency' });
      }
    }
    const [conn] = await db.select({ account: agencyConnect.stripeAccountId }).from(agencyConnect).where(eq(agencyConnect.agencyId, agencyId));
    if (conn?.account) {
      const rows = await db
        .select({ clientId: clientBilling.clientId, subscriptionId: clientBilling.stripeSubscriptionId, name: client.name })
        .from(clientBilling)
        .innerJoin(client, eq(client.id, clientBilling.clientId))
        .where(and(eq(clientBilling.agencyId, agencyId), inArray(clientBilling.state, ['active', 'payment_needed'])));
      for (const r of rows) {
        if (!r.subscriptionId) continue;
        try {
          await call(r.subscriptionId, { stripeAccount: conn.account });
          result.done++;
        } catch (e) {
          console.error('[billing] hold collection failed', { agencyId, mode, kind: 'client', clientId: r.clientId }, errName(e));
          result.failed.push({ kind: 'client', clientId: r.clientId, clientName: r.name });
        }
      }
    }
  }
  await recordEvent(db, agencyId, result.failed.length ? HOLD_BILLING_FAILED : HOLD_BILLING_OK, actor);
  return result;
}

export type HoldBillingIssue = 'pause' | 'resume' | null;

/** The newest pause/resume attempt failed: which retry is due (`pause` while held, else `resume`); null when it succeeded or never ran. */
export async function holdBillingIssue(db: BillingDb, agencyId: string): Promise<HoldBillingIssue> {
  const [e] = await db
    .select({ reason: agencyBillingEvent.reason })
    .from(agencyBillingEvent)
    .where(and(eq(agencyBillingEvent.agencyId, agencyId), inArray(agencyBillingEvent.reason, [HOLD_BILLING_OK, HOLD_BILLING_FAILED])))
    .orderBy(desc(agencyBillingEvent.createdAt), desc(agencyBillingEvent.id))
    .limit(1);
  if (e?.reason !== HOLD_BILLING_FAILED) return null;
  return (await isOnHold(db, agencyId)) ? 'pause' : 'resume';
}

/**
 * Webhook hook (Decision 5): a subscription created while the agency is on hold is paused at once. Never throws; a
 * failure writes the `_failed` event so the operator sees and can retry it.
 */
export async function pauseIfHeld(db: Db, gw: BillingGateway | null, agencyId: string, subscriptionId: string, o?: { stripeAccount?: string }): Promise<void> {
  try {
    if (!gw || !(await isOnHold(db, agencyId))) return;
    try {
      await gw.pauseCollection(subscriptionId, o);
    } catch (e) {
      console.error('[billing] pause after checkout failed', { agencyId }, errName(e));
      await recordEvent(db, agencyId, HOLD_BILLING_FAILED, 'stripe:webhook');
    }
  } catch (e) {
    console.error('[billing] pauseIfHeld failed', { agencyId }, errName(e));
  }
}
