import type { AccessContext } from '@cs/core';

/**
 * 15c-3a: the AccessContext a platform tool uses to run agency-side services (team.ts) on the agency it manages.
 * Build it ONLY inside a platform tool body, after `requirePlatformOperator` and `requireAgency` (i.e. inside `operate()`).
 * It never leaves the tool: not returned, not stored, not passed to the registry or to anything that writes audit rows.
 */
export function platformAgencyCtx(ctx: AccessContext, agencyId: string): AccessContext {
  return { ...ctx, agencyId, role: 'agency_admin', clientScope: 'all' };
}
