import { type AccessContext, isAgencyRole, isUuid, LINK_TARGETS, type LinkTarget, verifyLink } from '@cs/core';
import { alert, brief, briefItem, contact, type Db, trendReport, withTenant } from '@cs/db';
import { listMemberships } from '@cs/tools';
import { and, eq } from 'drizzle-orm';
import type { Viewer } from './viewer';

/** Decision 7: every deep-link target's destination inside the app. */
export function destinationPath(t: LinkTarget, id: string, clientId: string, briefIdForItem?: string): string {
  switch (t) {
    case 'brief':
      return `/c/${clientId}/briefs/${id}`;
    case 'brief_item':
      return `/c/${clientId}/briefs/${briefIdForItem}#item-${id}`;
    case 'brief_pdf':
      return `/files/brief/${id}`;
    case 'alert':
      return `/c/${clientId}/alerts/${id}`;
    case 'trend_report':
      return `/c/${clientId}/reports/${id}`;
    case 'trend_report_pdf':
      return `/files/report/${id}`;
    case 'digest':
    case 'notifications':
      return '/inbox';
  }
}

export type LinkOutcome =
  | { kind: 'redirect'; to: string; guest?: { contactId: string; agencyId: string; clientId: string }; membershipId?: string }
  | { kind: 'expired' }
  | { kind: 'other-account' }
  | { kind: 'sign-in'; next: string };

/**
 * Decision 6 + the 4b signed-link obligation: verify the token, refuse a contact that is deactivated or whose
 * links were revoked before this one was issued (Review Focus 3), refuse to act for a signed-in user who is not
 * the link's own contact (Review Focus 1), then resolve the destination and how to get the right viewer there —
 * a guest cookie for a client contact with no session, `/sign-in` for an agency contact (agency staff never get a
 * guest session), or the signed-in user's matching membership.
 */
export async function openLink(input: { service: Db; token: string; secrets: readonly string[]; sessionUserId: string | null; now?: Date }): Promise<LinkOutcome> {
  const now = input.now ?? new Date();
  const claims = verifyLink(input.secrets, input.token, now);
  if (!claims || ![claims.sub, claims.agency, claims.client, claims.id].every(isUuid)) return { kind: 'expired' };

  const [c] = await input.service.select().from(contact).where(eq(contact.id, claims.sub));
  if (!c || !c.active || c.agencyId !== claims.agency || (c.clientId !== null && c.clientId !== claims.client)) return { kind: 'expired' };
  // Defense in depth alongside the `typeof c.iat !== 'number'` guard in `verifyLink` (T15 #4): fail closed instead
  // of letting `NaN < x` silently skip the revocation check if `iat` were ever missing here.
  if (typeof claims.iat !== 'number' || (c.linksRevokedBefore && claims.iat * 1000 < c.linksRevokedBefore.getTime())) return { kind: 'expired' };

  // Review Focus 1: a signed-in user who is not this link's own contact gets nothing — not even the generic
  // "expired" response, which would hide the fact that a session is already active.
  if (input.sessionUserId && c.userId !== input.sessionUserId) return { kind: 'other-account' };

  let itemBrief: string | undefined;
  if (claims.t === 'brief_item') {
    const [row] = await input.service.select({ briefId: briefItem.briefId }).from(briefItem).where(and(eq(briefItem.id, claims.id), eq(briefItem.clientId, claims.client)));
    if (!row) return { kind: 'expired' };
    itemBrief = row.briefId;
  }
  const to = destinationPath(claims.t, claims.id, claims.client, itemBrief);

  if (input.sessionUserId) {
    const memberships = await listMemberships(input.service, input.sessionUserId);
    const m = memberships.find((x) => x.agencyId === claims.agency && (x.clientId === claims.client || (isAgencyRole(x.role) && (x.clientScope === null || x.clientScope.includes(claims.client)))));
    return m ? { kind: 'redirect', to, membershipId: m.id } : { kind: 'redirect', to };
  }
  // Agency contacts (client_id NULL) never get a guest session — sign in and let the membership carry access.
  if (c.clientId === null) return { kind: 'sign-in', next: to };
  return { kind: 'redirect', to, guest: { contactId: c.id, agencyId: claims.agency, clientId: claims.client } };
}

export type GoGate = { kind: 'ok'; viewer: Extract<Viewer, { kind: 'user' }> } | { kind: 'no-access' } | { kind: 'sign-in' };

/**
 * Fix round 1 (review): `/go/` must send only an unauthenticated or guest viewer to `/sign-in` — `sign-in/page.tsx`
 * redirects any other already-present viewer straight back to `next`, so a `member-less` signed-in user (no
 * membership) sent there would loop forever. That viewer goes to `/no-access` instead, same as `requireContext`.
 */
export function goGate(viewer: Viewer | null): GoGate {
  if (viewer?.kind === 'user') return { kind: 'ok', viewer };
  if (viewer?.kind === 'member-less') return { kind: 'no-access' };
  return { kind: 'sign-in' };
}

/** Unsigned `/go/<target>/<id>` webhook links (Slack/Teams): resolve the destination through what this viewer may see via RLS. */
export async function goDestination(app: Db, ctx: AccessContext, target: string, id: string): Promise<string | null> {
  if (!(LINK_TARGETS as readonly string[]).includes(target) || !isUuid(id)) return null;
  const t = target as LinkTarget;
  if (t === 'notifications' || t === 'digest') return '/inbox';
  return withTenant(app, ctx, async (tx) => {
    if (t === 'brief' || t === 'brief_pdf') {
      const [b] = await tx.select({ clientId: brief.clientId }).from(brief).where(eq(brief.id, id));
      return b ? destinationPath(t, id, b.clientId) : null;
    }
    if (t === 'brief_item') {
      const [i] = await tx.select({ clientId: briefItem.clientId, briefId: briefItem.briefId }).from(briefItem).where(eq(briefItem.id, id));
      return i ? destinationPath(t, id, i.clientId, i.briefId) : null;
    }
    if (t === 'alert') {
      const [a] = await tx.select({ clientId: alert.clientId }).from(alert).where(eq(alert.id, id));
      return a ? destinationPath(t, id, a.clientId) : null;
    }
    const [r] = await tx.select({ clientId: trendReport.clientId }).from(trendReport).where(eq(trendReport.id, id));
    return r ? destinationPath(t, id, r.clientId) : null;
  });
}
