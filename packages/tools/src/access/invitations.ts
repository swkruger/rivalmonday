import { isAgencyRole, isUuid, type Role, ROLES, ToolError } from '@cs/core';
import { client, contact, type Db, invitation, membership, type Tx } from '@cs/db';
import { addContact } from '@cs/engine';
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';

export const INVITATION_TTL_DAYS = 14;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_SCOPE = 500;

export interface NewInvitation {
  agencyId: string;
  email: string;
  role: Role;
  clientId?: string | null;
  clientScope?: string[] | null;
  invitedBy: string;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
const sameClient = (col: typeof invitation.clientId | typeof contact.clientId | typeof membership.clientId, clientId: string | null) =>
  clientId ? eq(col, clientId) : isNull(col);

/** Shape rules shared with the DB CHECKs (decision 3); returns a human-readable problem or null. */
export function invitationProblem(i: NewInvitation): string | null {
  if (!EMAIL.test(normalizeEmail(i.email))) return 'Enter a valid email address';
  if (!(ROLES as readonly string[]).includes(i.role)) return `Unknown role ${i.role}`;
  const agencyRole = isAgencyRole(i.role);
  if (agencyRole && i.clientId) return 'Agency roles are not tied to one client';
  if (!agencyRole && !(i.clientId && isUuid(i.clientId))) return 'Client roles need a client';
  if (i.clientScope != null) {
    if (i.role !== 'account_manager') return 'Only account managers have a client scope';
    if (i.clientScope.length === 0 || i.clientScope.length > MAX_SCOPE || !i.clientScope.every(isUuid)) return 'The client scope must list 1-500 clients';
  }
  return null;
}

async function assertAgencyClients(tx: Tx, agencyId: string, ids: string[]) {
  if (ids.length === 0) return;
  const rows = await tx.select({ id: client.id }).from(client).where(and(eq(client.agencyId, agencyId), inArray(client.id, ids)));
  if (rows.length !== new Set(ids).size) throw new ToolError('not_found', 'Client not found');
}

/** Low-level (not permission-checked): used by `inviteMember` (Task 3) and the admin CLI (Task 18). */
export async function createInvitation(service: Db, input: NewInvitation, now = new Date()): Promise<{ id: string; expiresAt: Date }> {
  const problem = invitationProblem(input);
  if (problem) throw new ToolError('invalid_input', problem);
  const email = normalizeEmail(input.email);
  const clientId = input.clientId ?? null;
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_DAYS * 86_400_000);
  return service.transaction(async (tx) => {
    await assertAgencyClients(tx, input.agencyId, [...(clientId ? [clientId] : []), ...(input.clientScope ?? [])]);
    await tx.update(invitation).set({ revokedAt: now }).where(and(
      eq(invitation.agencyId, input.agencyId), sameClient(invitation.clientId, clientId), sql`lower(${invitation.email}) = ${email}`,
      isNull(invitation.acceptedAt), isNull(invitation.revokedAt),
    ));
    const [row] = await tx.insert(invitation).values({
      agencyId: input.agencyId, email, role: input.role, clientId, clientScope: input.clientScope ?? null, invitedBy: input.invitedBy, createdAt: now, expiresAt,
    }).returning({ id: invitation.id });
    return { id: row!.id, expiresAt };
  });
}

/** Decision 2: only invited people, or users who still hold a membership, may receive a sign-in link. */
export async function hasSignInRight(service: Db, email: string, now = new Date()): Promise<boolean> {
  const e = normalizeEmail(email);
  const rows = await service.execute(sql`
    select 1 from invitation where lower(email) = ${e} and accepted_at is null and revoked_at is null and expires_at > ${now.toISOString()}::timestamptz
    union all
    select 1 from membership m join auth."user" u on u.id = m.user_id where lower(u.email) = ${e}
    limit 1`);
  return rows.length > 0;
}

/** Links (or creates) the contact that receives this member's notifications (decision 5). */
async function contactFor(tx: Tx, inv: typeof invitation.$inferSelect, user: { id: string; name?: string | null }): Promise<string> {
  const [existing] = await tx.select({ id: contact.id }).from(contact).where(and(
    eq(contact.agencyId, inv.agencyId), sameClient(contact.clientId, inv.clientId), sql`lower(${contact.email}) = ${inv.email}`,
  ));
  if (existing) {
    await tx.update(contact).set({ userId: user.id, active: true, role: inv.role, clientScope: inv.clientScope ?? null }).where(eq(contact.id, existing.id));
    return existing.id;
  }
  return addContact(tx, {
    agencyId: inv.agencyId, clientId: inv.clientId, role: inv.role as Role, email: inv.email, name: user.name ?? null, clientScope: inv.clientScope ?? null, userId: user.id,
  });
}

/** Runs at every session creation for a verified email (decision 2); returns the ids of memberships it created or updated. */
export async function acceptInvitations(service: Db, user: { id: string; email: string; name?: string | null }, now = new Date()): Promise<string[]> {
  const email = normalizeEmail(user.email);
  return service.transaction(async (tx) => {
    const pending = await tx.select().from(invitation).where(and(
      sql`lower(${invitation.email}) = ${email}`, isNull(invitation.acceptedAt), isNull(invitation.revokedAt), gt(invitation.expiresAt, now),
    )).for('update');
    const ids: string[] = [];
    for (const inv of pending) {
      const contactId = await contactFor(tx, inv, user);
      const [existing] = await tx
        .select({ id: membership.id })
        .from(membership)
        .where(and(eq(membership.userId, user.id), eq(membership.agencyId, inv.agencyId), sameClient(membership.clientId, inv.clientId)))
        .for('update');
      let membershipId: string;
      if (existing) {
        await tx.update(membership).set({ role: inv.role, clientScope: inv.clientScope, contactId }).where(eq(membership.id, existing.id));
        membershipId = existing.id;
      } else {
        const [m] = await tx.insert(membership).values({
          userId: user.id, agencyId: inv.agencyId, role: inv.role, clientId: inv.clientId, clientScope: inv.clientScope, contactId, createdBy: inv.invitedBy, createdAt: now,
        }).returning({ id: membership.id });
        membershipId = m!.id;
      }
      await tx.update(invitation).set({ acceptedAt: now, acceptedBy: user.id }).where(eq(invitation.id, inv.id));
      ids.push(membershipId);
    }
    return ids;
  });
}
