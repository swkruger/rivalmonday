import 'server-only';
import { isUuid } from '@cs/core';
import { agency, client, type Db } from '@cs/db';
import { type Branding, resolveBranding } from '@cs/email';
import { eq } from 'drizzle-orm';
import { cache } from 'react';
import type { WebEnv } from './env';
import type { HostInfo } from './hosts';

/**
 * Decision 12: the host's agency before sign-in (single host in MVP), else Rival Monday defaults. Plan P4: emails and
 * agency-facing pages only (13a owns host-scoped email branding) — client-reachable sign-in/access PAGES use {@link authBranding}.
 */
export async function defaultBranding(service: Db, env: WebEnv): Promise<Branding> {
  if (env.defaultAgencyId) {
    const [a] = await service.select({ name: agency.name, branding: agency.branding }).from(agency).where(eq(agency.id, env.defaultAgencyId));
    if (a) return resolveBranding(a.name, a.branding ?? null);
  }
  return resolveBranding('Rival Monday', null);
}

/** What a signed-out page knows about the agency it is for: a `next=/c/<id>/…` client, or an agency outright. */
export type AuthHint = { clientId?: string; agencyId?: string } | null;

/** The agency's resolved branding by id (service role), null when unknown. */
export async function agencyBrandingById(service: Db, agencyId: string): Promise<Branding | null> {
  const [a] = await service.select({ name: agency.name, branding: agency.branding }).from(agency).where(eq(agency.id, agencyId));
  return a ? resolveBranding(a.name, a.branding ?? null) : null;
}

/**
 * Per request (generateMetadata and the page share one read); keyed by primitives so both calls hit. `hostKind`/`hostAgencyId`
 * are the request's host (13a1): an agency host is that agency's (hint ignored); the MCP host uses the hint only (no default).
 */
const cachedAuthBranding = cache(async (service: Db, env: WebEnv, clientId: string | null, agencyId: string | null, hostKind: HostInfo['kind'], hostAgencyId: string | null): Promise<Branding | null> => {
  if (hostKind === 'agency') return hostAgencyId ? agencyBrandingById(service, hostAgencyId) : null;
  let hinted = agencyId && isUuid(agencyId) ? agencyId : null;
  if (!hinted && clientId && isUuid(clientId)) {
    // Branding fields only, via the service role: an unknown client reads exactly like no hint (nothing revealed).
    const [c] = await service.select({ agencyId: client.agencyId }).from(client).where(eq(client.id, clientId));
    hinted = c?.agencyId ?? null;
  }
  const fromHint = hinted ? await agencyBrandingById(service, hinted) : null;
  if (fromHint || hostKind === 'mcp') return fromHint;
  return env.defaultAgencyId ? agencyBrandingById(service, env.defaultAgencyId) : null;
});

/**
 * 15a §2.10 / D12 / 13a1: branding for the sign-in and access pages. Agency host → that agency's (any hint is ignored: another
 * agency's branding never shows on it). MCP host → the hinted agency's (the consent page after sign-in), else `null`.
 * Platform → the hinted agency's, else `DEFAULT_AGENCY_ID`'s, else `null`. `null` renders as a neutral card (no wordmark,
 * no logo, no product name).
 */
export function authBranding(service: Db, env: WebEnv, hint: AuthHint, host: HostInfo): Promise<Branding | null> {
  return cachedAuthBranding(service, env, hint?.clientId ?? null, hint?.agencyId ?? null, host.kind, host.kind === 'agency' ? host.agencyId : null);
}

/** The client a sign-in `next` path is for (`/c/<uuid>`, `/c/<uuid>/…`, `/c/<uuid>?…`), else null. */
export function authHintFromNext(next: string | null | undefined): { clientId: string } | null {
  const m = /^\/c\/([^/?#]+)(?:[/?#]|$)/.exec(next ?? '');
  return m && isUuid(m[1]!) ? { clientId: m[1]! } : null;
}

/** Auth page `<title>`: `{page} · {agency}` when the agency is known, else the bare page name (never a product name). */
export function authTitle(page: string, branding: Branding | null): string {
  return branding ? `${page} · ${branding.displayName}` : page;
}
