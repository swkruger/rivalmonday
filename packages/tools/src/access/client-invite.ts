import { type AccessContext, canAccessClient, isAgencyRole, ToolError } from '@cs/core';
import { client, clientSetup, contact, type Tx } from '@cs/db';
import { loadBranding, notify } from '@cs/engine';
import { and, eq, sql } from 'drizzle-orm';
import type { ToolDeps } from '../deps';
import { getSetupState } from '../setup/state';
import { normalizeEmail } from './invitations';
import { inviteMember } from './team';

export type ClientInviteRole = 'client_owner' | 'client_viewer';

/** The page an invited client user lands on after signing in: the wizard for an owner while the setup is open, else the dashboard (a closed/absent setup and every viewer would 404 on `/setup`). */
async function landingPath(tx: Tx, clientId: string, role: ClientInviteRole): Promise<string> {
  if (role !== 'client_owner') return `/c/${clientId}`;
  return (await getSetupState(tx, clientId)).open ? `/c/${clientId}/setup` : `/c/${clientId}`;
}

/** Reuses the (agency, client, lower(email)) contact — the `contact_email_unique` key — or inserts an inactive one. An active contact stays active. */
async function upsertContact(tx: Tx, agencyId: string, clientId: string, email: string, name: string | null, role: ClientInviteRole): Promise<string> {
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

/**
 * Phase 11b §4 (security-sensitive): invites a client user and emails them a sign-in link, in one transaction that
 * first locks the `client` row, so a parallel wizard + team invite serialise (the second revokes the first's pending
 * invitation instead of hitting `invitation_pending_unique`). Rights exactly as `inviteMember`; guests refused;
 * prospects allowed. `deps.delivery` null: the invitation and contact are still created, no email is queued.
 */
export async function inviteClientUser(
  ctx: AccessContext,
  deps: ToolDeps,
  input: { clientId: string; email: string; name: string | null; role: ClientInviteRole },
  now: Date,
): Promise<{ invitationId: string; expiresAt: Date; contactId: string }> {
  if (ctx.userId.startsWith('contact:')) throw new ToolError('permission_denied', 'Sign in to invite people');
  if (!isAgencyRole(ctx.role)) throw new ToolError('permission_denied', 'Only agency roles invite people');
  if (!canAccessClient(ctx, input.clientId)) throw new ToolError('not_found', 'Client not found');
  const email = normalizeEmail(input.email);

  return deps.service.transaction(async (tx) => {
    // The shared client-row lock (as `lockClient` in tools/setup.ts), scoped to the caller's agency: the service role bypasses RLS.
    const [c] = await tx.select({ id: client.id, name: client.name }).from(client)
      .where(and(eq(client.id, input.clientId), eq(client.agencyId, ctx.agencyId))).for('update');
    if (!c) throw new ToolError('not_found', 'Client not found');

    const inv = await inviteMember(tx, ctx, { email, role: input.role, clientId: c.id }, now);
    const contactId = await upsertContact(tx, ctx.agencyId, c.id, email, input.name, input.role);
    if (input.role === 'client_owner') {
      await tx.update(clientSetup).set({ invitedContactId: contactId, invitedBy: ctx.userId }).where(eq(clientSetup.clientId, c.id));
    }

    if (!deps.delivery) {
      console.warn('[invite] email delivery is not configured (APP_URL / LINK_SIGNING_SECRET); invitation created without an email', { clientId: c.id });
      return { invitationId: inv.id, expiresAt: inv.expiresAt, contactId };
    }
    const cfg = deps.delivery;
    const branding = await loadBranding(tx, ctx.agencyId);
    const rows = await tx.execute<{ email: string }>(sql`select email from auth."user" where id = ${ctx.userId}`);
    const inviterEmail = [...rows][0]?.email;
    // Built from validated ids only (never request input); the sign-in page re-checks `next` with `safeNext`.
    const startUrl = `${cfg.appUrl}/sign-in?email=${encodeURIComponent(email)}&next=${encodeURIComponent(await landingPath(tx, c.id, input.role))}`;
    const props = { branding, businessName: c.name, agencyName: branding.displayName, startUrl };
    await notify(tx, cfg, {
      agencyId: ctx.agencyId, clientId: c.id, kind: 'client_invite', audience: 'client', subjectType: 'setup', subjectId: c.id,
      dedupe: `client-invite:${inv.id}`, link: { t: 'setup', id: c.id }, now, contactIds: [contactId], cc: inviterEmail ? [inviterEmail] : [],
      // Row title/body mirror the template's binding subject and core line (spec §6); the email itself renders from `props`.
      build: () => ({
        title: `${props.agencyName} invited you to see your competitors`,
        body: `${props.agencyName} is setting up weekly competitor reports for ${props.businessName}.`,
        email: { template: 'client_invite', props },
      }),
    });
    return { invitationId: inv.id, expiresAt: inv.expiresAt, contactId };
  });
}
