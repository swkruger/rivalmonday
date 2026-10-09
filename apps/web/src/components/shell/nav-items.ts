/**
 * Pure, client-safe nav building blocks. No server-only imports (not even `@cs/core`, whose barrel pulls in
 * `node:crypto` via `links.ts`) so this module can be imported from the 'use client' sidebar nav and client
 * switcher without bundling server code. The server (`@/server/nav`) reduces `AccessContext` down to the plain
 * `NavRoleFlags` below and calls the same `navItemsFor` so both sides agree on the item list.
 */

/** Sidebar section: agency-wide pages, the open client's pages, then the viewer's account and agency settings. */
export type NavGroup = 'agency' | 'client' | 'account';

export interface NavItem {
  href: string;
  label: string;
  group: NavGroup;
  icon:
    | 'clients' | 'overview' | 'inbox' | 'team' | 'branding' | 'webhooks' | 'bell' | 'delivery' | 'profile' | 'competitors' | 'changes' | 'moves' | 'pricing' | 'ads' | 'rankings' | 'reputation' | 'approvals' | 'alerts' | 'recommendations'
    | 'alertRules' | 'ai' | 'usage' | 'playbooks' | 'reviews' | 'themes' | 'prospects';
}

/** Role/kind booleans plus the fixed home path for non-agency roles — everything `navItemsFor` needs besides the live `clientId`. */
export interface NavRoleFlags {
  isAgency: boolean;
  isAgencyAdmin: boolean;
  isUser: boolean;
  homePath: string;
  /** 5b-2 decision 2. */
  isPlatformOperator?: boolean;
  /** 5c-1 decision 2 — always true for agency roles. */
  dashboard: boolean;
  manageCompetitors: boolean;
  alertRules: boolean;
  mcp: boolean;
}

const CLIENT_PATH = /^\/c\/([0-9a-f-]{36})/;

/** Extracts the `/c/<uuid>` client id from a live pathname (client-side) — the same shape proxy.ts/layout.tsx used to parse server-side. */
export function clientIdFromPath(pathname: string): string | null {
  return CLIENT_PATH.exec(pathname)?.[1] ?? null;
}

/** 5c adds its modules here; only screens that exist are listed. Mirrors the old `navFor` in `@/server/nav`. */
export function navItemsFor(flags: NavRoleFlags, clientId: string | null): NavItem[] {
  const items: NavItem[] = [];
  const agency = (href: string, label: string, icon: NavItem['icon']) => items.push({ href, label, icon, group: 'agency' });
  const forClient = (href: string, label: string, icon: NavItem['icon']) => items.push({ href, label, icon, group: 'client' });
  const account = (href: string, label: string, icon: NavItem['icon']) => items.push({ href, label, icon, group: 'account' });
  if (flags.isAgency) {
    agency('/agency', 'Portfolio', 'clients');
    agency('/agency/approvals', 'Approvals', 'approvals');
    agency('/agency/alerts', 'Alert review', 'alerts');
    agency('/agency/prospects', 'Prospects', 'prospects');
    agency('/agency/usage', 'Usage & limits', 'usage');
    agency('/agency/playbooks', 'Playbooks', 'playbooks');
    if (clientId) clientModules(flags, `/c/${clientId}`, forClient);
  } else {
    clientModules(flags, flags.homePath, forClient);
  }
  account('/inbox', 'Inbox', 'inbox');
  if (flags.isAgency) account('/agency/team', 'Team', 'team');
  if (flags.isAgencyAdmin) {
    account('/agency/branding', 'Branding', 'branding');
    account('/agency/webhooks', 'Slack & Teams', 'webhooks');
  }
  if (flags.isUser) account('/settings/notifications', 'Notifications', 'bell');
  if (flags.isPlatformOperator) {
    account('/platform/reviews', 'Model reviews', 'reviews');
    account('/platform/themes', 'Theme proposals', 'themes');
  }
  return items;
}

/** Client modules in mockup order (5c-1 Global Constraints). Later tasks add their item at the marked spot. */
function clientModules(flags: NavRoleFlags, base: string, add: (href: string, label: string, icon: NavItem['icon']) => void): void {
  add(base, 'Overview', 'overview');
  if (flags.dashboard) add(`${base}/competitors`, 'Competitors', 'competitors');
  if (flags.dashboard) add(`${base}/changes`, 'Changes', 'changes');
  if (flags.dashboard) add(`${base}/pricing`, 'Pricing', 'pricing');
  if (flags.dashboard) add(`${base}/ads`, 'Ads', 'ads');
  if (flags.dashboard) add(`${base}/reviews`, 'Reviews', 'reputation');
  if (flags.dashboard) add(`${base}/rankings`, 'Local rankings', 'rankings');
  if (flags.dashboard) add(`${base}/moves`, 'Moves', 'moves');
  add(`${base}/recommendations`, 'Recommendations', 'recommendations');
  if (flags.isAgency) {
    add(`${base}/settings/profile`, 'Profile', 'profile');
    add(`${base}/settings/delivery`, 'Delivery', 'delivery');
  } else if (flags.dashboard) {
    add(`${base}/settings/profile`, 'Services & area', 'profile');
  }
  if (flags.alertRules) add(`${base}/settings/alerts`, 'Alert rules', 'alertRules');
  if (flags.mcp) add(`${base}/settings/ai`, 'AI connections', 'ai');
}

function isActive(href: string, active: string): boolean {
  return active === href || active.startsWith(`${href}/`);
}

/** The deepest (longest-href) matching item wins, so `/c/<id>` doesn't also light up `/c/<id>/settings/delivery`. */
export function activeHref(items: NavItem[], active: string): string | null {
  const matches = items.filter((i) => isActive(i.href, active));
  return matches.length ? matches.reduce((a, b) => (b.href.length > a.href.length ? b : a)).href : null;
}
