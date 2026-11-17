import { type AccessContext, createAccessContext, FEATURES, isUuid } from '@cs/core';
import { client, type Db } from '@cs/db';
import {
  accessContextFor, avatarUrlOf, coversClient, guestAccessFor, listMemberships, type MembershipSummary, type OpenSupportSession, pickMembership, resolveSession,
} from '@cs/tools';
import { eq } from 'drizzle-orm';
import { verifyGuest } from './guest';
import { STAFF_ONLY } from './hosts';
import { decideHost, platformBounceTarget } from './host-viewer';
import type { RequestHost } from './request-host';
import { verifySupportCookie } from './support-cookie';

export const MEMBERSHIP_COOKIE = 'rm_membership';

export type Viewer =
  | { kind: 'user'; userId: string; email: string; name: string; avatarUrl: string | null; ctx: AccessContext; membership: MembershipSummary; memberships: MembershipSummary[] }
  | { kind: 'member-less'; userId: string; email: string; name: string }
  | { kind: 'guest'; contactId: string; ctx: AccessContext }
  | SupportViewer;

/** Phase 8b: a platform operator inside a read-only support session. `ctx` is synthetic (no membership row). */
export type SupportViewer = { kind: 'support'; userId: string; email: string; name: string; avatarUrl: string | null; ctx: AccessContext; session: OpenSupportSession };
/** 13a1 P7: the signed-in user belongs on another host (internal; `viewerWith` turns it into `redirect()` or null). */
export type HostRedirect = { kind: 'redirect'; to: string };
/** 13a2 V11: this viewer has no business on this path of this host (staff area on an agency host); page mode turns it into `notFound()`. */
export type HostNotFound = { kind: 'not_found' };
/** An unusable `rm_support` cookie: `sessionId` is the verified id that failed, or null when the MAC didn't verify. */
export type SupportEnd = { kind: 'end'; sessionId: string | null };

/**
 * Review Focus 4: rebuilds the AccessContext from the database on every call (no caching here — `current-viewer.ts`
 * wraps this in a React `cache()` scoped to a single request) so a revoked membership loses access on its next request.
 */
