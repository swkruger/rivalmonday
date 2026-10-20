/**
 * Pure, client-safe nav building blocks (Phase 15a §2.2–§2.5). No server-only imports (not even `@cs/core`, whose
 * barrel pulls in `node:crypto` via `links.ts`) so this module can be imported from the 'use client' sidebar nav and
 * switcher without bundling server code. The server (`@/server/nav`) reduces `AccessContext` down to the plain
 * `NavRoleFlags` below and calls the same `navFor` so both sides agree on the menus.
 *
 * Sidebar visibility is cosmetic: the tools behind each page decide access (refusals 404).
 */
import type { NavContext } from './nav-context';

export { clientIdFromPath, contextOf, NAV_CTX_COOKIE, type NavContext, parseNavCookie } from './nav-context';

export type IconKey =
  | 'clients' | 'overview' | 'inbox' | 'team' | 'branding' | 'webhooks' | 'bell' | 'delivery' | 'profile' | 'competitors' | 'changes' | 'moves' | 'pricing' | 'ads' | 'rankings' | 'reputation' | 'approvals' | 'alerts' | 'recommendations'
  | 'alertRules' | 'ai' | 'usage' | 'runbook' | 'reviews' | 'themes' | 'prospects' | 'ask' | 'knowledge'
  | 'platform' | 'agencies' | 'health' | 'costs' | 'platformAccess' | 'billing' | 'leads' | 'intake' | 'briefs' | 'settings' | 'catalogue';

export interface NavItem {
  href: string;
  label: string;
  icon: IconKey;
  /** Rendered as the assistant pill after the label's first word ("Ask" + the orange "Friday" pill). */
  pill?: string;
  /** A small count badge after the label; omitted (never 0) when there is nothing waiting. */
  count?: number;
  /** The path this item highlights under, when it differs from `href` (the settings entries link to their first tab). */
  match?: string;
}

/** A labelled group of the sidebar (or a settings sub-nav). `label: null` = no heading; `foot` is pinned to the bottom. */
export interface NavSection {
  id: string;
  label: string | null;
  items: NavItem[];
  placement?: 'top' | 'foot';
}

/** Badge counts (Task 3 fills them); a missing or zero count shows no badge. */
export interface NavCounts {
  approvals?: number;
  alerts?: number;
  leads?: number;
  modelReviews?: number;
  themes?: number;
  /** Phase 14a: business types and services waiting for operator review (Business types badge). */
  catalog?: number;
}

/** Role/kind booleans plus the fixed home path for non-agency roles — everything `navFor` needs besides the context and client id. */
export interface NavRoleFlags {
  isAgency: boolean;
  isAgencyAdmin: boolean;
  isUser: boolean;
  homePath: string;
  /** 5b-2 decision 2 / 8a d2: env-listed or an active `platform_admin` row (resolved server-side). */
  isPlatformOperator?: boolean;
  /** 8c: the platform role is `owner` (env-listed or an owner row); only owners see Costs. */
  isPlatformOwner?: boolean;
  /** 5c-1 decision 2 — always true for agency roles. */
  dashboard: boolean;
  alertRules: boolean;
  mcp: boolean;
  /** 6b: signed-in users with the `ask` feature (never guests, Q2). */
  ask?: boolean;
  /** 6b e10: the agency's assistant name ("Friday" when unset). */
  assistantName?: string;
  /** Phase 8b M2: false inside a support session (`/inbox` 404s there); omitted means shown. Used by the top bar (15a Task 5). */
  inbox?: boolean;
  /** 9b: a client owner with billing switched on for their client sees the Billing tab. */
  clientBilling?: boolean;
  /** Phase 11c: agency users who cover all clients see the Leads entry (agency admin or scope `all`). */
  leads?: boolean;
  /** Phase 8b: inside a support session, the operator's way back to the agency's console page. Owned by the switcher (15a Task 5), not a nav item. */
  backToPlatform?: string;
}

type Add = (href: string, label: string, icon: IconKey, extra?: { pill?: string; count?: number; match?: string }) => void;

/** Builds one section; returns null when every item was gated out, so empty groups never render. */
function section(id: string, label: string | null, fill: (add: Add) => void, placement?: 'top' | 'foot'): NavSection | null {
  const items: NavItem[] = [];
  fill((href, itemLabel, icon, extra) => {
    const item: NavItem = { href, label: itemLabel, icon };
    if (extra?.pill) item.pill = extra.pill;
    if (extra?.count) item.count = extra.count;
    if (extra?.match && extra.match !== href) item.match = extra.match;
    items.push(item);
  });
  if (!items.length) return null;
  return placement ? { id, label, items, placement } : { id, label, items };
}

