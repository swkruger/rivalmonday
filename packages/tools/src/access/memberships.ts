import { type AccessContext, createAccessContext, type Feature, FEATURES, isAgencyRole, type Role } from '@cs/core';
import { agency, client, contact, type Db, membership } from '@cs/db';
import { and, asc, eq } from 'drizzle-orm';

export interface MembershipSummary {
  id: string;
  agencyId: string;
  agencyName: string;
  role: Role;
  clientId: string | null;
  clientName: string | null;
  clientScope: string[] | null;
  contactId: string | null;
  createdAt: Date;
}

export async function listMemberships(service: Db, userId: string): Promise<MembershipSummary[]> {
  const rows = await service
    .select({ m: membership, agencyName: agency.name, clientName: client.name })
    .from(membership)
    .innerJoin(agency, eq(agency.id, membership.agencyId))
    .leftJoin(client, eq(client.id, membership.clientId))
    .where(eq(membership.userId, userId))
    .orderBy(asc(membership.createdAt), asc(membership.id));
  return rows.map(({ m, agencyName, clientName }) => ({
    id: m.id, agencyId: m.agencyId, agencyName, role: m.role as Role, clientId: m.clientId, clientName: clientName ?? null,
    clientScope: m.clientScope ?? null, contactId: m.contactId, createdAt: m.createdAt,
  }));
}

/** Decision 4: the cookie's membership when it is one of the user's own, else the oldest. */
export function pickMembership(list: MembershipSummary[], wantedId: string | undefined): MembershipSummary | null {
  return list.find((m) => m.id === wantedId) ?? list[0] ?? null;
}

/** 5b-2 decision 16: whether this membership grants access to `clientId` (whose agency is `clientAgencyId`). */
export function coversClient(m: MembershipSummary, clientId: string, clientAgencyId: string): boolean {
  if (m.agencyId !== clientAgencyId) return false;
  if (m.role === 'agency_admin') return true;
  if (m.role === 'account_manager') return m.clientScope === null || m.clientScope.includes(clientId);
  return m.clientId === clientId;
}

const knownFeatures = (raw: unknown): Feature[] =>
  Array.isArray(raw) ? raw.filter((f): f is Feature => (FEATURES as readonly string[]).includes(f as string)) : [];

async function clientFeatures(service: Db, clientId: string): Promise<Feature[]> {
  const [row] = await service.select({ features: client.features }).from(client).where(eq(client.id, clientId));
  return knownFeatures(row?.features);
}

/** Decision 3. Rebuilt on every request so a revoked membership or changed flag applies at once. */
export async function accessContextFor(service: Db, userId: string, m: MembershipSummary): Promise<AccessContext> {
  if (isAgencyRole(m.role)) {
    return createAccessContext({ agencyId: m.agencyId, userId, role: m.role, clientScope: m.role === 'account_manager' && m.clientScope ? m.clientScope : 'all', features: [] });
  }
  return createAccessContext({ agencyId: m.agencyId, userId, role: m.role, clientScope: [m.clientId!], features: await clientFeatures(service, m.clientId!) });
}

export interface GuestSessionClaims {
  contactId: string;
  agencyId: string;
  clientId: string;
  /** Seconds since epoch when the guest cookie was issued. */
  iat: number;
}

/** Decision 6: read-only access for a client contact who opened a signed email link; null when it must be refused. */
export async function guestAccessFor(service: Db, g: GuestSessionClaims): Promise<AccessContext | null> {
  const [c] = await service.select().from(contact).where(and(eq(contact.id, g.contactId), eq(contact.agencyId, g.agencyId)));
  if (!c || !c.active || c.clientId === null || c.clientId !== g.clientId) return null;
  if (c.linksRevokedBefore && g.iat * 1000 < c.linksRevokedBefore.getTime()) return null;
  return createAccessContext({ agencyId: g.agencyId, userId: `contact:${c.id}`, role: 'client_viewer', clientScope: [g.clientId], features: await clientFeatures(service, g.clientId) });
}
