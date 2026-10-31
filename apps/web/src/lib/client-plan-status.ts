import type { CLIENT_PLAN_STATUS } from '@/lib/labels';

/** What `get_my_billing` returns for the client's own plan (shared by the billing page and the profile summary). */
export interface MyBilling {
  agencyName: string;
  state: 'off' | 'invited' | 'active' | 'payment_needed' | 'cancelled' | 'disconnected';
  paused: boolean;
  enabled: boolean;
  nextChargeDate: string | null;
  nextChargeAmountCents: number | null;
  endsOn: string | null;
  canManagePayment: boolean;
}

export type PlanStatus = keyof typeof CLIENT_PLAN_STATUS;

export function clientPlanStatus(b: MyBilling): { status: PlanStatus; detail: string | null } {
  if (b.paused) return { status: 'paused', detail: `Monitoring is paused. Please contact ${b.agencyName}.` };
  if (!b.enabled) return { status: 'not_set_up', detail: `Billing is not set up for this workspace. Please contact ${b.agencyName} with any questions.` };
  switch (b.state) {
    case 'active': return { status: 'active', detail: null };
    case 'payment_needed': return { status: 'payment_needed', detail: 'Your last payment did not go through. Please update your payment method.' };
    case 'invited': return { status: 'invited', detail: `Check your email for the payment link from ${b.agencyName}.` };
    case 'cancelled': return { status: 'cancelled', detail: null };
    default: return { status: 'unavailable', detail: `Please contact ${b.agencyName} about your billing.` };
  }
}
