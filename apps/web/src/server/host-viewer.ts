import { isAgencyRole, isClientRole } from '@cs/core';
import type { MembershipSummary } from '@cs/tools';
import { AGENCY_STAFF_ZONE, PLATFORM_ZONE, STAFF_ONLY } from './hosts';
import type { RequestHost } from './request-host';
import { safeNext } from './safe-next';

/**
 * 13a1 P7 / Appendix E (security-sensitive, pure): which of a signed-in user's memberships count on this host, or where the
 * user belongs instead. Agency host: only that agency's client memberships; staff with none go to the platform (N4).
 * Platform host: a client-only user (not an operator) goes to the picked membership's client origin. MCP host: all.
 */
export type HostDecision = { kind: 'allow'; memberships: MembershipSummary[] } | { kind: 'redirect'; to: string } | { kind: 'not_found' };

/** Matched against the path *with* its query (x-rm-path), so `?`/`#` end a segment too (Appendix E had `(?:\/|$)`, which let `/sign-in?next=…` bounce). */
export const NO_PLATFORM_BOUNCE = /^\/(?:sign-in|no-access|link-expired|link-other-account|api|support|dev-panel|start|waitlist|sample|join|u|sign-up|onboarding|bot)(?:[/?#]|$)/;

/**
 * N5: the only path that needs isOperator + clientOriginFor (platform host, client roles only, path not exempt). Fix round 1:
 * the proxy's STAFF_ONLY paths are exempt too — an agency host 307s them back to the platform, so bouncing them would loop.
 */
export function platformBounceTarget(i: { host: RequestHost; memberships: MembershipSummary[]; path: string; pickedAgencyId: string | null }): MembershipSummary | null {
  if (i.host.info.kind !== 'platform') return null;
  const allClient = i.memberships.length > 0 && i.memberships.every((m) => isClientRole(m.role));
  const path = safeNext(i.path);
  if (!allClient || NO_PLATFORM_BOUNCE.test(path) || STAFF_ONLY.test(path.split(/[?#]/)[0]!)) return null;
  return i.memberships.find((m) => m.agencyId === i.pickedAgencyId) ?? i.memberships[0]!;
}

export function decideHost(i: { host: RequestHost; memberships: MembershipSummary[]; path: string; platformOrigin: string; bounce: { origin: string; isOperator: boolean } | null }): HostDecision {
  const path = safeNext(i.path);
  const all: HostDecision = { kind: 'allow', memberships: i.memberships };
  if (i.host.info.kind === 'mcp') return all;
  if (i.host.info.kind === 'agency') {
    const agencyId = i.host.info.agencyId;
    // V11 (fail closed): the platform and agency-staff areas exist on an agency host only for staff of THIS agency (bounced to the platform); everyone else, any role or session, gets 404.
    const pathname = path.split(/[?#]/)[0]!;
    if (PLATFORM_ZONE.test(pathname)) return { kind: 'not_found' };
    if (AGENCY_STAFF_ZONE.test(pathname)) {
      return i.memberships.some((m) => m.agencyId === agencyId && isAgencyRole(m.role)) ? { kind: 'redirect', to: `${i.platformOrigin}${path}` } : { kind: 'not_found' };
    }
    const own = i.memberships.filter((m) => m.agencyId === agencyId && isClientRole(m.role));
    if (own.length > 0) return { kind: 'allow', memberships: own };
    if (i.memberships.some((m) => isAgencyRole(m.role))) return { kind: 'redirect', to: `${i.platformOrigin}${path}` };
    return { kind: 'allow', memberships: [] };
  }
  if (!i.bounce || i.bounce.isOperator) return all;
  const to = `${i.bounce.origin}${path}`;
  return new URL(to).origin === i.host.origin ? all : { kind: 'redirect', to };
}