const compact = (sections: (NavSection | null)[]): NavSection[] => sections.filter((s): s is NavSection => s !== null);

/** The client base path: client roles and guests always use their own client (homePath); agency roles the open one. */
function clientBase(flags: NavRoleFlags, clientId: string | null | undefined): string | null {
  if (!flags.isAgency && flags.homePath.startsWith('/c/')) return flags.homePath;
  return clientId ? `/c/${clientId}` : null;
}

/** Spec §2.3: the sidebar menu for one context. Empty when the viewer has no such context (or no client is open). */
export function navFor(context: NavContext, flags: NavRoleFlags, clientId: string | null, counts: NavCounts = {}): NavSection[] {
  if (context === 'platform') return flags.isPlatformOperator ? platformNav(flags, counts) : [];
  if (context === 'agency') return flags.isAgency ? agencyNav(flags, counts) : [];
  const base = clientBase(flags, clientId);
  return base ? clientNav(flags, base) : [];
}

function platformNav(flags: NavRoleFlags, counts: NavCounts): NavSection[] {
  // Health stays hidden until Phase 7.
  return compact([
    section('top', null, (add) => add('/platform', 'Overview', 'platform'), 'top'),
    section('customers', 'Customers', (add) => {
      add('/platform/agencies', 'Agencies', 'agencies');
      add('/platform/leads', 'Lead pool', 'leads');
    }),
    section('revenue', 'Revenue', (add) => add('/platform/billing', 'Billing & plans', 'billing')),
    section('quality', 'Quality', (add) => {
      add('/platform/reviews', 'Model reviews', 'reviews', { count: counts.modelReviews });
      add('/platform/themes', 'Theme proposals', 'themes', { count: counts.themes });
      add('/platform/ask', 'Ask reviews', 'ask');
    }),
    section('content', 'Content', (add) => {
      add('/platform/knowledge', 'Knowledge', 'knowledge');
      add('/platform/verticals', 'Business types', 'catalogue', { count: counts.catalog });
      add('/platform/runbook', 'Runbook', 'runbook');
    }),
    section('system', 'System', (add) => {
      if (flags.isPlatformOwner) add('/platform/costs', 'Costs', 'costs');
    }),
  ]);
}

function agencyNav(flags: NavRoleFlags, counts: NavCounts): NavSection[] {
  return compact([
    section('top', null, (add) => add('/agency', 'Portfolio', 'clients'), 'top'),
    section('work', 'Work', (add) => {
      add('/agency/approvals', 'Approvals', 'approvals', { count: counts.approvals });
      add('/agency/alerts', 'Alert review', 'alerts', { count: counts.alerts });
    }),
    section('growth', 'Growth', (add) => {
      add('/agency/prospects', 'Prospects', 'prospects');
      if (flags.leads) add('/agency/leads', 'Leads', 'leads', { count: counts.leads });
    }),
    // Links straight to the first visible tab (no blank index page in between); highlighted on every settings tab.
    section('foot', null, (add) => add(firstHref(agencySettings(flags)) ?? '/agency/settings', 'Agency settings', 'settings', { match: '/agency/settings' }), 'foot'),
  ]);
}

function clientNav(flags: NavRoleFlags, base: string): NavSection[] {
  const name = flags.assistantName?.trim() || 'Friday';
  // Client settings: agency roles; client roles when any tab is visible to them; never guests (§2.3).
  const settings = flags.isUser || flags.isAgency ? firstHref([clientSettings(flags, base)]) : null;
  return compact([
    section('top', null, (add) => {
      if (flags.ask) add(`${base}/ask`, `Ask ${name}`, 'ask', { pill: name });
      add(base, 'Overview', 'overview');
    }, 'top'),
    section('insights', 'Insights', (add) => {
      if (!flags.dashboard) return;
      add(`${base}/competitors`, 'Competitors', 'competitors');
      add(`${base}/changes`, 'Changes', 'changes');
      add(`${base}/pricing`, 'Pricing', 'pricing');
      add(`${base}/ads`, 'Ads', 'ads');
      add(`${base}/reviews`, 'Reviews', 'reputation');
      add(`${base}/rankings`, 'Local rankings', 'rankings');
      add(`${base}/moves`, 'Moves', 'moves');
    }),
    section('act', 'Act', (add) => {
      add(`${base}/recommendations`, 'Recommendations', 'recommendations');
      add(`${base}/briefs`, 'Briefs & reports', 'briefs');
    }),
    section('foot', null, (add) => {
      if (settings) add(settings, 'Client settings', 'settings', { match: `${base}/settings` });
    }, 'foot'),
  ]);
}

