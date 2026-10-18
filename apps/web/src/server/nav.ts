import { type AccessContext, hasFeature, isAgencyRole } from '@cs/core';
import { registry } from './tools';
import { type NavContext, type NavCounts, type NavRoleFlags, type NavSection, navFor } from '@/components/shell/nav-items';

export type { NavSection };

export function homePath(ctx: AccessContext): string {
  return isAgencyRole(ctx.role) || ctx.clientScope === 'all' ? '/agency' : `/c/${ctx.clientScope[0]}`;
}

/** Reduces a viewer's `AccessContext` to the plain flags `navFor` needs, so client components never import `@cs/core`. */
export function navFlagsFor(v: { kind: 'user' | 'guest' | 'support'; ctx: AccessContext; email?: string }, isPlatformOperator = false, assistantName = 'Friday', isPlatformOwner = false): NavRoleFlags {
  return {
    isAgency: isAgencyRole(v.ctx.role),
    isAgencyAdmin: v.ctx.role === 'agency_admin',
    isUser: v.kind === 'user',
    homePath: homePath(v.ctx),
    // Resolved by the caller via `@cs/tools` `isPlatformOperator` (env list or active platform_admin row); guests never.
    isPlatformOperator: v.kind === 'user' && isPlatformOperator,
    isPlatformOwner: v.kind === 'user' && isPlatformOperator && isPlatformOwner,
    // Phase 11c: the Leads entry is for agency users who cover every client (the lead tools refuse everyone else).
    leads: isAgencyRole(v.ctx.role) && v.ctx.clientScope === 'all',
    dashboard: hasFeature(v.ctx, 'dashboard'),
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

/** Server-side convenience wrapper over `navFor` (15a P3: renamed from `navFor`) — one context's menu for a viewer, used by tests and anywhere the live pathname isn't needed. */
export function navForViewer(v: { kind: 'user' | 'guest' | 'support'; ctx: AccessContext; email?: string }, context: NavContext, clientId: string | null, isPlatformOperator = false, isPlatformOwner = false, counts?: NavCounts): NavSection[] {
  return navFor(context, navFlagsFor(v, isPlatformOperator, 'Friday', isPlatformOwner), clientId, counts);
}

/**
 * Phase 11c: the New-leads badge count, read through `list_leads`. Never throws: a failed read only hides the badge
 * (the shell must render). Only called for viewers whose `navFlagsFor(...).leads` is true.
 */
export async function newLeadsCount(ctx: AccessContext): Promise<number> {
  try {
    const { leads } = (await registry().invoke(ctx, 'list_leads', { status: 'verified' })) as { leads: unknown[] };
    return leads.length;
  } catch {
    return 0;
  }
}
