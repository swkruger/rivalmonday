import { type AccessContext, createAccessContext, FEATURES, isUuid } from '@cs/core';
import { client, type Db } from '@cs/db';
import {
  accessContextFor, coversClient, guestAccessFor, listMemberships, type MembershipSummary, type OpenSupportSession, pickMembership, resolveSession,
} from '@cs/tools';
import { eq } from 'drizzle-orm';
import { verifyGuest } from './guest';
import { verifySupportCookie } from './support-cookie';

export const MEMBERSHIP_COOKIE = 'rm_membership';

export type Viewer =
  | { kind: 'user'; userId: string; email: string; name: string; ctx: AccessContext; membership: MembershipSummary; memberships: MembershipSummary[] }
  | { kind: 'member-less'; userId: string; email: string; name: string }
  | { kind: 'guest'; contactId: string; ctx: AccessContext }
  | SupportViewer;

/** Phase 8b: a platform operator inside a read-only support session. `ctx` is synthetic (no membership row). */
export type SupportViewer = { kind: 'support'; userId: string; email: string; name: string; ctx: AccessContext; session: OpenSupportSession };
/** An unusable `rm_support` cookie: `sessionId` is the verified id that failed, or null when the MAC didn't verify. */
export type SupportEnd = { kind: 'end'; sessionId: string | null };

/**
 * Review Focus 4: rebuilds the AccessContext from the database on every call (no caching here — `current-viewer.ts`
 * wraps this in a React `cache()` scoped to a single request) so a revoked membership loses access on its next request.
 */
export async function resolveViewer(input: {
  service: Db;
  session: { userId: string; email: string; name: string } | null;
  membershipCookie?: string;
  guestCookie?: string;
  linkSecrets: readonly string[];
  clientHint?: string | null;
  now?: Date;
}): Promise<Viewer | null> {
  const { service, session } = input;
  if (session) {
    const memberships = await listMemberships(service, session.userId);
    let m = pickMembership(memberships, input.membershipCookie);
    // Decision 16 (5a carry-over): a link into /c/<id> opens under a membership that covers that client, without changing the cookie.
    const hint = input.clientHint;
    if (m && hint && isUuid(hint) && memberships.length > 1) {
      const [c] = await service.select({ agencyId: client.agencyId }).from(client).where(eq(client.id, hint));
      if (c && !coversClient(m, hint, c.agencyId)) m = memberships.find((x) => coversClient(x, hint, c.agencyId)) ?? m;
    }
    if (!m) return { kind: 'member-less', ...session };
    return { kind: 'user', ...session, ctx: await accessContextFor(service, session.userId, m), membership: m, memberships };
  }
  if (input.guestCookie) {
    // Review Focus 3: re-verifies the cookie's signature/TTL, then re-checks the contact is active and the cookie
    // was issued after any `links_revoked_before` — both checks happen on every request, never cached.
    const claims = verifyGuest(input.linkSecrets, input.guestCookie, input.now);
    const ctx = claims ? await guestAccessFor(service, claims) : null;
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
  session: { userId: string; email: string; name: string };
  supportCookie?: string;
  secret?: string;
  now?: Date;
}): Promise<SupportViewer | SupportEnd | null> {
  if (!input.supportCookie) return null;
  const sessionId = verifySupportCookie(input.supportCookie, input.secret);
  if (!sessionId) return { kind: 'end', sessionId: null };
  const { userId } = input.session;
  const r = await resolveSession(
    { service: input.service, platformAdmins: input.platformAdmins },
    { sessionId, userId, endStale: false, ...(input.now ? { now: input.now } : {}) },
  );
  if (r.kind !== 'ok') return { kind: 'end', sessionId };
  const ctx = createAccessContext({
    agencyId: r.session.agencyId, userId, role: 'agency_admin', clientScope: 'all', features: FEATURES,
    support: { sessionId: r.session.id, platformUserId: userId },
  });
  return { kind: 'support', ...input.session, ctx, session: r.session };
}
