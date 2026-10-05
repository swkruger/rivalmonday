/**
 * Pure, client-safe nav building blocks. No server-only imports (not even `@cs/core`, whose barrel pulls in
 * `node:crypto` via `links.ts`) so this module can be imported from the 'use client' sidebar nav and client
 * switcher without bundling server code. The server (`@/server/nav`) reduces `AccessContext` down to the plain
 * `NavRoleFlags` below and calls the same `navItemsFor` so both sides agree on the item list.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: 'clients' | 'overview' | 'inbox' | 'team' | 'branding' | 'webhooks' | 'bell' | 'delivery' | 'profile' | 'competitors';
}

/** Role/kind booleans plus the fixed home path for non-agency roles — everything `navItemsFor` needs besides the live `clientId`. */
export interface NavRoleFlags {
  isAgency: boolean;
  isAgencyAdmin: boolean;
  isUser: boolean;
  homePath: string;
}

const CLIENT_PATH = /^\/c\/([0-9a-f-]{36})/;

/** Extracts the `/c/<uuid>` client id from a live pathname (client-side) — the same shape proxy.ts/layout.tsx used to parse server-side. */
export function clientIdFromPath(pathname: string): string | null {
  return CLIENT_PATH.exec(pathname)?.[1] ?? null;
}

/** 5b/5c add their modules here; only screens that exist are listed. Mirrors the old `navFor` in `@/server/nav`. */
export function navItemsFor(flags: NavRoleFlags, clientId: string | null): NavItem[] {
  const items: NavItem[] = [];
  if (flags.isAgency) {
    items.push({ href: '/agency', label: 'Clients', icon: 'clients' });
    if (clientId) {
      items.push({ href: `/c/${clientId}`, label: 'Overview', icon: 'overview' });
      items.push({ href: `/c/${clientId}/settings/profile`, label: 'Profile', icon: 'profile' });
      items.push({ href: `/c/${clientId}/competitors`, label: 'Competitors', icon: 'competitors' });
      items.push({ href: `/c/${clientId}/settings/delivery`, label: 'Delivery', icon: 'delivery' });
    }
  } else {
    items.push({ href: flags.homePath, label: 'Overview', icon: 'overview' });
  }
  items.push({ href: '/inbox', label: 'Inbox', icon: 'inbox' });
  if (flags.isAgency) items.push({ href: '/agency/team', label: 'Team', icon: 'team' });
  if (flags.isAgencyAdmin) {
    items.push({ href: '/agency/branding', label: 'Branding', icon: 'branding' });
    items.push({ href: '/agency/webhooks', label: 'Slack & Teams', icon: 'webhooks' });
  }
  if (flags.isUser) items.push({ href: '/settings/notifications', label: 'Notifications', icon: 'bell' });
  return items;
}

function isActive(href: string, active: string): boolean {
  return active === href || active.startsWith(`${href}/`);
}

/** The deepest (longest-href) matching item wins, so `/c/<id>` doesn't also light up `/c/<id>/settings/delivery`. */
export function activeHref(items: NavItem[], active: string): string | null {
  const matches = items.filter((i) => isActive(i.href, active));
  return matches.length ? matches.reduce((a, b) => (b.href.length > a.href.length ? b : a)).href : null;
}
