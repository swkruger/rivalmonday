import { type AccessContext, canManageCompetitors, hasFeature, isAgencyRole } from '@cs/core';
import { type NavItem, type NavRoleFlags, navItemsFor } from '@/components/shell/nav-items';

export type { NavItem };

export function homePath(ctx: AccessContext): string {
  return isAgencyRole(ctx.role) || ctx.clientScope === 'all' ? '/agency' : `/c/${ctx.clientScope[0]}`;
}

/** Reduces a viewer's `AccessContext` to the plain flags `navItemsFor` needs, so client components never import `@cs/core`. */
export function navFlagsFor(v: { kind: 'user' | 'guest'; ctx: AccessContext; email?: string }, isPlatformOperator = false, assistantName = 'Friday'): NavRoleFlags {
  return {
    isAgency: isAgencyRole(v.ctx.role),
    isAgencyAdmin: v.ctx.role === 'agency_admin',
    isUser: v.kind === 'user',
    homePath: homePath(v.ctx),
    // Resolved by the caller via `@cs/tools` `isPlatformOperator` (env list or active platform_admin row); guests never.
    isPlatformOperator: v.kind === 'user' && isPlatformOperator,
    dashboard: hasFeature(v.ctx, 'dashboard'),
    manageCompetitors: canManageCompetitors(v.ctx),
    alertRules: hasFeature(v.ctx, 'alert_rules'),
    mcp: v.kind === 'user' && hasFeature(v.ctx, 'mcp'),
    // Q2: guests have no Ask (and a magic-link contact id is never a thread author).
    ask: v.kind === 'user' && !v.ctx.userId.startsWith('contact:') && hasFeature(v.ctx, 'ask'),
    assistantName,
  };
}

/** Server-side convenience wrapper over `navItemsFor` — still used by tests and anywhere a one-shot list (not live-pathname-aware) is enough. */
export function navFor(v: { kind: 'user' | 'guest'; ctx: AccessContext; email?: string }, clientId: string | null, isPlatformOperator = false): NavItem[] {
  return navItemsFor(navFlagsFor(v, isPlatformOperator), clientId);
}