/** Spec §2.5: the settings sub-nav. Visibility per tab = the gate of the page today. */
export function settingsNavFor(area: 'agency' | 'client', flags: NavRoleFlags, clientId?: string): NavSection[] {
  if (area === 'agency') return flags.isAgency ? agencySettings(flags) : [];
  const base = clientBase(flags, clientId);
  const main = base ? clientSettings(flags, base) : null;
  return main ? [main] : [];
}

function agencySettings(flags: NavRoleFlags): NavSection[] {
  const admin = flags.isAgencyAdmin;
  // Billing, Intake link and Platform access 404 inside a support session (8b/9a), hence `isUser`.
  const adminUser = admin && flags.isUser;
  return compact([
    section('agency', 'Agency', (add) => {
      if (admin) add('/agency/settings/branding', 'Branding & voice', 'branding');
      add('/agency/settings/team', 'Team', 'team');
      // Phase 14b: the agency runbook replaces Playbooks (old paths redirect here, next.config).
      add('/agency/settings/runbook', 'Runbook', 'runbook');
    }),
    section('plan', 'Plan', (add) => {
      if (adminUser) add('/agency/settings/billing', 'Billing', 'billing');
      add('/agency/settings/usage', 'Usage & limits', 'usage');
    }),
    section('growth', 'Growth', (add) => {
      if (adminUser) add('/agency/settings/intake', 'Intake link', 'intake');
    }),
    section('integrations', 'Integrations', (add) => {
      if (admin) add('/agency/settings/slack-teams', 'Slack & Teams', 'webhooks');
      add('/agency/settings/ai', 'AI connections', 'ai');
    }),
    section('security', 'Security', (add) => {
      if (adminUser) add('/agency/settings/platform-access', 'Platform access', 'platformAccess');
    }),
  ]);
}

function clientSettings(flags: NavRoleFlags, base: string): NavSection | null {
  return section('main', null, (add) => {
    // "Business profile" replaces both "Profile" (agency roles) and "Services & area" (client roles with dashboard).
    if (flags.isAgency || flags.dashboard) add(`${base}/settings/profile`, 'Business profile', 'profile');
    if (flags.isAgency) add(`${base}/settings/delivery`, 'Delivery', 'delivery');
    if (flags.alertRules) add(`${base}/settings/alerts`, 'Alert rules', 'alertRules');
    // Phase 14b: the client's own runbook (agency roles only; the page 404s for client roles).
    if (flags.isAgency) add(`${base}/settings/runbook`, 'Runbook', 'runbook');
    if (flags.mcp) add(`${base}/settings/ai`, 'AI connection', 'ai');
    if (!flags.isAgency && flags.clientBilling) add(`${base}/settings/billing`, 'Billing', 'billing');
  });
}

/** The first item's href of the first non-empty section (a settings area's landing tab). */
function firstHref(sections: (NavSection | null)[]): string | null {
  return compact(sections)[0]?.items[0]?.href ?? null;
}

function isActive(href: string, path: string): boolean {
  return path === href || path.startsWith(`${href}/`);
}

/** The deepest (longest-href) matching item wins, so `/c/<id>` doesn't also light up `/c/<id>/briefs/<x>`. */
export function activeHref(sections: NavSection[], pathname: string): string | null {
  const path = pathname.split(/[?#]/)[0]!;
  let best: string | null = null;
  let bestLength = -1;
  for (const s of sections) {
    for (const i of s.items) {
      const match = i.match ?? i.href;
      if (isActive(match, path) && match.length > bestLength) [best, bestLength] = [i.href, match.length];
    }
  }
  return best;
}

/**
 * 15b-1: a menu item's help page id, dot-separated like the `PAGE_COPY` keys and `page:<id>` help keys:
 * `/c/<id>/reviews` → `client.reviews`, `/agency/settings/team` → `agency.settings.team`, and the three roots
 * `client.overview`, `agency.portfolio`, `platform.overview`.
 */
export function pageIdOf(context: NavContext, href: string): string {
  const parts = href.split(/[?#]/)[0]!.split('/').filter(Boolean);
  const rest = context === 'client' ? parts.slice(2) : parts.slice(1);
  if (rest.length) return [context, ...rest].join('.');
  return context === 'client' ? 'client.overview' : context === 'agency' ? 'agency.portfolio' : 'platform.overview';
}
