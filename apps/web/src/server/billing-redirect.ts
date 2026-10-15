import type { BillingState } from '@cs/db';

export const BILLING_PATH = '/agency/settings/billing';
export const PAUSED_PATH = '/paused';

/**
 * Ruling R20 (suspended routing), pure so the layout's decision is unit-tested. `null` = render normally.
 * - Not suspended: nobody has a reason to be on `/paused`, so it sends them home.
 * - Suspended agency admin: everything redirects to the billing page (it, its CSV and its actions stay reachable). An
 *   unknown path is left alone rather than risk a loop.
 * - Suspended account manager, client users and guests: everything redirects to `/paused`.
 */
export function billingRedirectFor({ state, role, pathname }: { state: BillingState; role: string; pathname: string }): string | null {
  if (state !== 'suspended') return pathname === PAUSED_PATH ? '/' : null;
  if (role === 'agency_admin') {
    if (!pathname || pathname === BILLING_PATH || pathname.startsWith(`${BILLING_PATH}/`)) return null;
    return BILLING_PATH;
  }
  return pathname === PAUSED_PATH ? null : PAUSED_PATH;
}
