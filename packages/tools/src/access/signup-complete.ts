import { discountExhausted, discountRedemptions, startAgencyTrial } from '@cs/billing';
import {
  agency, agencyInviteLink, type AgencyInviteLinkRow, agencyOnboarding, agencyProfile, billingNotice, type Db, discountCode, membership,
  pendingSignup, type PendingSignupRow, type Tx,
} from '@cs/db';
import { addContact, ensureAgencyRunbook } from '@cs/engine';
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { catalogOf } from '../catalog/access';
import { normalizeEmail } from './invitations';
import type { ToolDeps } from '../deps';
import type { SignupProblem } from './signup';

/**
 * The Stripe coupon of the link's discount code, if the code is still usable (not revoked, not expired, not exhausted).
 * 7b2: the code row is locked so concurrent sign-ups / redemptions serialise on the last `max_redemptions` slot; an
 * exhausted code just attaches no coupon (sign-up continues).
 */
async function couponFor(tx: Tx, link: AgencyInviteLinkRow, now: Date): Promise<string | undefined> {
  if (!link.discountCodeId) return undefined;
  const [dc] = await tx
    .select({ coupon: discountCode.stripeCouponId, maxRedemptions: discountCode.maxRedemptions })
    .from(discountCode)
    .where(and(eq(discountCode.id, link.discountCodeId), isNull(discountCode.revokedAt), or(isNull(discountCode.expiresAt), gt(discountCode.expiresAt, now))))
    .for('update');
  if (!dc || discountExhausted(dc.maxRedemptions, await discountRedemptions(tx, dc.coupon))) return undefined;
  return dc.coupon;
}

function linkProblem(link: AgencyInviteLinkRow | undefined, email: string, now: Date): SignupProblem | null {
  if (!link || link.revokedAt) return 'link_revoked';
  if (link.expiresAt <= now) return 'link_expired';
  if (link.uses >= link.maxUses) return 'link_used_up';
  if (link.emailLock && normalizeEmail(link.emailLock) !== normalizeEmail(email)) return 'email_lock_mismatch';
  return null;
}

/**
 * R5: the welcome email (agency admins) and the platform's new-sign-up notice, queued in the caller's transaction on the
 * `billing_notice` outbox (delivered by the worker's `billing-notices` job, Task 12). Idempotent per agency.
 */
export async function enqueueSignupEmails(tx: Tx, agencyId: string, p: PendingSignupRow, now: Date, link: AgencyInviteLinkRow | null = null): Promise<void> {
  const offer = link?.offer ?? 'trial';
  await tx.insert(billingNotice).values([
    { agencyId, kind: 'agency_welcome', dedupeKey: `signup_welcome:${agencyId}`, params: { agencyName: p.agencyName }, audience: 'agency', createdAt: now },
    {
      agencyId, kind: 'platform_signup_notice', dedupeKey: `signup_notice:${agencyId}`, audience: 'agency', createdAt: now,
      params: {
        agencyName: p.agencyName, contactName: p.contactName, email: p.email, source: p.source, offer,
        pilotEndsAt: offer === 'pilot' && link?.pilotEndsAt ? link.pilotEndsAt.toISOString() : null,
      },
    },
  ]).onConflictDoNothing({ target: billingNotice.dedupeKey });
}

type Outcome = { agencyId: string } | { problem: SignupProblem } | null;

/**
 * Phase 10: turns a verified user's open pending sign-ups into agency + agency_admin membership + onboarding + billing
 * row, exactly once (the pending row is re-read `FOR UPDATE`; a concurrent completion sees `completed_at` and stops).
 * Only call for a verified email. An invite link that became unusable after submit creates nothing, leaves the row open
 * and is reported as a problem. Nothing here calls Stripe (R3: the customer is created lazily at Checkout).
 */
export async function completePendingSignups(
  service: Db, user: { id: string; email: string; name: string | null }, now: Date,
): Promise<{ agencyIds: string[]; problems: SignupProblem[] }> {
  const email = normalizeEmail(user.email);
  const rows = await service
    .select({ id: pendingSignup.id })
    .from(pendingSignup)
    .where(and(eq(pendingSignup.email, email), isNull(pendingSignup.completedAt), gt(pendingSignup.expiresAt, now)));
  const out = { agencyIds: [] as string[], problems: [] as SignupProblem[] };
  for (const { id } of rows) {
    const r = await service.transaction(async (tx): Promise<Outcome> => {
      const [p] = await tx.select().from(pendingSignup).where(eq(pendingSignup.id, id)).for('update');
      if (!p || p.completedAt || p.expiresAt <= now || p.email !== email) return null; // another session won (or it changed)
      let link: AgencyInviteLinkRow | null = null;
      if (p.inviteLinkId) {
        const [l] = await tx.select().from(agencyInviteLink).where(eq(agencyInviteLink.id, p.inviteLinkId)).for('update');
        const problem = linkProblem(l, p.email, now);
        if (problem) return { problem };
        link = l!;
      }
      const [a] = await tx.insert(agency).values({ name: p.agencyName, branding: null }).returning({ id: agency.id });
      const agencyId = a!.id;
      // Phase 14b: the agency's runbook (a copy of the platform one), atomic with the agency.
      await ensureAgencyRunbook(tx, agencyId, await catalogOf({ service } as ToolDeps).generic());
      await tx.insert(agencyProfile).values({ agencyId, contactName: p.contactName, contactEmail: p.email });
      // Mirrors acceptInvitations: the admin's notification contact, then the membership pointing at it.
      const contactId = await addContact(tx, { agencyId, clientId: null, role: 'agency_admin', email: p.email, name: user.name || p.contactName || null, clientScope: null, userId: user.id });
      await tx.insert(membership).values({ userId: user.id, agencyId, role: 'agency_admin', clientId: null, clientScope: null, contactId, createdBy: user.id, createdAt: now });
      await tx.insert(agencyOnboarding).values({ agencyId, source: p.source, inviteLinkId: p.inviteLinkId, createdAt: now });
      const couponId = link ? await couponFor(tx, link, now) : undefined;
      await startAgencyTrial(tx, null, agencyId, link?.offer === 'pilot'
        ? { offer: 'pilot', pilotEndsAt: link.pilotEndsAt ?? undefined, couponId, now, notice: false }
        : { offer: 'trial', couponId, now, notice: false });
      if (link) await tx.update(agencyInviteLink).set({ uses: sql`${agencyInviteLink.uses} + 1` }).where(eq(agencyInviteLink.id, link.id));
      await tx.update(pendingSignup).set({ completedAt: now, completedAgencyId: agencyId }).where(eq(pendingSignup.id, id));
      await enqueueSignupEmails(tx, agencyId, p, now, link);
      return { agencyId };
    });
    if (r && 'agencyId' in r) out.agencyIds.push(r.agencyId);
    else if (r) out.problems.push(r.problem);
  }
  return out;
}
