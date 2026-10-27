import { type AccessContext, canAccessClient, isAgencyRole, ToolError } from '@cs/core';
import { client, clientSetup, contact, invitation, type Tx } from '@cs/db';
import { loadBranding, notify } from '@cs/engine';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { ToolDeps } from '../deps';
import { completeIfDone } from '../setup/state';
import { normalizeEmail } from './invitations';
import { inviteMember } from './team';
import type { Inviter } from './team-invite-email';

export type ClientInviteRole = 'client_owner' | 'client_viewer';

/** The page an invited client user lands on after signing in: always the client overview (P8: owners never enter `/setup`; an owner asked to pick finds the "choose competitors" card there). */
function landingPath(clientId: string): string {
  return `/c/${clientId}`;
}

/** Reuses the (agency, client, lower(email)) contact — the `contact_email_unique` key — or inserts an inactive one. An active contact stays active. */
export async function upsertContact(tx: Tx, agencyId: string, clientId: string, email: string, name: string | null, role: ClientInviteRole): Promise<string> {
  const find = () =>
    tx.select({ id: contact.id, name: contact.name }).from(contact)
      .where(and(eq(contact.agencyId, agencyId), eq(contact.clientId, clientId), sql`lower(${contact.email}) = ${email}`)).for('update');
  let [existing] = await find();
  if (!existing) {
    // DO NOTHING: a recipient added concurrently without the client lock (add_client_recipient) wins; re-read below.
    await tx.insert(contact).values({ agencyId, clientId, role, email, name, active: false }).onConflictDoNothing();
    [existing] = await find();
    if (!existing) throw new ToolError('internal', 'Could not create the contact');
    return existing.id;
  }
  await tx.update(contact).set({ role, ...(existing.name ? {} : { name }) }).where(eq(contact.id, existing.id));
  return existing.id;
}

/** Revokes the pending (unaccepted, unrevoked) `client_owner` invitation of the setup's invited contact when its email differs from `email`. */
async function revokeReplacedOwnerInvite(tx: Tx, agencyId: string, clientId: string, email: string, now: Date): Promise<void> {
  const [prev] = await tx.select({ email: contact.email }).from(clientSetup)
    .innerJoin(contact, eq(contact.id, clientSetup.invitedContactId))
    .where(and(eq(clientSetup.clientId, clientId), eq(contact.agencyId, agencyId), eq(contact.clientId, clientId)));
  const prevEmail = prev && normalizeEmail(prev.email);
  if (!prevEmail || prevEmail === email) return;
  await tx.update(invitation).set({ revokedAt: now }).where(and(
    eq(invitation.agencyId, agencyId), eq(invitation.clientId, clientId), eq(invitation.role, 'client_owner'),
    sql`lower(${invitation.email}) = ${prevEmail}`, isNull(invitation.acceptedAt), isNull(invitation.revokedAt),
  ));
}

/**
 * Queues the `client_invite` email for one invitation in the caller's transaction (11b §6). Shared by the invite and by
 * `resendInvitation` (15c-2a), which passes its own `dedupe` so the outbox's unique key never swallows a resend.
 * `deps.delivery` null, or no row inserted (dedupe key already used): nothing is queued and it answers false.
 */