export async function resolveViewer(input: {
  service: Db;
  session: { userId: string; email: string; name: string; image?: string | null } | null;
  membershipCookie?: string;
  guestCookie?: string;
  linkSecrets: readonly string[];
  clientHint?: string | null;
  now?: Date;
  /**
   * Launch-gate 6a: told the chosen membership as soon as it is known, before `accessContextFor` reads the plan, so the
   * caller can start a read that needs only the agency id (the page's billing snapshot) in the same stage. Never awaited.
   */
  onMembership?: (m: MembershipSummary) => void;
  /** 13a1 P7: the host this request is served on, its path (with query) and the platform origin staff are sent to. */
  host: RequestHost;
  path: string;
  platformOrigin: string;
  /**
   * N5: called only when a client-only user is on the platform host on a non-exempt path (`platformBounceTarget`), so normal
   * pages add no DB stage. Returns the target's client origin and whether the user is a platform operator (operators stay).
   */
  bounce?: (target: MembershipSummary) => Promise<{ origin: string; isOperator: boolean }>;
}): Promise<Viewer | HostRedirect | HostNotFound | null> {
  const { service, session, host } = input;
  if (session) {
    // Launch gate (13a1 Task 15): the Decision 16 hint lookup starts beside `listMemberships` (it needs only the hint), so it
    // adds no sequential stage. A 404 or page redirect resolves the viewer twice (fresh `cache()`), so each stage counts twice.
    const hint = input.clientHint;
    const hintAgency = hint && isUuid(hint)
      ? service.select({ agencyId: client.agencyId }).from(client).where(eq(client.id, hint)).then((r) => r[0]?.agencyId ?? null)
      : Promise.resolve(null);
    void hintAgency.catch(() => undefined); // handled where used; an early return must not leave an unhandled rejection
    const all = await listMemberships(service, session.userId);
    const target = platformBounceTarget({ host, memberships: all, path: input.path, pickedAgencyId: pickMembership(all, input.membershipCookie)?.agencyId ?? null });
    const bounce = target && input.bounce ? await input.bounce(target) : null;
    const decision = decideHost({ host, memberships: all, path: input.path, platformOrigin: input.platformOrigin, bounce });
    if (decision.kind !== 'allow') return decision;
    // Only the memberships that count on this host reach the pick and the client hint (another agency's never do).
    const memberships = decision.memberships;
    let m = pickMembership(memberships, input.membershipCookie);
    // Decision 16 (5a carry-over): a link into /c/<id> opens under a membership that covers that client, without changing the cookie.
    if (m && hint && isUuid(hint) && memberships.length > 1) {
      const agencyId = await hintAgency;
      if (agencyId && !coversClient(m, hint, agencyId)) m = memberships.find((x) => coversClient(x, hint, agencyId)) ?? m;
    }
    if (!m) return { kind: 'member-less', userId: session.userId, email: session.email, name: session.name };
    input.onMembership?.(m);
    const { image, ...who } = session;
    return { kind: 'user', ...who, avatarUrl: avatarUrlOf(image ?? null), ctx: await accessContextFor(service, session.userId, m), membership: m, memberships };
  }
  // V11: staff areas of an agency host exist only for a signed-in viewer; no session (forged/expired cookie, guest) is a 404, never a sign-in redirect.
  if (host.info.kind === 'agency' && STAFF_ONLY.test(input.path.split(/[?#]/)[0]!)) return { kind: 'not_found' };
  // 13a1 P7: guest sessions live only on their own agency's host (never the platform or mcp host, never another agency's).
  if (input.guestCookie && host.info.kind === 'agency') {
    // Review Focus 3: re-verifies the cookie's signature/TTL, then re-checks the contact is active and the cookie
    // was issued after any `links_revoked_before` — both checks happen on every request, never cached.
    const claims = verifyGuest(input.linkSecrets, input.guestCookie, input.now);
    const ctx = claims && claims.agencyId === host.info.agencyId ? await guestAccessFor(service, claims) : null;
    if (claims && ctx) return { kind: 'guest', contactId: claims.contactId, ctx };
  }
  return null;
}

/**
 * Spec "Session resolution" (binding). Only for a signed-in user; the caller ignores `rm_support` otherwise.
 * - no cookie → null (normal resolution follows);
 * - cookie verifies, the row is open, unexpired, owned by this user and the user is still owner/staff → support viewer;
 * - anything else → `{ kind: 'end', sessionId }` (the id that failed, or null for a cookie that doesn't verify): the
 *   caller redirects to `/support/end?sid=…`, which ends expired/revoked rows and clears the cookie only when the
 *   cookie it receives still carries that id (render can't write cookies, and never ends rows: `endStale: false`).
 * The synthetic context is built from the session alone, so the operator's own memberships never reach it.
 */
export async function resolveSupportViewer(input: {
  service: Db;
  platformAdmins: readonly string[];
  session: { userId: string; email: string; name: string; image?: string | null };
  supportCookie?: string;
  secret?: string;
  now?: Date;
}): Promise<SupportViewer | SupportEnd | null> {
  if (!input.supportCookie) return null;
  const sessionId = verifySupportCookie(input.supportCookie, input.secret);
  if (!sessionId) return { kind: 'end', sessionId: null };
  const { image, ...who } = input.session;
  const { userId } = who;
  const r = await resolveSession(
    { service: input.service, platformAdmins: input.platformAdmins },
    { sessionId, userId, endStale: false, ...(input.now ? { now: input.now } : {}) },
  );
  if (r.kind !== 'ok') return { kind: 'end', sessionId };
  const ctx = createAccessContext({
    agencyId: r.session.agencyId, userId, role: 'agency_admin', clientScope: 'all', features: FEATURES,
    support: { sessionId: r.session.id, platformUserId: userId },
  });
  return { kind: 'support', ...who, avatarUrl: avatarUrlOf(image ?? null), ctx, session: r.session };
}
