import { describe, expect, it } from 'vitest';
import { BILLING_STATES, type AgencyBillingRow, type BillingState } from '@cs/db';
import { REASONS, nextBillingState, type BillingSignal } from './state';

const DAY = 86_400_000;
const NOW = new Date('2026-10-14T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const ahead = (ms: number) => new Date(NOW.getTime() + ms);

function row(state: BillingState, over: Partial<AgencyBillingRow> = {}): AgencyBillingRow {
  return {
    agencyId: 'a', state, planId: null, stripeCustomerId: null, stripeSubscriptionId: null, trialEndsAt: null,
    pilotEndsAt: null, pastDueSince: null, cancelAt: null, reviewFlaggedAt: null, billableSeatsSynced: null,
    seatSyncPending: false, attachedCouponId: null, seatCapExempt: false, lastStripeEventAt: null,
    stateChangedAt: ago(DAY), updatedAt: ago(DAY), ...over,
  };
}

const signals: Record<string, BillingSignal> = {
  subscription_active: { kind: 'subscription_active', now: NOW },
  payment_failed: { kind: 'payment_failed', now: NOW },
  cancelled_at_period_end: { kind: 'subscription_cancelled_at_period_end', at: ahead(10 * DAY), now: NOW },
  subscription_ended: { kind: 'subscription_ended', now: NOW },
  timer: { kind: 'timer', now: NOW, trialDays: 14 },
  grant_pilot: { kind: 'admin_grant_pilot', endsAt: ahead(30 * DAY), now: NOW },
  end_pilot: { kind: 'admin_end_pilot', now: NOW, trialDays: 14 },
  extend_trial: { kind: 'admin_extend_trial', until: ahead(7 * DAY), now: NOW },
};

// Expected resulting state (null = no change) for a bare row (no dates set) per state x signal.
const TABLE: Record<BillingState, Record<string, BillingState | null>> = {
  pilot: { subscription_active: 'active', payment_failed: null, cancelled_at_period_end: null, subscription_ended: 'past_due', timer: null, grant_pilot: 'pilot', end_pilot: 'trialing', extend_trial: null },
  trialing: { subscription_active: 'active', payment_failed: null, cancelled_at_period_end: 'cancelled', subscription_ended: 'past_due', timer: null, grant_pilot: 'pilot', end_pilot: null, extend_trial: 'trialing' },
  active: { subscription_active: null, payment_failed: 'past_due', cancelled_at_period_end: 'cancelled', subscription_ended: 'past_due', timer: null, grant_pilot: null, end_pilot: null, extend_trial: null },
  past_due: { subscription_active: 'active', payment_failed: null, cancelled_at_period_end: null, subscription_ended: null, timer: null, grant_pilot: 'pilot', end_pilot: null, extend_trial: 'trialing' },
  read_only: { subscription_active: 'active', payment_failed: null, cancelled_at_period_end: null, subscription_ended: null, timer: null, grant_pilot: 'pilot', end_pilot: null, extend_trial: null },
  suspended: { subscription_active: 'active', payment_failed: null, cancelled_at_period_end: null, subscription_ended: null, timer: null, grant_pilot: 'pilot', end_pilot: null, extend_trial: null },
  cancelled: { subscription_active: 'active', payment_failed: null, cancelled_at_period_end: 'cancelled', subscription_ended: 'past_due', timer: null, grant_pilot: 'pilot', end_pilot: null, extend_trial: null },
};

describe('nextBillingState table', () => {
  for (const state of BILLING_STATES) {
    for (const [name, signal] of Object.entries(signals)) {
      it(`${state} + ${name}`, () => {
        const t = nextBillingState(row(state), signal);
        const expected = TABLE[state][name];
        expect(t === null ? null : t.state).toBe(expected);
        if (t && t.state !== state) expect(t.patch.stateChangedAt).toEqual(NOW);
      });
    }
  }
});

describe('subscription_active', () => {
  it('clears past_due_since, cancel_at, review_flagged_at', () => {
    const t = nextBillingState(row('suspended', { pastDueSince: ago(130 * DAY), cancelAt: ago(131 * DAY), reviewFlaggedAt: ago(DAY) }), { kind: 'subscription_active' });
    expect(t?.state).toBe('active');
    expect(t?.patch).toMatchObject({ pastDueSince: null, cancelAt: null, reviewFlaggedAt: null });
    expect(t?.reason).toBe(REASONS.subscriptionActive);
  });
  it('active with a pending cancel_at clears it without a state change', () => {
    const t = nextBillingState(row('active', { cancelAt: ahead(DAY) }), { kind: 'subscription_active' });
    expect(t?.state).toBe('active');
    expect(t?.patch.cancelAt).toBeNull();
    expect(t?.patch.stateChangedAt).toBeUndefined();
  });
});

describe('payment_failed / subscription_ended / cancel', () => {
  it('payment_failed sets past_due_since = now', () => {
    const t = nextBillingState(row('active'), signals.payment_failed!);
    expect(t?.patch.pastDueSince).toEqual(NOW);
    expect(t?.reason).toBe(REASONS.paymentFailed);
  });
  it('subscription_ended sets past_due_since = now', () => {
    const t = nextBillingState(row('active'), signals.subscription_ended!);
    expect(t?.patch.pastDueSince).toEqual(NOW);
    expect(t?.reason).toBe(REASONS.subscriptionEnded);
  });
  it('subscription_ended forgets the subscription (R26): id, synced seats, pending sync', () => {
    const t = nextBillingState(row('active', { stripeSubscriptionId: 'sub_1', billableSeatsSynced: 2, seatSyncPending: true }), signals.subscription_ended!);
    expect(t?.state).toBe('past_due');
    expect(t?.patch).toMatchObject({ stripeSubscriptionId: null, billableSeatsSynced: null, seatSyncPending: false });
  });
  it.each(['past_due', 'read_only', 'suspended'] as const)('subscription_ended in %s keeps the state but still forgets the subscription', (state) => {
    const t = nextBillingState(row(state, { stripeSubscriptionId: 'sub_1', billableSeatsSynced: 1 }), signals.subscription_ended!);
    expect(t?.state).toBe(state);
    expect(t?.patch).toEqual({ stripeSubscriptionId: null, billableSeatsSynced: null, seatSyncPending: false });
    expect(t?.reason).toBe(REASONS.subscriptionEnded);
  });
  it('grant_pilot and extend_trial drop a (non-live, checked by the tool) subscription id', () => {
    const g = nextBillingState(row('past_due', { stripeSubscriptionId: 'sub_old', billableSeatsSynced: 1 }), signals.grant_pilot!);
    expect(g?.patch).toMatchObject({ stripeSubscriptionId: null, billableSeatsSynced: null, seatSyncPending: false });
    const x = nextBillingState(row('past_due', { stripeSubscriptionId: 'sub_old' }), signals.extend_trial!);
    expect(x?.patch).toMatchObject({ stripeSubscriptionId: null, billableSeatsSynced: null, seatSyncPending: false });
  });
  it('cancel at period end stores cancel_at', () => {
    const at = ahead(10 * DAY);
    const t = nextBillingState(row('active'), { kind: 'subscription_cancelled_at_period_end', at, now: NOW });
    expect(t?.patch.cancelAt).toEqual(at);
    expect(t?.reason).toBe(REASONS.cancelAtPeriodEnd);
  });
  it('cancel at period end with unchanged cancel_at is a no-op; changed one updates in place', () => {
    const at = ahead(10 * DAY);
    expect(nextBillingState(row('cancelled', { cancelAt: at }), { kind: 'subscription_cancelled_at_period_end', at, now: NOW })).toBeNull();
    const t = nextBillingState(row('cancelled', { cancelAt: at }), { kind: 'subscription_cancelled_at_period_end', at: ahead(20 * DAY), now: NOW });
    expect(t?.state).toBe('cancelled');
  });
});

describe('timer', () => {
  it('trialing past trial_ends_at without subscription -> past_due (trial_ended)', () => {
    const t = nextBillingState(row('trialing', { trialEndsAt: ago(1000) }), signals.timer!);
    expect(t).toMatchObject({ state: 'past_due', reason: REASONS.trialEnded });
    expect(t?.patch.pastDueSince).toEqual(NOW);
  });
  it('trialing exactly at trial_ends_at triggers; one ms after now does not', () => {
    expect(nextBillingState(row('trialing', { trialEndsAt: NOW }), signals.timer!)?.state).toBe('past_due');
    expect(nextBillingState(row('trialing', { trialEndsAt: ahead(1) }), signals.timer!)).toBeNull();
  });
  it('trialing with a subscription or no trial_ends_at stays', () => {
    expect(nextBillingState(row('trialing', { trialEndsAt: ago(DAY), stripeSubscriptionId: 'sub_1' }), signals.timer!)).toBeNull();
    expect(nextBillingState(row('trialing'), signals.timer!)).toBeNull();
  });
  it('pilot ended -> trialing with trial_ends_at = now + trialDays', () => {
    const t = nextBillingState(row('pilot', { pilotEndsAt: ago(1) }), signals.timer!);
    expect(t).toMatchObject({ state: 'trialing', reason: REASONS.pilotEnded });
    expect(t?.patch.trialEndsAt).toEqual(new Date(NOW.getTime() + 14 * DAY));
  });
  it('pilot not yet ended / open-ended stays', () => {
    expect(nextBillingState(row('pilot', { pilotEndsAt: ahead(1) }), signals.timer!)).toBeNull();
    expect(nextBillingState(row('pilot'), signals.timer!)).toBeNull();
  });
  it('past_due -> read_only boundary at 7 d', () => {
    expect(nextBillingState(row('past_due', { pastDueSince: ago(7 * DAY - 60_000) }), signals.timer!)).toBeNull();
    expect(nextBillingState(row('past_due', { pastDueSince: ago(7 * DAY) }), signals.timer!)).toMatchObject({ state: 'read_only', reason: REASONS.pastDue7d });
  });
  it('read_only -> suspended boundary at 37 d from past_due_since', () => {
    expect(nextBillingState(row('read_only', { pastDueSince: ago(37 * DAY - 60_000) }), signals.timer!)).toBeNull();
    expect(nextBillingState(row('read_only', { pastDueSince: ago(37 * DAY) }), signals.timer!)).toMatchObject({ state: 'suspended', reason: REASONS.readOnly37d });
  });
  it('suspended flags for review at 127 d, once', () => {
    expect(nextBillingState(row('suspended', { pastDueSince: ago(127 * DAY - 60_000) }), signals.timer!)).toBeNull();
    const t = nextBillingState(row('suspended', { pastDueSince: ago(127 * DAY) }), signals.timer!);
    expect(t).toMatchObject({ state: 'suspended', reason: REASONS.review127d });
    expect(t?.patch.reviewFlaggedAt).toEqual(NOW);
    expect(t?.patch.stateChangedAt).toBeUndefined();
    expect(nextBillingState(row('suspended', { pastDueSince: ago(130 * DAY), reviewFlaggedAt: ago(DAY) }), signals.timer!)).toBeNull();
  });
  it('returns at most one step per call (past_due at 200 d -> read_only only)', () => {
    expect(nextBillingState(row('past_due', { pastDueSince: ago(200 * DAY) }), signals.timer!)?.state).toBe('read_only');
  });
  it('past_due without past_due_since is a no-op', () => {
    expect(nextBillingState(row('past_due'), signals.timer!)).toBeNull();
  });
  it('cancelled past cancel_at -> past_due with past_due_since = cancel_at', () => {
    const cancelAt = ago(2 * DAY);
    const t = nextBillingState(row('cancelled', { cancelAt }), signals.timer!);
    expect(t).toMatchObject({ state: 'past_due', reason: REASONS.cancelAtReached });
    expect(t?.patch.pastDueSince).toEqual(cancelAt);
  });
  it('cancelled before cancel_at stays', () => {
    expect(nextBillingState(row('cancelled', { cancelAt: ahead(DAY) }), signals.timer!)).toBeNull();
  });
});

describe('admin signals', () => {
  it('end_pilot -> trialing with trial_ends_at = now + trialDays', () => {
    const t = nextBillingState(row('pilot'), signals.end_pilot!);
    expect(t?.state).toBe('trialing');
    expect(t?.patch.trialEndsAt).toEqual(new Date(NOW.getTime() + 14 * DAY));
    expect(t?.reason).toBe(REASONS.endPilot);
  });
  it('grant_pilot is refused from active; from pilot it updates pilot_ends_at', () => {
    expect(nextBillingState(row('active'), signals.grant_pilot!)).toBeNull();
    const endsAt = ahead(60 * DAY);
    const t = nextBillingState(row('pilot', { pilotEndsAt: ahead(DAY) }), { kind: 'admin_grant_pilot', endsAt, now: NOW });
    expect(t?.state).toBe('pilot');
    expect(t?.patch.pilotEndsAt).toEqual(endsAt);
    expect(t?.reason).toBe(REASONS.grantPilot);
  });
  it('grant_pilot with null endsAt is open-ended and clears dunning fields', () => {
    const t = nextBillingState(row('read_only', { pastDueSince: ago(10 * DAY) }), { kind: 'admin_grant_pilot', endsAt: null, now: NOW });
    expect(t?.patch).toMatchObject({ pilotEndsAt: null, pastDueSince: null, cancelAt: null, reviewFlaggedAt: null });
  });
  it('extend_trial only from trialing/past_due; past_due also clears past_due_since', () => {
    const until = ahead(7 * DAY);
    for (const s of BILLING_STATES) {
      const t = nextBillingState(row(s), { kind: 'admin_extend_trial', until, now: NOW });
      expect(t === null).toBe(s !== 'trialing' && s !== 'past_due');
    }
    const t = nextBillingState(row('past_due', { pastDueSince: ago(3 * DAY) }), { kind: 'admin_extend_trial', until, now: NOW });
    expect(t?.state).toBe('trialing');
    expect(t?.patch).toMatchObject({ trialEndsAt: until, pastDueSince: null });
    expect(t?.reason).toBe(REASONS.extendTrial);
  });
});
