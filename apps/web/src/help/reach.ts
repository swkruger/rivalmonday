/**
 * Which `/c/[clientId]` pages a role can't reach, declared once (final review M6) for the help coverage gate, the
 * white-label leak gate and the client help payload (`helpCopyFor`).
 */

/** `/c/[clientId]` pages that 404 client roles (`isAgencyRole` guard): their help is agency-only. */
export const AGENCY_ONLY_CLIENT_ROUTES = ['/c/[clientId]/pitch-snapshot', '/c/[clientId]/settings/delivery', '/c/[clientId]/settings/runbook'] as const;

/** `/c/[clientId]` pages only the client owner reaches (agency staff 404): their help is client-only. */
export const CLIENT_ONLY_CLIENT_ROUTES = ['/c/[clientId]/settings/billing'] as const;

/** A `/c/[clientId]/…` route's help page key: `/c/[clientId]/settings/delivery` → `client.settings.delivery`. */
export function clientPageKeyOf(route: string): string {
  const rest = route.replace(/^\/c\/\[clientId\]\/?/, '');
  return rest === '' ? 'client.overview' : `client.${rest.replaceAll('/', '.')}`;
}

/** The help page keys of `AGENCY_ONLY_CLIENT_ROUTES`. */
export const AGENCY_ONLY_CLIENT_KEYS: ReadonlySet<string> = new Set(AGENCY_ONLY_CLIENT_ROUTES.map(clientPageKeyOf));
