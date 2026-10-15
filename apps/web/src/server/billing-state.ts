import 'server-only';
import { agencyBilling, type BillingState } from '@cs/db';
import { eq } from 'drizzle-orm';
import { dbs } from './db';

const PAUSE_AFTER_MS = 7 * 86_400_000;

export interface BillingSnapshot {
  state: BillingState;
  trialEndsAt: string | null;
  /** past_due only: when service pauses (past-due start + 7 days, as `get_billing_summary` reports it). */
  pausesOn: string | null;
}

/** One cheap read for the shell (redirects and banners); the full summary also calls Stripe, so it is not used here. A missing row is a pilot. */
export async function billingSnapshotOf(agencyId: string): Promise<BillingSnapshot> {
  const [row] = await dbs().service
    .select({ state: agencyBilling.state, trialEndsAt: agencyBilling.trialEndsAt, pastDueSince: agencyBilling.pastDueSince })
    .from(agencyBilling)
    .where(eq(agencyBilling.agencyId, agencyId));
  const state = row?.state ?? 'pilot';
  return {
    state,
    trialEndsAt: row?.trialEndsAt?.toISOString() ?? null,
    pausesOn: state === 'past_due' && row?.pastDueSince ? new Date(row.pastDueSince.getTime() + PAUSE_AFTER_MS).toISOString() : null,
  };
}

export async function billingStateOf(agencyId: string): Promise<BillingState> {
  return (await billingSnapshotOf(agencyId)).state;
}
