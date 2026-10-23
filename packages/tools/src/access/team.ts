import { type AccessContext, canAccessClient, isAgencyRole, type Role, ToolError } from '@cs/core';
import { randomUUID } from 'node:crypto';
import { hashInput } from '@cs/core/server';
import { auditLog, client, contact, type Db, invitation, membership, type Tx } from '@cs/db';
import { and, asc, count, eq, gt, isNull, sql } from 'drizzle-orm';
import type { ToolDeps } from '../deps';
import { type ClientInviteRole, sendClientInvite, upsertContact } from './client-invite';
import { createInvitation, INVITATION_TTL_DAYS, type NewInvitation, normalizeEmail } from './invitations';
import { sendTeamInviteEmail, type TeamInviteRole } from './team-invite-email';

export interface TeamMember {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  role: Role;
  clientId: string | null;
  clientName: string | null;
  clientScope: string[] | null;
}
export interface PendingInvite {
  id: string;
  email: string;
  role: Role;
  clientId: string | null;
  clientName: string | null;
  expiresAt: Date;
  /** B3: create and resend both set `expires_at = now + INVITATION_TTL_DAYS`, so the last send is derived (ISO). */
  sentAt: string;
}

const TTL_MS = INVITATION_TTL_DAYS * 86_400_000;

const isAdmin = (ctx: AccessContext) => ctx.role === 'agency_admin';

/** Decision 11: admins manage everyone; account managers manage client roles of clients they cover. */
function canManage(ctx: AccessContext, role: Role, clientId: string | null): boolean {
  if (isAdmin(ctx)) return true;
  if (ctx.role !== 'account_manager') return false;
  return !isAgencyRole(role) && clientId !== null && canAccessClient(ctx, clientId);
}

export async function listTeam(service: Db, ctx: AccessContext, now = new Date()): Promise<{ members: TeamMember[]; invitations: PendingInvite[] }> {
  if (!isAgencyRole(ctx.role)) throw new ToolError('permission_denied', 'Only agency roles manage the team');
  const rows = await service.execute<{ id: string; user_id: string; email: string; name: string; role: Role; client_id: string | null; client_name: string | null; client_scope: string[] | null }>(sql`
    select m.id, m.user_id, u.email, u.name, m.role, m.client_id, c.name as client_name, m.client_scope
    from membership m join auth."user" u on u.id = m.user_id left join client c on c.id = m.client_id
    where m.agency_id = ${ctx.agencyId} order by m.created_at, m.id`);
  const members = [...rows]
    .map((r) => ({ membershipId: r.id, userId: r.user_id, email: r.email, name: r.name, role: r.role, clientId: r.client_id, clientName: r.client_name, clientScope: r.client_scope }))
    .filter((m) => canManage(ctx, m.role, m.clientId));
  const invites = await service
    .select({ i: invitation, clientName: client.name })
    .from(invitation)
    .leftJoin(client, eq(client.id, invitation.clientId))
    .where(and(eq(invitation.agencyId, ctx.agencyId), isNull(invitation.acceptedAt), isNull(invitation.revokedAt), gt(invitation.expiresAt, now)))
    .orderBy(asc(invitation.createdAt));
  return {
    members,
    invitations: invites
      .filter(({ i }) => canManage(ctx, i.role as Role, i.clientId))
      .map(({ i, clientName }) => ({ id: i.id, email: i.email, role: i.role as Role, clientId: i.clientId, clientName: clientName ?? null, expiresAt: i.expiresAt, sentAt: new Date(i.expiresAt.getTime() - TTL_MS).toISOString() })),
  };
}

/** Review fix round 1: a member already holding the exact scope (agency role, or this client) must be removed, not re-invited — an
 * invite-to-demote would otherwise let an admin overwrite their own (or another admin's) role at next sign-in, bypassing
 * revokeMembership's last-admin lock (Review Focus 4). */
async function hasMemberAtScope(service: Db | Tx, agencyId: string, email: string, clientId: string | null): Promise<boolean> {
  const rows = await service.execute(sql`
    select 1 from membership m join auth."user" u on u.id = m.user_id
    where m.agency_id = ${agencyId} and lower(u.email) = ${email}
      and coalesce(m.client_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(${clientId}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    limit 1`);
  return rows.length > 0;
}

/** `service` may be the caller's transaction (11b `inviteClientUser`, which holds the client row lock). */
export async function inviteMember(service: Db | Tx, ctx: AccessContext, input: Omit<NewInvitation, 'agencyId' | 'invitedBy'>, now = new Date()): Promise<{ id: string; expiresAt: Date }> {
  if (!isAgencyRole(ctx.role)) throw new ToolError('permission_denied', 'Only agency roles invite people');
  if (!isAdmin(ctx) && isAgencyRole(input.role)) throw new ToolError('permission_denied', 'Only agency admins invite agency staff');
  if (input.clientId && !canAccessClient(ctx, input.clientId)) throw new ToolError('not_found', 'Client not found');
  const email = normalizeEmail(input.email);
  const clientId = input.clientId ?? null;
  if (await hasMemberAtScope(service, ctx.agencyId, email, clientId)) {
    throw new ToolError('invalid_input', 'This person already has access at this scope; remove them first to change their role');
  }
  return createInvitation(service, { ...input, agencyId: ctx.agencyId, invitedBy: ctx.userId }, now);
}

