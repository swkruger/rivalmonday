import type { BillingState } from '@cs/db';

/** The one platform-console label map for billing states (the agency-facing page words past_due differently). */
export const BILLING_STATE_LABEL: Record<BillingState, string> = {
  pilot: 'Pilot', trialing: 'Trial', active: 'Active', past_due: 'Past due', read_only: 'Paused', suspended: 'Suspended', cancelled: 'Cancelled',
};

const CLS: Record<BillingState, string> = {
  pilot: 'bg-[#EEF2F6] text-ink',
  trialing: 'bg-primary text-ink',
  active: 'bg-secondary text-white',
  past_due: 'bg-destructive text-white',
  read_only: 'bg-destructive text-white',
  suspended: 'bg-destructive text-white',
  cancelled: 'bg-[#EEF2F6] text-ink',
};

/** Text label + fill, never colour alone. */
export function BillingStatePill({ state }: { state: BillingState }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${CLS[state]}`}>{BILLING_STATE_LABEL[state]}</span>;
}
