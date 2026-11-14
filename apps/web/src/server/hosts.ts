import { type HostEnv, mcpOrigin, originOf, platformOrigin } from '@cs/db';

/**
 * Phase 13a1 (P4, P5, P9, R2, R6, R7; plan Appendix C): which kind of host a request arrived on, and the session-free path rules
 * the proxy applies per host kind. No `server-only` import: `proxy.ts` and unit tests import it directly.
 */
export type HostInfo = { kind: 'platform' } | { kind: 'agency'; agencyId: string; canonical: boolean; canonicalOrigin: string } | { kind: 'mcp' };
export type HostRoute = { kind: 'next' } | { kind: 'not_found' } | { kind: 'redirect'; to: string };
type AgencyHit = Omit<Extract<HostInfo, { kind: 'agency' }>, 'kind'>;
const TTL_MS = 60_000; // R2: the one allowed cross-request cache — routing data only, memberships re-checked per request
const MAX_ENTRIES = 2000;
const cache = new Map<string, { v: HostInfo | null; at: number }>();
export const clearHostCache = () => cache.clear();
export function hostnameOf(hostHeader: string | null): string | null {
  const m = /^([a-z0-9.-]+?)\.?(?::\d{1,5})?$/.exec((hostHeader ?? '').trim().toLowerCase());
  return m && m[1] ? m[1] : null;
}
export async function resolveHost(host: string | null, d: { env: HostEnv; envName: string; lookup: (hostname: string) => Promise<AgencyHit | null>; now?: () => number }): Promise<HostInfo | null> {
  const hostname = hostnameOf(host);
  if (!hostname) return null;
  // R7: platform first — staging's agency hosts nest under the platform host.
  if (hostname === new URL(d.env.appUrl).hostname || d.env.extraPlatformHosts.includes(hostname)) return { kind: 'platform' };
  if (hostname === `mcp.${d.env.neutralDomain}`) return { kind: 'mcp' };
  const key = `${d.envName}|${hostname}`;
  const now = (d.now ?? Date.now)();
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.v;
  const a = await d.lookup(hostname);
  const v: HostInfo | null = a ? { kind: 'agency', ...a } : null;
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  cache.set(key, { v, at: now }); // negative results too: random Host headers can't hammer the DB
  return v;
}
const ANY_HOST = /^\/health$/;
const MCP_ALLOWED = [/^\/mcp$/, /^\/oauth\//, /^\/\.well-known\/oauth-(?:authorization-server|protected-resource)(?:\/|$)/, /^\/api\/auth\//, /^\/sign-in(?:\/|$)/, /^\/_next\//, /^\/link-expired$/, /^\/favicon/, /^\/icon\.svg$/];
/** Staff-only paths: agency hosts 307 them to the platform; the platform never bounces them to an agency host (host-viewer). Tested against the pathname. */
export const STAFF_ONLY = /^\/(?:agency|platform)(?:\/|$)|^\/onboarding(?:$|\/(?![\w-]+\.webp$))/;
const AGENCY_HOST_DENY = /^\/(?:mcp|\.well-known|oauth|sign-up|join|support|u|bot|waitlist|sample|api\/(?:stripe|postmark|waitlist|site-status))(?:\/|$)|^\/start\/?$/;
const PLATFORM_HOST_DENY: RegExp | null = null; // Task 8: /^\/(?:mcp|oauth|\.well-known)(?:\/|$)/
export function routeForHost(host: HostInfo | null, req: { pathname: string; search: string; method: string }, platform: string): HostRoute {
  const { pathname, search, method } = req;
  if (ANY_HOST.test(pathname)) return { kind: 'next' };
  if (!host) return { kind: 'not_found' };
  if (host.kind === 'mcp') return MCP_ALLOWED.some((r) => r.test(pathname)) ? { kind: 'next' } : { kind: 'not_found' };
  if (host.kind === 'platform') return PLATFORM_HOST_DENY?.test(pathname) ? { kind: 'not_found' } : { kind: 'next' };
  if (AGENCY_HOST_DENY.test(pathname)) return { kind: 'not_found' };
  if (pathname.startsWith('/dev-panel/') && !pathname.startsWith('/dev-panel/sign-in/')) return { kind: 'not_found' };
  const logo = /^\/files\/logo\/(?!clients\/)([^/]+)\//.exec(pathname); // client logos: checked by their route (N3)
  if (logo && logo[1] !== host.agencyId) return { kind: 'not_found' };
  if (STAFF_ONLY.test(pathname)) return { kind: 'redirect', to: `${platform}${pathname}${search}` };
  if (!host.canonical && (method === 'GET' || method === 'HEAD')) return { kind: 'redirect', to: `${host.canonicalOrigin}${pathname}${search}` };
  return { kind: 'next' };
}
/** The origin served for this request, built from the validated hostname (never the raw header). */
export function requestOriginFor(host: HostInfo, hostname: string, env: HostEnv): string {
  return host.kind === 'platform' ? platformOrigin(env) : host.kind === 'mcp' ? mcpOrigin(env) : originOf(env, hostname);
}
