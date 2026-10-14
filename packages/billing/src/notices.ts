import { PAST_DUE_TO_READ_ONLY_DAYS, REASONS } from './state';

/** Mirrors `BillingNoticeKind` in @cs/email (billing does not depend on the email package). */
export type BillingNoticeEmailKind =
  | 'trial_started'
  | 'trial_ending_7'
  | 'trial_ending_1'
  | 'trial_ended'
  | 'payment_failed'
  | 'service_paused'
  | 'account_suspended'
  | 'account_reactivated'
  | 'pilot_ending_7';

export interface NoticeEmail {
  kind: BillingNoticeEmailKind;
  /** ISO timestamp; the template renders it human-readable. */
  date?: string;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/** Phase 9a P4/R15: which lifecycle email (if any) a `billing_notice` outbox row produces. `null` means no email. */
export function noticeEmailFor(row: { kind: string; params: unknown }): NoticeEmail | null {
  const p = (row.params && typeof row.params === 'object' ? row.params : {}) as Record<string, unknown>;
  switch (row.kind) {
    case 'billing_trialing': {
      const date = str(p.trialEndsAt);
      return { kind: 'trial_started', ...(date && { date }) };
    }
    case 'billing_past_due': {
      const kind = p.reason === REASONS.trialEnded ? 'trial_ended' : p.reason === REASONS.paymentFailed ? 'payment_failed' : null;
      if (!kind) return null;
      const sinceStr = str(p.pastDueSince);
      const since = sinceStr ? new Date(sinceStr) : null;
      const date = since && !Number.isNaN(since.getTime()) ? new Date(since.getTime() + PAST_DUE_TO_READ_ONLY_DAYS * 86_400_000).toISOString() : undefined;
      return { kind, ...(date && { date }) };
    }
    case 'billing_read_only':
      return { kind: 'service_paused' };
    case 'billing_suspended':
      return { kind: 'account_suspended' };
    case 'billing_active':
      return { kind: 'account_reactivated' };
    case 'reminder_trial_ending_7':
      return { kind: 'trial_ending_7' };
    case 'reminder_trial_ending_1':
      return { kind: 'trial_ending_1' };
    case 'reminder_pilot_ending_7': {
      const date = str(p.date);
      return { kind: 'pilot_ending_7', ...(date && { date }) };
    }
    default:
      return null;
  }
}
