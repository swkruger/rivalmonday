import { type AccessContext, hasChannel, hasFeature, isAgencyRole } from '@cs/core';
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
    mcp: v.kind === 'user' && hasChannel(v.ctx, 'mcp'),
    // 15b-1: `/c/<id>/settings/ai` also serves a support session (read-only, owner names masked); guests 404 there.
    clientAi: (v.kind === 'user' || v.kind === 'support') && hasChannel(v.ctx, 'mcp'),
    // Q2: guests have no Ask (and a magic-link contact id is never a thread author). Phase 8b: a support viewer sees
    // the module, which only says Ask conversations are private to their authors.
    ask: (v.kind === 'user' || v.kind === 'support') && !v.ctx.userId.startsWith('contact:') && hasChannel(v.ctx, 'ask'),
    assistantName,
    // Phase 8b M2: the operator's own inbox is not part of the agency view (`/inbox` 404s in a session).
    inbox: v.kind !== 'support',
  };
}

/** Server-side convenience wrapper over `navFor` (15a P3: renamed from `navFor`) — one context's menu for a viewer, used by tests and anywhere the live pathname isn't needed. */
export function navForViewer(v: { kind: 'user' | 'guest' | 'support'; ctx: AccessContext; email?: string }, context: NavContext, clientId: string | null, isPlatformOperator = false, isPlatformOwner = false, counts?: NavCounts): NavSection[] {
  return navFor(context, navFlagsFor(v, isPlatformOperator, 'Friday', isPlatformOwner), clientId, counts);
}

type AgencyCounts = { approvals: number; alerts: number; leads: number };
type PlatformCounts = { modelReviews: number; themes: number };

/**
 * 15a P2: the sidebar's badge counts — one `get_nav_counts` read (agency viewers) and one `get_platform_nav_counts` read
 * (platform operators, plus Phase 14a's cheap `count_catalog_review` for the Business types badge), in parallel. Never throws: a failed read only omits its badges (the shell must render).
 * `leads` (= `navFlagsFor(...).leads`) keeps the Leads count off for viewers who don't see the entry.
 */
export async function navCounts(ctx: AccessContext, opts: { agency: boolean; operator: boolean; leads: boolean }): Promise<NavCounts> {
  const read = async <T>(tool: string): Promise<T | null> => {
    try {
      return (await registry().invoke(ctx, tool, {})) as T;
    } catch {
      return null;
    }
  };
  const [agency, platform, catalog] = await Promise.all([
    opts.agency ? read<AgencyCounts>('get_nav_counts') : null,
    opts.operator ? read<PlatformCounts>('get_platform_nav_counts') : null,
    // Phase 14a: the Business types badge (business types and services waiting for operator review).
    opts.operator ? read<{ count: number }>('count_catalog_review') : null,
  ]);
  const out: NavCounts = {};
  if (agency) {
    out.approvals = agency.approvals;
    out.alerts = agency.alerts;
    if (opts.leads) out.leads = agency.leads;
  }
  if (platform) Object.assign(out, { modelReviews: platform.modelReviews, themes: platform.themes });
  if (catalog) out.catalog = catalog.count;
  return out;
}
