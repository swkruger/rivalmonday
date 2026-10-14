import { type AgencyBillingRow, type BillingState, type Tx, agencyBilling, agencyBillingEvent, billingNotice } from '@cs/db';
import { eq } from 'drizzle-orm';
import { currentStandardPlan } from './access';
import { type BillingSignal, nextBillingState } from './state';

/** Lock the agency's billing row `FOR UPDATE`, first inserting the default `pilot` row when the agency has none. */
export async function lockBillingRow(tx: Tx, agencyId: string): Promise<AgencyBillingRow> {
  const lock = () => tx.select().from(agencyBilling).where(eq(agencyBilling.agencyId, agencyId)).for('update');
  let [row] = await lock();
  if (!row) {
    const p = await currentStandardPlan(tx);
    await tx.insert(agencyBilling).values({ agencyId, state: 'pilot', planId: p?.id ?? null }).onConflictDoNothing();
    [row] = await lock();
  }
  return row!;
}

const iso = (d: Date | null) => (d ? d.toISOString() : undefined);

/** Template params for a `billing_notice` row (Task 7 maps these to emails). */
export function transitionParams(fromState: BillingState | null, row: AgencyBillingRow, reason: string) {
  return {
    fromState,
    toState: row.state,
    reason,
    ...(row.trialEndsAt && { trialEndsAt: iso(row.trialEndsAt) }),
    ...(row.pastDueSince && { pastDueSince: iso(row.pastDueSince) }),
    ...(row.pilotEndsAt && { pilotEndsAt: iso(row.pilotEndsAt) }),
  };
}

/**
 * The one place billing transitions are persisted: lock row, `nextBillingState`, update + one `agency_billing_event` and
 * (only when the visible state changed) one `billing_notice`, all in the caller's transaction. `null` writes nothing.
 */
export async function applyBillingSignal(
  tx: Tx,
  agencyId: string,
  signal: BillingSignal,
  actor: string,
  stripeEventId?: string,
): Promise<{ changed: boolean; state: BillingState }> {
  const row = await lockBillingRow(tx, agencyId);
  const t = nextBillingState(row, signal);
  if (!t) return { changed: false, state: row.state };

  const now = new Date();
  const stateChanged = t.state !== row.state;
  const patch = { ...t.patch, state: t.state, updatedAt: now, ...(stateChanged && { stateChangedAt: t.patch.stateChangedAt ?? now }) };
  const [next] = await tx.update(agencyBilling).set(patch).where(eq(agencyBilling.agencyId, agencyId)).returning();
  const [ev] = await tx
    .insert(agencyBillingEvent)
    .values({ agencyId, fromState: row.state, toState: t.state, reason: t.reason, actor, stripeEventId: stripeEventId ?? null })
    .returning({ id: agencyBillingEvent.id });
  if (stateChanged) {
    await tx.insert(billingNotice).values({
      agencyId,
      kind: `billing_${t.state}`,
      dedupeKey: `transition:${ev!.id}`,
      params: transitionParams(row.state, next!, t.reason),
    });
  }
  return { changed: true, state: t.state };
}
