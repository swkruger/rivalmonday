import type { AgencyBillingRow, BillingState } from '@cs/db';

export type { BillingState };

/** Cumulative thresholds are measured from `past_due_since`: read_only at 7 d, suspended at 37 d, review flag at 127 d. */
export const PAST_DUE_TO_READ_ONLY_DAYS = 7;
export const READ_ONLY_TO_SUSPENDED_DAYS = 30;
export const SUSPENDED_TO_REVIEW_DAYS = 90;

const DAY_MS = 86_400_000;
const READ_ONLY_AT_MS = PAST_DUE_TO_READ_ONLY_DAYS * DAY_MS;
const SUSPENDED_AT_MS = (PAST_DUE_TO_READ_ONLY_DAYS + READ_ONLY_TO_SUSPENDED_DAYS) * DAY_MS;
const REVIEW_AT_MS = (PAST_DUE_TO_READ_ONLY_DAYS + READ_ONLY_TO_SUSPENDED_DAYS + SUSPENDED_TO_REVIEW_DAYS) * DAY_MS;

/** Stable transition reasons (written to `agency_billing_event.reason`; later tasks reference these, not literals). */
export const REASONS = {
  subscriptionActive: 'signal:subscription_active',
  paymentFailed: 'signal:payment_failed',
  subscriptionEnded: 'signal:subscription_ended',
  cancelAtPeriodEnd: 'signal:cancel_at_period_end',
  trialEnded: 'timer:trial_ended',
  pastDue7d: 'timer:past_due_7d',
  readOnly37d: 'timer:read_only_37d',
  review127d: 'timer:review_127d',
  pilotEnded: 'timer:pilot_ended',
  cancelAtReached: 'timer:cancel_at_reached',
  grantPilot: 'admin:grant_pilot',
  endPilot: 'admin:end_pilot',
  extendTrial: 'admin:extend_trial',
} as const;
export type BillingReason = (typeof REASONS)[keyof typeof REASONS];

/** Signals carry `now`/`trialDays` so the function stays pure and deterministic. */
export type BillingSignal =
  | { kind: 'subscription_active'; now?: Date }
  | { kind: 'payment_failed'; now: Date }
  | { kind: 'subscription_cancelled_at_period_end'; at: Date; now: Date }
  | { kind: 'subscription_ended'; now: Date }
  | { kind: 'timer'; now: Date; trialDays: number }
  | { kind: 'admin_grant_pilot'; endsAt: Date | null; now: Date }
  | { kind: 'admin_end_pilot'; now: Date; trialDays: number }
  | { kind: 'admin_extend_trial'; until: Date; now: Date };

export type BillingTransition = { state: BillingState; patch: Partial<AgencyBillingRow>; reason: BillingReason };

const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY_MS);

/**
 * R26: an ended subscription is forgotten in the same transaction that records the end, so reconcile, seat sync, the
 * trial timer and the checkout live-subscription check (R22) never act on it again. Also applied by the staff
 * grant-pilot / extend-trial signals, whose tools first verify the stored subscription is not live.
 */
export const FORGET_SUBSCRIPTION = { stripeSubscriptionId: null, billableSeatsSynced: null, seatSyncPending: false } as const satisfies Partial<AgencyBillingRow>;
const holdsSubscription = (row: AgencyBillingRow) => row.stripeSubscriptionId !== null || row.billableSeatsSynced !== null || row.seatSyncPending;

/** Build a transition; `stateChangedAt` is set only when the state changes and a clock is available. */
function step(row: AgencyBillingRow, state: BillingState, reason: BillingReason, patch: Partial<AgencyBillingRow>, now?: Date): BillingTransition {
  return { state, reason, patch: state !== row.state && now ? { ...patch, stateChangedAt: now } : patch };
}

