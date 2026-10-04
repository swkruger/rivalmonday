import { createAccessContext } from '@cs/core';
import { contact, invitation, membership } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { inviteMember, listTeam, revokeInvitation, revokeMembership } from './team';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const NOW = new Date('2026-10-05T12:00:00Z');
const admin = createAccessContext({ agencyId: IDS.agencyA, userId: 'admin', role: 'agency_admin', clientScope: 'all', features: [] });
const am = createAccessContext({ agencyId: IDS.agencyA, userId: 'am', role: 'account_manager', clientScope: [IDS.clientA1], features: [] });
const owner = createAccessContext({ agencyId: IDS.agencyA, userId: 'own', role: 'client_owner', clientScope: [IDS.clientA1], features: [] });

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedUser(dbs.owner, 'admin', 'admin@e.co');
  await seedUser(dbs.owner, 'am', 'am@e.co');
  await dbs.service.insert(membership).values([
    { userId: 'admin', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 'seed' },
    { userId: 'am', agencyId: IDS.agencyA, role: 'account_manager', clientScope: [IDS.clientA1], createdBy: 'seed' },
  ]);
});

describe('inviteMember', () => {
  it('lets admins invite any role in their agency', async () => {
    await inviteMember(dbs.service, admin, { email: 'x@e.co', role: 'agency_admin' }, NOW);
    await inviteMember(dbs.service, admin, { email: 'y@e.co', role: 'client_owner', clientId: IDS.clientA2 }, NOW);
    expect(await dbs.service.select().from(invitation)).toHaveLength(2);
  });

  it('lets account managers invite client roles for clients in scope only', async () => {
    await inviteMember(dbs.service, am, { email: 'y@e.co', role: 'client_viewer', clientId: IDS.clientA1 }, NOW);
    await expect(inviteMember(dbs.service, am, { email: 'y@e.co', role: 'client_viewer', clientId: IDS.clientA2 }, NOW)).rejects.toMatchObject({ code: 'not_found' });
    await expect(inviteMember(dbs.service, am, { email: 'z@e.co', role: 'account_manager' }, NOW)).rejects.toMatchObject({ code: 'permission_denied' });
  });

  it('refuses client roles', async () => {
    await expect(inviteMember(dbs.service, owner, { email: 'v@e.co', role: 'client_viewer', clientId: IDS.clientA1 }, NOW)).rejects.toMatchObject({ code: 'permission_denied' });
  });

  it('refuses to invite an existing admin’s email as account_manager (would demote them on sign-in, bypassing the last-admin check)', async () => {
    await expect(inviteMember(dbs.service, admin, { email: 'admin@e.co', role: 'account_manager' }, NOW)).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

describe('listTeam', () => {
  it('shows admins every member and pending invitation; AMs only their clients’ client roles', async () => {
    await seedUser(dbs.owner, 'c1', 'c1@e.co');
    await seedUser(dbs.owner, 'c2', 'c2@e.co');
    await dbs.service.insert(membership).values([
      { userId: 'c1', agencyId: IDS.agencyA, role: 'client_owner', clientId: IDS.clientA1, createdBy: 'x' },
      { userId: 'c2', agencyId: IDS.agencyA, role: 'client_owner', clientId: IDS.clientA2, createdBy: 'x' },
    ]);
    await inviteMember(dbs.service, admin, { email: 'p@e.co', role: 'client_viewer', clientId: IDS.clientA2 }, NOW);
    const full = await listTeam(dbs.service, admin, NOW);
    expect(full.members.map((m) => m.email).sort()).toEqual(['admin@e.co', 'am@e.co', 'c1@e.co', 'c2@e.co']);
    expect(full.invitations.map((i) => i.email)).toEqual(['p@e.co']);
    const scoped = await listTeam(dbs.service, am, NOW);
    expect(scoped.members.map((m) => m.email)).toEqual(['c1@e.co']);
    expect(scoped.invitations).toEqual([]);
  });
});

describe('revokeMembership', () => {
  it('removes the membership, unlinks the contact and revokes its links', async () => {
    await seedUser(dbs.owner, 'c1', 'c1@e.co');
    const [c] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'c1@e.co', userId: 'c1' }).returning();
    const [m] = await dbs.service.insert(membership).values({ userId: 'c1', agencyId: IDS.agencyA, role: 'client_owner', clientId: IDS.clientA1, contactId: c!.id, createdBy: 'x' }).returning();
    await revokeMembership(dbs.service, am, m!.id, NOW);
    expect(await dbs.service.select().from(membership).where(eq(membership.id, m!.id))).toEqual([]);
    const [after] = await dbs.service.select().from(contact).where(eq(contact.id, c!.id));
    expect(after).toMatchObject({ userId: null, active: false });
    expect(after!.linksRevokedBefore?.toISOString()).toBe(NOW.toISOString());
  });

  it('refuses to remove the last agency admin, and AMs cannot remove agency roles', async () => {
    const [adminRow] = await dbs.service.select().from(membership).where(eq(membership.userId, 'admin'));
    await expect(revokeMembership(dbs.service, admin, adminRow!.id, NOW)).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(revokeMembership(dbs.service, am, adminRow!.id, NOW)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('does not see memberships of another agency', async () => {
    await seedUser(dbs.owner, 'b', 'b@e.co');
    const [m] = await dbs.service.insert(membership).values({ userId: 'b', agencyId: IDS.agencyB, role: 'agency_admin', createdBy: 'x' }).returning();
    await expect(revokeMembership(dbs.service, admin, m!.id, NOW)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('revokeInvitation', () => {
  it('revokes a pending invitation the caller could have created', async () => {
    const { id } = await inviteMember(dbs.service, am, { email: 'y@e.co', role: 'client_viewer', clientId: IDS.clientA1 }, NOW);
    await revokeInvitation(dbs.service, am, id, NOW);
    const [row] = await dbs.service.select().from(invitation).where(eq(invitation.id, id));
    expect(row!.revokedAt).not.toBeNull();
  });
});
