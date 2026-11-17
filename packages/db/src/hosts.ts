import { sql } from 'drizzle-orm';
import type { Db, Tx } from './client';

/** Phase 13a1 (P2/R7, P3, P9, N2): the one source for host env, origins and host → agency lookups. */
export interface HostEnv { appUrl: string; neutralDomain: string; extraPlatformHosts: string[] }
export const HOST_SLUG_RE = /^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$/;
export const RESERVED_HOST_SLUGS: readonly string[] = ['www', 'mcp', 'mail', 'app', 'api', 'admin', 'support'];
export const RM_ROOTS = ['rivalmonday.app', 'rivalmonday.com']; // also used by Appendix F
const DOMAIN_RE = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;
export const isUnder = (h: string, root: string) => h === root || h.endsWith(`.${root}`);

/** P2 + R7. `hostEnv` null = no host routing (web reports `problems`; delivery idles). */
export function parseHostEnv(env: NodeJS.ProcessEnv): { hostEnv: HostEnv | null; problems: string[] } {
  const appUrl = env.APP_URL?.trim().replace(/\/+$/, '');
  if (!appUrl) return { hostEnv: null, problems: [] }; // APP_URL's own check reports it
  let appHost: string;
  try { appHost = new URL(appUrl).hostname.toLowerCase(); } catch { return { hostEnv: null, problems: [] }; }
  const neutralDomain = env.NEUTRAL_DOMAIN?.trim().toLowerCase().replace(/\.$/, '') || (appHost === 'localhost' ? 'localhost' : '');
  if (!neutralDomain) return { hostEnv: null, problems: ['NEUTRAL_DOMAIN is required'] };
  if (!DOMAIN_RE.test(neutralDomain)) return { hostEnv: null, problems: ['NEUTRAL_DOMAIN must be a domain name'] };
  // R7: a Rival Monday domain only as staging's own host (APP_URL host = NEUTRAL_DOMAIN, not a Rival Monday root).
  const stagingOwn = neutralDomain === appHost && !RM_ROOTS.includes(appHost);
  if (RM_ROOTS.some((r) => isUnder(neutralDomain, r)) && !stagingOwn) return { hostEnv: null, problems: ['NEUTRAL_DOMAIN must not be a Rival Monday domain'] };
  const extraPlatformHosts = [env.VERCEL_URL, env.VERCEL_BRANCH_URL].flatMap((v) => (v?.trim() ? [v.trim().toLowerCase()] : []));
  // Dev: `next dev` binds 127.0.0.1 (apps/web/scripts/dev-args.ts), so that host is the platform too when APP_URL is localhost.
  if (appHost === 'localhost') extraPlatformHosts.push('127.0.0.1');
  return { hostEnv: { appUrl, neutralDomain, extraPlatformHosts }, problems: [] };
}
/** Same scheme and port as APP_URL (dev/E2E: http + port; prod: https, no port). */
export function originOf(h: HostEnv, hostname: string): string {
  const u = new URL(h.appUrl);
  return `${u.protocol}//${hostname}${u.port ? `:${u.port}` : ''}`;
}
export const platformOrigin = (h: HostEnv) => new URL(h.appUrl).origin;
export const mcpOrigin = (h: HostEnv) => originOf(h, `mcp.${h.neutralDomain}`);
export const fallbackHostname = (h: HostEnv, hostSlug: string) => `${hostSlug}.${h.neutralDomain}`;

type Row = { host_slug: string; hostname: string | null };

/**
 * P11: the agency's client-facing origin — its live `agency_domain.hostname`, else `<host_slug>.<neutral>`. Unknown agency → throws.
 * Callers pass the service db: client roles cannot read `agency_domain` (0112), so a tenant connection silently returns the fallback (F9).
 */
export async function clientOriginFor(db: Db | Tx, agencyId: string, h: HostEnv): Promise<string> {
  const rows = (await db.execute(sql`
    SELECT a.host_slug, d.hostname FROM agency a
    LEFT JOIN agency_domain d ON d.agency_id = a.id AND d.status = 'live'
    WHERE a.id = ${agencyId}::uuid LIMIT 1`)) as unknown as Row[];
  const r = rows[0];
  if (!r) throw new Error(`clientOriginFor: unknown agency ${agencyId}`);
  return originOf(h, r.hostname ?? fallbackHostname(h, r.host_slug));
}

/**
 * Proxy host lookup (Appendix C). `<label>.<neutral>` with exactly one valid slug label → agency by `host_slug` (canonical when it
 * has no live custom domain); otherwise an exact live `agency_domain.hostname` (canonical). Archived agencies never match. One query.
 */
export async function agencyByHostname(db: Db, hostname: string, h: HostEnv): Promise<{ agencyId: string; canonical: boolean; canonicalOrigin: string } | null> {
  const host = hostname.toLowerCase();
  const suffix = `.${h.neutralDomain}`;
  const label = host.endsWith(suffix) ? host.slice(0, -suffix.length) : null;
  if (label !== null && RESERVED_HOST_SLUGS.includes(label)) return null; // reserved labels (www, mcp, …) are never an agency host: no query
  if (label !== null && HOST_SLUG_RE.test(label)) {
    const rows = (await db.execute(sql`
      SELECT a.id, d.hostname FROM agency a
      LEFT JOIN agency_domain d ON d.agency_id = a.id AND d.status = 'live'
      WHERE a.host_slug = ${label} AND a.archived_at IS NULL LIMIT 1`)) as unknown as { id: string; hostname: string | null }[];
    const r = rows[0];
    if (!r) return null;
    return r.hostname
      ? { agencyId: r.id, canonical: false, canonicalOrigin: originOf(h, r.hostname) }
      : { agencyId: r.id, canonical: true, canonicalOrigin: originOf(h, host) };
  }
  if (label !== null) return null; // a.b.<neutral> or an invalid label (reserved ones returned above): never an agency
  const rows = (await db.execute(sql`
    SELECT a.id FROM agency_domain d JOIN agency a ON a.id = d.agency_id
    WHERE d.hostname = ${host} AND d.status = 'live' AND a.archived_at IS NULL LIMIT 1`)) as unknown as { id: string }[];
  const r = rows[0];
  return r ? { agencyId: r.id, canonical: true, canonicalOrigin: originOf(h, host) } : null;
}

/** P12: `${appUrl}/files/logo/…` (agency and `clients/` logos) → `${origin}/files/logo/…`; any other URL unchanged. */
export function rehostLogoUrl(url: string | null, h: HostEnv, origin: string): string | null {
  if (!url) return url;
  const prefix = `${platformOrigin(h)}/files/logo/`;
  return url.startsWith(prefix) ? `${origin}/files/logo/${url.slice(prefix.length)}` : url;
}