function onTimer(row: AgencyBillingRow, s: Extract<BillingSignal, { kind: 'timer' }>): BillingTransition | null {
  const { now } = s;
  switch (row.state) {
    case 'trialing':
      if (row.trialEndsAt && row.trialEndsAt <= now && !row.stripeSubscriptionId) {
        return step(row, 'past_due', REASONS.trialEnded, { pastDueSince: now }, now);
      }
      return null;
    case 'pilot':
      if (row.pilotEndsAt && row.pilotEndsAt <= now) {
        return step(row, 'trialing', REASONS.pilotEnded, { trialEndsAt: addDays(now, s.trialDays) }, now);
      }
      return null;
    case 'cancelled':
      if (row.cancelAt && row.cancelAt <= now) {
        return step(row, 'past_due', REASONS.cancelAtReached, { pastDueSince: row.cancelAt }, now);
      }
      return null;
    case 'past_due':
    case 'read_only':
    case 'suspended': {
      if (!row.pastDueSince) return null;
      const elapsed = now.getTime() - row.pastDueSince.getTime();
      if (row.state === 'past_due') {
        return elapsed >= READ_ONLY_AT_MS ? step(row, 'read_only', REASONS.pastDue7d, {}, now) : null;
      }
      if (row.state === 'read_only') {
        return elapsed >= SUSPENDED_AT_MS ? step(row, 'suspended', REASONS.readOnly37d, {}, now) : null;
      }
      if (elapsed >= REVIEW_AT_MS && !row.reviewFlaggedAt) {
        return step(row, 'suspended', REASONS.review127d, { reviewFlaggedAt: now }, now);
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Pure billing state machine (spec § State machine). `null` = no change. A `timer` signal advances at most
 * one step per call. Persisting, event logging and emails belong to `applyBillingSignal` (Task 4).
 */
export function nextBillingState(row: AgencyBillingRow, s: BillingSignal): BillingTransition | null {
  switch (s.kind) {
    case 'subscription_active': {
      const nothingToClear = row.pastDueSince === null && row.cancelAt === null && row.reviewFlaggedAt === null;
      if (row.state === 'active' && nothingToClear) return null;
      return step(row, 'active', REASONS.subscriptionActive, { pastDueSince: null, cancelAt: null, reviewFlaggedAt: null }, s.now);
    }
    case 'payment_failed':
      return row.state === 'active' ? step(row, 'past_due', REASONS.paymentFailed, { pastDueSince: s.now }, s.now) : null;
    case 'subscription_cancelled_at_period_end': {
      if (row.state === 'cancelled') {
        return row.cancelAt?.getTime() === s.at.getTime() ? null : step(row, 'cancelled', REASONS.cancelAtPeriodEnd, { cancelAt: s.at }, s.now);
      }
      if (row.state !== 'active' && row.state !== 'trialing') return null;
      return step(row, 'cancelled', REASONS.cancelAtPeriodEnd, { cancelAt: s.at }, s.now);
    }
    case 'subscription_ended':
      if (row.state === 'past_due' || row.state === 'read_only' || row.state === 'suspended') {
        // Already unpaid: the dunning clock keeps running, but the subscription is still forgotten.
        return holdsSubscription(row) ? step(row, row.state, REASONS.subscriptionEnded, { ...FORGET_SUBSCRIPTION }, s.now) : null;
      }
      return step(row, 'past_due', REASONS.subscriptionEnded, { pastDueSince: s.now, ...FORGET_SUBSCRIPTION }, s.now);
    case 'timer':
      return onTimer(row, s);
    case 'admin_grant_pilot':
      if (row.state === 'active') return null;
      return step(row, 'pilot', REASONS.grantPilot, { pilotEndsAt: s.endsAt, pastDueSince: null, cancelAt: null, reviewFlaggedAt: null, ...FORGET_SUBSCRIPTION }, s.now);
    case 'admin_end_pilot':
      return row.state === 'pilot' ? step(row, 'trialing', REASONS.endPilot, { trialEndsAt: addDays(s.now, s.trialDays) }, s.now) : null;
    case 'admin_extend_trial':
      if (row.state === 'trialing') return step(row, 'trialing', REASONS.extendTrial, { trialEndsAt: s.until, ...FORGET_SUBSCRIPTION }, s.now);
      if (row.state === 'past_due') return step(row, 'trialing', REASONS.extendTrial, { trialEndsAt: s.until, pastDueSince: null, ...FORGET_SUBSCRIPTION }, s.now);
      return null;
  }
}
