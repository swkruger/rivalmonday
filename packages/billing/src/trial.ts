import { type AgencyBillingRow, agency, agencyBilling, agencyBillingEvent, billingNotice } from '@cs/db';
import { eq } from 'drizzle-orm';
import { type BillingDb, currentStandardPlan } from './access';
import { transitionParams } from './apply';
import type { BillingGateway } from './types';

export const START_REASONS = { trial: 'start:trial', pilot: 'start:pilot' } as const;

export interface StartTrialOpts {
  offer: 'pilot' | 'trial';
  pilotEndsAt?: Date;
  couponId?: string;
  actor?: string;
  now?: Date;
  /** false skips the `billing_trialing`/`billing_pilot` notice (Phase 10 sign-up sends `agency_welcome` instead). Default true. */
  notice?: boolean;
}

/**
 * Create the agency's billing row (Phase 10 signup / invite redemption). Idempotent: an existing row is returned
 * unchanged. A gateway failure still creates the row with no Stripe customer (checkout creates it later).
 * Phase 10 (R3): `gw === null` skips the Stripe customer entirely (Checkout's `ensureCustomer` creates it lazily), so it
 * can run inside the caller's transaction (`db` may be a Tx; the inner transaction is then a savepoint).
 */
export async function startAgencyTrial(db: BillingDb, gw: BillingGateway | null, agencyId: string, opts: StartTrialOpts): Promise<AgencyBillingRow> {
  const existing = async () => (await db.select().from(agencyBilling).where(eq(agencyBilling.agencyId, agencyId)))[0];
  const found = await existing();
  if (found) return found;

  const [ag] = await db.select({ name: agency.name }).from(agency).where(eq(agency.id, agencyId));
  if (!ag) throw new Error('Agency not found');
  let customerId: string | null = null;
  if (gw) {
    try {
      customerId = (await gw.createCustomer({ agencyId, name: ag.name })).id;
    } catch {
      console.error('[billing] createCustomer failed during trial start', { agencyId });
    }
  }

  return db.transaction(async (tx) => {
    const p = await currentStandardPlan(tx);
    if (!p) throw new Error('No current standard plan');
    const now = opts.now ?? new Date();
    const trial = opts.offer === 'trial';
    const [row] = await tx
      .insert(agencyBilling)
      .values({
        agencyId,
        state: trial ? 'trialing' : 'pilot',
        planId: p.id,
        stripeCustomerId: customerId,
        trialEndsAt: trial ? new Date(now.getTime() + p.trialDays * 86_400_000) : null,
        pilotEndsAt: trial ? null : (opts.pilotEndsAt ?? null),
        attachedCouponId: opts.couponId ?? null,
        stateChangedAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) return (await existing())!; // a concurrent start won
    const reason = START_REASONS[opts.offer];
    const [ev] = await tx
      .insert(agencyBillingEvent)
      .values({ agencyId, fromState: null, toState: row.state, reason, actor: opts.actor ?? 'system' })
      .returning({ id: agencyBillingEvent.id });
    if (opts.notice !== false) {
      await tx.insert(billingNotice).values({
        agencyId,
        kind: `billing_${row.state}`,
        dedupeKey: `transition:${ev!.id}`,
        params: transitionParams(null, row, reason),
      });
    }
    return row;
  });
}