export async function sendClientInvite(
  tx: Tx,
  deps: ToolDeps,
  i: { ctx: AccessContext; clientId: string; clientName: string; contactId: string; email: string; role: ClientInviteRole; dedupe: string; now: Date; inviter?: Inviter },
): Promise<boolean> {
  const { ctx, now } = i;
  if (!deps.delivery) {
    console.warn('[invite] email delivery is not configured (APP_URL / LINK_SIGNING_SECRET); invitation created without an email', { clientId: i.clientId });
    return false;
  }
  const cfg = deps.delivery;
  const branding = await loadBranding(tx, ctx.agencyId);
  // `{ agency: true }` (platform staff acting for the agency): no inviter lookup, so no Cc.
  const inviter = i.inviter ?? { userId: ctx.userId };
  const rows = 'userId' in inviter ? await tx.execute<{ email: string }>(sql`select email from auth."user" where id = ${inviter.userId}`) : [];
  const inviterEmail = [...rows][0]?.email;
  // Built from validated ids only (never request input); the sign-in page re-checks `next` with `safeNext`.
  const startUrl = `${cfg.appUrl}/sign-in?email=${encodeURIComponent(i.email)}&next=${encodeURIComponent(landingPath(i.clientId))}`;
  const props = { branding, businessName: i.clientName, agencyName: branding.displayName, startUrl };
  const queued = await notify(tx, cfg, {
    agencyId: ctx.agencyId, clientId: i.clientId, kind: 'client_invite', audience: 'client', subjectType: 'setup', subjectId: i.clientId,
    dedupe: i.dedupe, link: { t: 'setup', id: i.clientId }, now, contactIds: [i.contactId], cc: inviterEmail ? [inviterEmail] : [],
    // Row title/body mirror the template's binding subject and core line (spec §6); the email itself renders from `props`.
    build: () => ({
      title: `${props.agencyName} invited you to see your competitors`,
      body: `${props.agencyName} is setting up weekly competitor reports for ${props.businessName}.`,
      email: { template: 'client_invite', props },
    }),
  });
  // The outbox drops a repeated dedupe key silently: a swallowed insert is never reported as sent.
  return queued > 0;
}

/**
 * Phase 11b §4 (security-sensitive): invites a client user and emails them a sign-in link, in one transaction that
 * first locks the `client` row, so a parallel wizard + team invite serialise (the second revokes the first's pending
 * invitation instead of hitting `invitation_pending_unique`). Rights exactly as `inviteMember`; guests refused;
 * prospects allowed. `deps.delivery` null: the invitation and contact are still created, no email is queued.
 */
export async function inviteClientUser(
  ctx: AccessContext,
  deps: ToolDeps,
  input: { clientId: string; email: string; name: string | null; role: ClientInviteRole; replaceInvitedOwner?: boolean },
  now: Date,
): Promise<{ invitationId: string; expiresAt: Date; contactId: string; emailSent: boolean }> {
  if (ctx.userId.startsWith('contact:')) throw new ToolError('permission_denied', 'Sign in to invite people');
  if (!isAgencyRole(ctx.role)) throw new ToolError('permission_denied', 'Only agency roles invite people');
  if (!canAccessClient(ctx, input.clientId)) throw new ToolError('not_found', 'Client not found');
  const email = normalizeEmail(input.email);

  return deps.service.transaction(async (tx) => {
    // The shared client-row lock (as `lockClient` in tools/setup.ts), scoped to the caller's agency: the service role bypasses RLS.
    const [c] = await tx.select({ id: client.id, name: client.name }).from(client)
      .where(and(eq(client.id, input.clientId), eq(client.agencyId, ctx.agencyId))).for('update');
    if (!c) throw new ToolError('not_found', 'Client not found');

    // Wizard re-invite to a corrected address (I2): the earlier invited owner's pending invitation stops working, so a
    // typo can't sign in, become a second owner or receive the payment link. Team-page invites (several owners) skip this.
    if (input.replaceInvitedOwner && input.role === 'client_owner') await revokeReplacedOwnerInvite(tx, ctx.agencyId, c.id, email, now);
    const inv = await inviteMember(tx, ctx, { email, role: input.role, clientId: c.id }, now);
    const contactId = await upsertContact(tx, ctx.agencyId, c.id, email, input.name, input.role);
    if (input.role === 'client_owner') {
      await tx.update(clientSetup).set({ invitedContactId: contactId, invitedBy: ctx.userId }).where(eq(clientSetup.clientId, c.id));
      // 11b §8: the invite step is now done; if it was the last open step the setup closes (guarded; no-op otherwise).
      await completeIfDone(tx, c.id, now);
    }

    const emailSent = await sendClientInvite(tx, deps, {
      ctx, clientId: c.id, clientName: c.name, contactId, email, role: input.role, dedupe: `client-invite:${inv.id}`, now,
    });
    return { invitationId: inv.id, expiresAt: inv.expiresAt, contactId, emailSent };
  });
}
