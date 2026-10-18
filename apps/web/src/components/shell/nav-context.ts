/**
 * Phase 15a §2.1 — which menu the shell shows, derived from the URL (D13), not session state. Pure and client-safe
 * (no server imports) so the 'use client' sidebar, the switcher and the server layouts all agree.
 */

export type NavContext = 'platform' | 'agency' | 'client';

/** Holds the last context for non-contextual pages (`/inbox`, `/settings/notifications`, `/kb/*`): `platform`, `agency` or `client:<uuid>`. No secrets. */
export const NAV_CTX_COOKIE = 'rm_nav_ctx';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** `/c/<uuid>` followed by the end, a sub-path, a query or a hash — never a longer segment (`/c/<uuid>x`). */
const CLIENT_PATH = new RegExp(`^/c/(${UUID})(?=[/?#]|$)`);
const CLIENT_COOKIE = new RegExp(`^client:(${UUID})$`);

/** Extracts the `/c/<uuid>` client id from a pathname (with or without a query string), else null. */
export function clientIdFromPath(pathname: string): string | null {
  return CLIENT_PATH.exec(pathname)?.[1] ?? null;
}

const under = (path: string, root: string) => path === root || path.startsWith(`${root}/`);

/** `/platform/**` → platform, `/agency/**` → agency, `/c/<uuid>/**` → client; anything else → `fallback`. */
export function contextOf(pathname: string, fallback: NavContext | null): NavContext | null {
  const path = pathname.split(/[?#]/)[0]!;
  if (under(path, '/platform')) return 'platform';
  if (under(path, '/agency')) return 'agency';
  if (clientIdFromPath(path)) return 'client';
  return fallback;
}

/** Reads the `rm_nav_ctx` value; anything unexpected (including a malformed client id) is null. Accepts a URL-encoded `client%3A<uuid>`. */
export function parseNavCookie(v: string | undefined): { context: NavContext; clientId: string | null } | null {
  if (!v) return null;
  let value: string;
  try {
    value = decodeURIComponent(v);
  } catch {
    return null;
  }
  if (value === 'platform' || value === 'agency') return { context: value, clientId: null };
  const id = CLIENT_COOKIE.exec(value)?.[1];
  return id ? { context: 'client', clientId: id } : null;
}