export async function revokeMembership(service: Db, ctx: AccessContext, membershipId: string, now = new Date()): Promise<void> {
  await service.transaction(async (tx) => {
    const [m] = await tx.select().from(membership).where(and(eq(membership.id, membershipId), eq(membership.agencyId, ctx.agencyId))).for('update');
    if (!m || !canManage(ctx, m.role as Role, m.clientId)) throw new ToolError('not_found', 'Member not found');
    if (m.role === 'agency_admin') {
      const admins = await tx.select({ id: membership.id }).from(membership).where(and(eq(membership.agencyId, ctx.agencyId), eq(membership.role, 'agency_admin'))).for('update');
      if (admins.length <= 1) throw new ToolError('invalid_input', 'An agency needs at least one admin');
    }
    await tx.delete(membership).where(eq(membership.id, m.id));
    if (m.contactId) {
      await tx.update(contact).set({ userId: null, active: false, linksRevokedBefore: now }).where(eq(contact.id, m.contactId));
    }
  });
}

export async function revokeInvitation(service: Db, ctx: AccessContext, invitationId: string, now = new Date()): Promise<void> {
  const [i] = await service.select().from(invitation).where(and(eq(invitation.id, invitationId), eq(invitation.agencyId, ctx.agencyId), isNull(invitation.acceptedAt), isNull(invitation.revokedAt)));
  if (!i || !canManage(ctx, i.role as Role, i.clientId)) throw new ToolError('not_found', 'Invitation not found');
  await service.update(invitation).set({ revokedAt: now }).where(eq(invitation.id, i.id));
}

/** Spec §6: at most 3 resends per invitation in any 24 hours. */
export const RESEND_LIMIT = { max: 3, windowHours: 24 };
const RESEND_TOOL = 'resend_invitation';

/**
 * 15c-2a B2: prior successful `resend_invitation` calls for this invitation, counted from the registry's audit rows (same agency,
 * tool and input hash of the parsed input `{ invitationId }`, `outcome = 'ok'`, inside the window, on the DB clock). Refused calls
 * are audited with their error code, so they never count; the current call's own row is written after the handler.
 */
async function priorResends(db: Db | Tx, agencyId: string, invitationId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(auditLog).where(and(
    eq(auditLog.agencyId, agencyId),
    eq(auditLog.tool, RESEND_TOOL),
    eq(auditLog.inputHash, hashInput({ invitationId })),
    eq(auditLog.outcome, 'ok'),
    gt(auditLog.createdAt, sql`now() - make_interval(hours => ${RESEND_LIMIT.windowHours})`),
  ));
  return Number(row?.n ?? 0);
}

/**
 * 15c-2a (15c-3 reuses it): sends a pending invitation again. Invitations carry no token (sign-in matches by email), so this
 * resets `expires_at` to `now + INVITATION_TTL_DAYS` and re-sends: client roles queue `client_invite` in the same transaction
 * (dedupe `client-invite:<id>:resend:<uuid>`, unique per call: a count would repeat once the window rolls over), agency roles get `team_invite` directly after commit (B1). Pending = this agency's,
 * not accepted/revoked, not expired; rights as `canManage` — anything else is `not_found`. A failed or unconfigured send
 * never undoes the reset (`emailSent: false`).
 * Callers (15c-3 included) must go through the `resend_invitation` tool: the 3 / 24 h limit counts that tool's audit rows, so
 * calling this function directly bypasses it.
 */
export async function resendInvitation(ctx: AccessContext, deps: ToolDeps, invitationId: string, now = new Date()): Promise<{ sentAt: Date; expiresAt: Date; emailSent: boolean }> {
  if (ctx.userId.startsWith('contact:')) throw new ToolError('not_found', 'Invitation not found');
  const pending = and(eq(invitation.id, invitationId), eq(invitation.agencyId, ctx.agencyId), isNull(invitation.acceptedAt), isNull(invitation.revokedAt), gt(invitation.expiresAt, now));
  const expiresAt = new Date(now.getTime() + TTL_MS);
  const done = await deps.service.transaction(async (tx) => {
    const [peek] = await tx.select({ clientId: invitation.clientId }).from(invitation).where(pending);
    // Client invites take the client-row lock first, in the same order as `inviteClientUser` (no lock-order inversion).
    const [c] = peek?.clientId
      ? await tx.select({ id: client.id, name: client.name }).from(client).where(and(eq(client.id, peek.clientId), eq(client.agencyId, ctx.agencyId))).for('update')
      : [];
    const [i] = await tx.select().from(invitation).where(pending).for('update');
    if (!i || !canManage(ctx, i.role as Role, i.clientId) || (i.clientId && !c)) throw new ToolError('not_found', 'Invitation not found');
    // Check-then-act: concurrent posts can exceed the limit (the Resend button disables while pending).
    if ((await priorResends(tx, ctx.agencyId, i.id)) >= RESEND_LIMIT.max) throw new ToolError('rate_limited', 'You can resend this invite again tomorrow.', { userFacing: true });
    await tx.update(invitation).set({ expiresAt }).where(eq(invitation.id, i.id));
    if (!c) return { i, emailSent: false };
    const role = i.role as ClientInviteRole;
    const contactId = await upsertContact(tx, ctx.agencyId, c.id, i.email, null, role);
    const emailSent = await sendClientInvite(tx, deps, { ctx, clientId: c.id, clientName: c.name, contactId, email: i.email, role, dedupe: `client-invite:${i.id}:resend:${randomUUID()}`, now });
    return { i, emailSent };
  });
  const emailSent = isAgencyRole(done.i.role as Role)
    ? await sendTeamInviteEmail(deps, { agencyId: ctx.agencyId, to: done.i.email, role: done.i.role as TeamInviteRole, inviterUserId: ctx.userId, expiresAt })
    : done.emailSent;
  return { sentAt: now, expiresAt, emailSent };
}
