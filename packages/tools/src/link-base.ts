import { type AccessContext, isAgencyRole } from '@cs/core';
import { clientOriginFor } from '@cs/db';
import type { ToolDeps } from './deps';

/**
 * 13a1 P8: the base for tool row `url`s — the agency's client origin for client roles (read with the service db: client
 * roles cannot read `agency_domain`, F9), `APP_URL` for agency roles. No `appUrl`: undefined (root-relative paths, as
 * before); no `hostEnv`: `appUrl`.
 */
export async function linkBase(deps: ToolDeps, ctx: AccessContext): Promise<string | undefined> {
  if (!deps.appUrl || !deps.hostEnv || isAgencyRole(ctx.role)) return deps.appUrl;
  return clientOriginFor(deps.service, ctx.agencyId, deps.hostEnv);
}

/**
 * `linkBase` started alongside a tool's own reads so it adds no sequential DB stage (launch gate); await the result when
 * building rows. A rejection is still delivered to that `await` — the no-op catch only stops an unhandled rejection when
 * the tool throws before awaiting it.
 */
export function startLinkBase(deps: ToolDeps, ctx: AccessContext): Promise<string | undefined> {
  const p = linkBase(deps, ctx);
  p.catch(() => {});
  return p;
}
