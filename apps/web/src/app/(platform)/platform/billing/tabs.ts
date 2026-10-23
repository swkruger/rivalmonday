export const TABS = ['overview', 'plans', 'codes', 'signups', 'connect'] as const;
export type BillingTab = (typeof TABS)[number];
export const TAB_LABEL: Record<BillingTab, string> = { overview: 'Overview', plans: 'Plans', codes: 'Discount codes', signups: 'Sign-up & invites', connect: 'Stripe Connect' };

/** `?tab=` -> a known tab; anything else (missing, repeated, unknown) is the overview. (Not in page.tsx: a Next page may only export its page fields.) */
export function billingTab(raw: string | string[] | undefined): BillingTab {
  return typeof raw === 'string' && (TABS as readonly string[]).includes(raw) ? (raw as BillingTab) : 'overview';
}
