import type { BillingState } from '@cs/db';
import Link from 'next/link';
import { formatLongDate } from '@/components/billing/format';

const BILLING_HREF = '/agency/settings/billing';

/**
 * Phase 9a spec § Enforcement. Agency admins see trial and payment banners; account managers a neutral line while
 * payment is overdue (no amounts, dates or button); client roles and guests never see one. Copy is binding.
 */
export function BillingBanner({ role, state, trialEndsAt, pausesOn }: { role: string; state: BillingState; trialEndsAt: string | null; pausesOn: string | null }) {
  if (role === 'account_manager') {
    return state === 'past_due' || state === 'read_only' ? <Bar tone="danger">Your agency&apos;s account needs attention.</Bar> : null;
  }
  if (role !== 'agency_admin') return null;
  if (state === 'trialing' && trialEndsAt) {
    return (
      <Bar tone="info" action="Add payment method">
        Your trial ends {formatLongDate(trialEndsAt)}. Add a payment method to keep going.
      </Bar>
    );
  }
  if (state === 'past_due') {
    return (
      <Bar tone="danger" action="Update payment method">
        {pausesOn ? `Payment needed — service pauses on ${formatLongDate(pausesOn)}.` : 'Payment needed.'}
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

function Bar({ tone, action, children }: { tone: 'info' | 'danger'; action?: string; children: string | string[] }) {
  const colours = tone === 'danger' ? 'bg-destructive text-white' : 'bg-muted-surface text-ink';
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
