import { describe, expect, it } from 'vitest';
import { noticeEmailFor } from './notices';
import { REASONS } from './state';

const row = (kind: string, params: Record<string, unknown> = {}) => ({ kind, params });

describe('noticeEmailFor', () => {
  it('billing_trialing -> trial_started with trialEndsAt', () => {
    expect(noticeEmailFor(row('billing_trialing', { trialEndsAt: '2026-11-13T00:00:00.000Z' }))).toEqual({ kind: 'trial_started', date: '2026-11-13T00:00:00.000Z' });
  });
  it('billing_past_due maps trial-ended and payment-failed, date = pastDueSince + 7 days', () => {
    const pastDueSince = '2026-10-01T00:00:00.000Z';
    expect(noticeEmailFor(row('billing_past_due', { reason: REASONS.trialEnded, pastDueSince }))).toEqual({ kind: 'trial_ended', date: '2026-10-08T00:00:00.000Z' });
    expect(noticeEmailFor(row('billing_past_due', { reason: REASONS.paymentFailed, pastDueSince }))).toEqual({ kind: 'payment_failed', date: '2026-10-08T00:00:00.000Z' });
  });
  it.each([REASONS.subscriptionEnded, REASONS.cancelAtReached, REASONS.cancelAtPeriodEnd, undefined])('billing_past_due with reason %s sends nothing', (reason) => {
    expect(noticeEmailFor(row('billing_past_due', { reason, pastDueSince: '2026-10-01T00:00:00.000Z' }))).toBeNull();
  });
  it('billing_past_due without pastDueSince still maps (no date)', () => {
    expect(noticeEmailFor(row('billing_past_due', { reason: REASONS.paymentFailed }))).toEqual({ kind: 'payment_failed' });
  });
  it('maps read_only, suspended and active', () => {
    expect(noticeEmailFor(row('billing_read_only'))).toEqual({ kind: 'service_paused' });
    expect(noticeEmailFor(row('billing_suspended'))).toEqual({ kind: 'account_suspended' });
    expect(noticeEmailFor(row('billing_active'))).toEqual({ kind: 'account_reactivated' });
  });
  it('maps reminders', () => {
    expect(noticeEmailFor(row('reminder_trial_ending_7', { date: '2026-10-20' }))).toEqual({ kind: 'trial_ending_7' });
    expect(noticeEmailFor(row('reminder_trial_ending_1', { date: '2026-10-20' }))).toEqual({ kind: 'trial_ending_1' });
    expect(noticeEmailFor(row('reminder_pilot_ending_7', { date: '2026-10-20T00:00:00.000Z' }))).toEqual({ kind: 'pilot_ending_7', date: '2026-10-20T00:00:00.000Z' });
  });
  it.each(['billing_pilot', 'billing_cancelled', 'billing_unknown', 'whatever'])('%s sends nothing', (kind) => {
    expect(noticeEmailFor(row(kind))).toBeNull();
  });
});
