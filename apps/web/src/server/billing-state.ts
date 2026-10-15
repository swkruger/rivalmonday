import 'server-only';
import { agencyBilling, type BillingState } from '@cs/db';
import { eq } from 'drizzle-orm';
import { cache } from 'react';
import { dbs } from './db';

const PAUSE_AFTER_MS = 7 * 86_400_000;

export interface BillingSnapshot {
  state: BillingState;
  trialEndsAt: string | null;
  /** past_due only: when service pauses (past-due start + 7 days, as `get_billing_summary` reports it). */
  pausesOn: string | null;
}

/** One cheap read for the shell (redirects and banners); the full summary also calls Stripe, so it is not used here. A missing row is a pilot. Cached per request so the layout, requireContext and pages share one query. */
export const billingSnapshotOf = cache(async (agencyId: string): Promise<BillingSnapshot> => {
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
});

export async function billingStateOf(agencyId: string): Promise<BillingState> {
  return (await billingSnapshotOf(agencyId)).state;
}

/** True when this viewer's agency is suspended. Support viewers (platform operators) are exempt; used by the route handlers outside (app) that serve data. */
export async function agencySuspended(viewer: { kind: string; ctx?: { agencyId: string } }): Promise<boolean> {
  if (viewer.kind === 'support' || viewer.kind === 'member-less' || !viewer.ctx) return false;
  return (await billingStateOf(viewer.ctx.agencyId)) === 'suspended';
}
