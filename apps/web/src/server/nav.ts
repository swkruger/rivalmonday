import { type AccessContext, canManageCompetitors, hasFeature, isAgencyRole } from '@cs/core';
import { type NavItem, type NavRoleFlags, navItemsFor } from '@/components/shell/nav-items';

export type { NavItem };

export function homePath(ctx: AccessContext): string {
  return isAgencyRole(ctx.role) || ctx.clientScope === 'all' ? '/agency' : `/c/${ctx.clientScope[0]}`;
}

/** Reduces a viewer's `AccessContext` to the plain flags `navItemsFor` needs, so client components never import `@cs/core`. */
export function navFlagsFor(v: { kind: 'user' | 'guest' | 'support'; ctx: AccessContext; email?: string }, isPlatformOperator = false, assistantName = 'Friday', isPlatformOwner = false): NavRoleFlags {
  return {
    isAgency: isAgencyRole(v.ctx.role),
    isAgencyAdmin: v.ctx.role === 'agency_admin',
    isUser: v.kind === 'user',
    homePath: homePath(v.ctx),
    // Resolved by the caller via `@cs/tools` `isPlatformOperator` (env list or active platform_admin row); guests never.
    isPlatformOperator: v.kind === 'user' && isPlatformOperator,
    isPlatformOwner: v.kind === 'user' && isPlatformOperator && isPlatformOwner,
    dashboard: hasFeature(v.ctx, 'dashboard'),
    manageCompetitors: canManageCompetitors(v.ctx),
    alertRules: hasFeature(v.ctx, 'alert_rules'),
    mcp: v.kind === 'user' && hasFeature(v.ctx, 'mcp'),
    // Q2: guests have no Ask (and a magic-link contact id is never a thread author). Phase 8b: a support viewer sees
    // the module, which only says Ask conversations are private to their authors.
    ask: (v.kind === 'user' || v.kind === 'support') && !v.ctx.userId.startsWith('contact:') && hasFeature(v.ctx, 'ask'),
    assistantName,
    // Phase 8b M2: the operator's own inbox is not part of the agency view (`/inbox` 404s in a session).
    inbox: v.kind !== 'support',
  };
}

/** Server-side convenience wrapper over `navItemsFor` — still used by tests and anywhere a one-shot list (not live-pathname-aware) is enough. */
export function navFor(v: { kind: 'user' | 'guest' | 'support'; ctx: AccessContext; email?: string }, clientId: string | null, isPlatformOperator = false, isPlatformOwner = false): NavItem[] {
  return navItemsFor(navFlagsFor(v, isPlatformOperator, 'Friday', isPlatformOwner), clientId);
}
