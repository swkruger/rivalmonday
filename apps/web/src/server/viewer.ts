import { isUuid, type AccessContext } from '@cs/core';
import { client, type Db } from '@cs/db';
import { accessContextFor, coversClient, guestAccessFor, listMemberships, type MembershipSummary, pickMembership } from '@cs/tools';
import { eq } from 'drizzle-orm';
import { verifyGuest } from './guest';

export const MEMBERSHIP_COOKIE = 'rm_membership';

export type Viewer =
  | { kind: 'user'; userId: string; email: string; name: string; ctx: AccessContext; membership: MembershipSummary; memberships: MembershipSummary[] }
  | { kind: 'member-less'; userId: string; email: string; name: string }
  | { kind: 'guest'; contactId: string; ctx: AccessContext };

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
