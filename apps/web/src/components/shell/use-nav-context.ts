'use client';

import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { clientIdFromPath, contextOf, NAV_CTX_COOKIE, type NavContext, parseNavCookie } from './nav-context';
import type { NavRoleFlags } from './nav-items';

export interface NavClient {
  id: string;
  name: string;
}

export type NavFallback = { context: NavContext; clientId: string | null };

function readNavCookie(): string | null {
  const prefix = `${NAV_CTX_COOKIE}=`;
  return document.cookie.split('; ').find((c) => c.startsWith(prefix))?.slice(prefix.length) ?? null;
}
const noSubscribe = () => () => {};

/**
 * The shell's current context (spec §2.1), shared by `SidebarNav`, the context switcher and the top-bar name so they
 * always agree. The context is the zone (`(platform)` pages), else the URL, else the last context: the `rm_nav_ctx`
 * cookie `SidebarNav` writes on every contextual page. On the client the cookie itself is read (the layout's
 * server-read `fallback` goes stale after a client-side navigation, and the drawer mounts later than the sidebar);
 * during hydration `useSyncExternalStore` uses the server value, so both agree.
 * P1: outside the platform zone a remembered `platform` reads as `agency`; client roles and guests are always `client`.
 * `clients` = the viewer's own clients (agency roles): a remembered client not among them (membership switch, ended
 * support session, scope change, shared browser) reads as `agency`, so a neutral page never shows a menu of 404s.
 *
 * `remember`: the cookie value for this page (`platform`, `agency`, `client:<uuid>`), null on a neutral page.
 */
export function useNavContext({ flags, zone, fallback, clients }: { flags: NavRoleFlags; zone?: 'platform'; fallback: NavFallback | null; clients: NavClient[] }): {
  active: string;
  context: NavContext;
  clientId: string | null;
  remember: string | null;
} {
  const active = usePathname().split(/[?#]/)[0]!;
  const stored = useSyncExternalStore(noSubscribe, readNavCookie, () => undefined);
  const remembered = (stored === undefined ? null : parseNavCookie(stored ?? undefined)) ?? fallback;
  const here = contextOf(active, null);
  const hereClientId = clientIdFromPath(active);
  const context = zone ?? here ?? lastContext(remembered, flags, clients);
  const clientId = hereClientId ?? (here === null && context === 'client' ? (remembered?.clientId ?? null) : null);
  // Only contextual pages are remembered; a neutral page (`/inbox`, `/kb/*`) keeps whatever was there.
  const remember = here === 'client' ? `client:${hereClientId}` : here;
  return { active, context, clientId, remember };
}

/** A neutral page's context: the remembered one (P1: `platform` → `agency`; a client not the viewer's → `agency`), else the viewer's home context. */
function lastContext(remembered: NavFallback | null, flags: NavRoleFlags, clients: NavClient[]): NavContext {
  if (!flags.isAgency) return 'client';
  if (!remembered || remembered.context === 'platform') return 'agency';
  if (remembered.context === 'client' && !clients.some((c) => c.id === remembered.clientId)) return 'agency';
  return remembered.context;
}
