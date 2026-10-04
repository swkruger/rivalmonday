import { type AccessContext, canAccessClient, isAgencyRole, type Role, ToolError } from '@cs/core';
import { client, contact, type Db, invitation, membership } from '@cs/db';
import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';
import { createInvitation, type NewInvitation } from './invitations';

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
}

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
      .map(({ i, clientName }) => ({ id: i.id, email: i.email, role: i.role as Role, clientId: i.clientId, clientName: clientName ?? null, expiresAt: i.expiresAt })),
  };
}

export async function inviteMember(service: Db, ctx: AccessContext, input: Omit<NewInvitation, 'agencyId' | 'invitedBy'>, now = new Date()): Promise<{ id: string; expiresAt: Date }> {
  if (!isAgencyRole(ctx.role)) throw new ToolError('permission_denied', 'Only agency roles invite people');
  if (!isAdmin(ctx) && isAgencyRole(input.role)) throw new ToolError('permission_denied', 'Only agency admins invite agency staff');
  if (input.clientId && !canAccessClient(ctx, input.clientId)) throw new ToolError('not_found', 'Client not found');
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
