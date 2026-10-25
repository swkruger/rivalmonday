import { formatDate } from '@/lib/format';
import { HOLD_MESSAGE } from '@cs/billing';
import type { BillingState } from '@cs/db';
import Link from 'next/link';

const BILLING_HREF = '/agency/settings/billing';

/**
 * Phase 9a spec § Enforcement. Agency admins see trial and payment banners; account managers a neutral line while
 * payment is overdue (no amounts, dates or button); client roles and guests never see one. Copy is binding.
 */
export function BillingBanner({ role, state, trialEndsAt, pausesOn, onHold = false, supportEmail }: { role: string; state: BillingState; trialEndsAt: string | null; pausesOn: string | null; onHold?: boolean; supportEmail: string }) {
  // Platform hold (15c-3a): every agency role sees the hold sentence; Stripe-state banners are suppressed.
  if (onHold && (role === 'agency_admin' || role === 'account_manager')) return <Bar tone="warning">{HOLD_MESSAGE(supportEmail)}</Bar>;
  if (onHold && role.startsWith('client_')) return <Bar tone="danger">Your agency&apos;s account needs attention.</Bar>;
  if (role === 'account_manager') {
    return state === 'past_due' || state === 'read_only' ? <Bar tone="danger">Your agency&apos;s account needs attention.</Bar> : null;
  }
  if (role !== 'agency_admin') return null;
  if (state === 'trialing' && trialEndsAt) {
    return (
      <Bar tone="info" action="Add payment method">
        Your trial ends {formatDate(trialEndsAt, { tz: 'UTC' })}. Add a payment method to keep going.
      </Bar>
    );
  }
  if (state === 'past_due') {
    return (
      <Bar tone="danger" action="Update payment method">
        {pausesOn ? `Payment needed — service pauses on ${formatDate(pausesOn, { tz: 'UTC' })}.` : 'Payment needed.'}
      </Bar>
    );
  }
  if (state === 'read_only') {
    return (
      <Bar tone="danger" action="Update payment method">
        Service is paused. Update your payment method to resume.
      </Bar>
    );
  }
  return null;
}

function Bar({ tone, action, children }: { tone: 'info' | 'warning' | 'danger'; action?: string; children: string | string[] }) {
  const colours = tone === 'danger' ? 'bg-destructive text-white' : tone === 'warning' ? 'bg-chip-warning-bg text-chip-warning-text' : 'bg-muted-surface text-ink';
  return (
    <div role="region" aria-label="Billing" data-tone={tone} className={`flex flex-wrap items-center gap-3 px-4 py-2 text-sm font-semibold lg:px-7 ${colours}`}>
      <span>{children}</span>
      {action && (
        <Link href={BILLING_HREF} className="rounded-md bg-white px-3 py-1 text-xs font-bold text-ink hover:opacity-90">
          {action}
        </Link>
      )}
    </div>
  );
}
