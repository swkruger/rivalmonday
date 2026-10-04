import { contact, invitation, membership } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { acceptInvitations, createInvitation, hasSignInRight, invitationProblem } from './invitations';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
});
const NOW = new Date('2026-10-05T12:00:00Z');

describe('invitationProblem', () => {
  const base = { agencyId: IDS.agencyA, email: 'a@b.co', invitedBy: 'x' };
  it('accepts valid shapes', () => {
    expect(invitationProblem({ ...base, role: 'agency_admin' })).toBeNull();
    expect(invitationProblem({ ...base, role: 'client_viewer', clientId: IDS.clientA1 })).toBeNull();
    expect(invitationProblem({ ...base, role: 'account_manager', clientScope: [IDS.clientA1] })).toBeNull();
  });
  it('rejects bad shapes', () => {
    expect(invitationProblem({ ...base, email: 'nope', role: 'agency_admin' })).toMatch(/email/);
    expect(invitationProblem({ ...base, role: 'client_owner' })).toMatch(/client/);
    expect(invitationProblem({ ...base, role: 'agency_admin', clientId: IDS.clientA1 })).toMatch(/client/);
    expect(invitationProblem({ ...base, role: 'agency_admin', clientScope: [IDS.clientA1] })).toMatch(/scope/);
    expect(invitationProblem({ ...base, role: 'account_manager', clientScope: [] })).toMatch(/scope/);
    expect(invitationProblem({ ...base, role: 'owner' as never })).toMatch(/role/);
  });
});

describe('createInvitation', () => {
  it('stores a lower-cased, trimmed email with a 14-day expiry', async () => {
    const r = await createInvitation(dbs.service, { agencyId: IDS.agencyA, email: '  Pat@Example.COM ', role: 'agency_admin', invitedBy: 'x' }, NOW);
    expect(r.expiresAt.toISOString()).toBe('2026-10-19T12:00:00.000Z');
    const [row] = await dbs.service.select().from(invitation).where(eq(invitation.id, r.id));
    expect(row!.email).toBe('pat@example.com');
  });

  it('replaces a previous pending invitation for the same scope', async () => {
    const a = await createInvitation(dbs.service, { agencyId: IDS.agencyA, email: 'p@e.co', role: 'agency_admin', invitedBy: 'x' }, NOW);
    await createInvitation(dbs.service, { agencyId: IDS.agencyA, email: 'P@e.co', role: 'account_manager', invitedBy: 'x' }, NOW);
    const [old] = await dbs.service.select().from(invitation).where(eq(invitation.id, a.id));
    expect(old!.revokedAt).not.toBeNull();
  });

  it('refuses a client or scoped client of another agency', async () => {
    await expect(createInvitation(dbs.service, { agencyId: IDS.agencyA, email: 'p@e.co', role: 'client_owner', clientId: IDS.clientB1, invitedBy: 'x' }, NOW)).rejects.toMatchObject({ code: 'not_found' });
    await expect(createInvitation(dbs.service, { agencyId: IDS.agencyA, email: 'p@e.co', role: 'account_manager', clientScope: [IDS.clientA1, IDS.clientB1], invitedBy: 'x' }, NOW)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('hasSignInRight', () => {
  it('is true for a pending, unexpired invitation (any case) and false otherwise', async () => {
    expect(await hasSignInRight(dbs.service, 'p@e.co', NOW)).toBe(false);
    await createInvitation(dbs.service, { agencyId: IDS.agencyA, email: 'p@e.co', role: 'agency_admin', invitedBy: 'x' }, NOW);
    expect(await hasSignInRight(dbs.service, 'P@E.CO', NOW)).toBe(true);
    expect(await hasSignInRight(dbs.service, 'p@e.co', new Date('2026-11-01T00:00:00Z'))).toBe(false);
  });

  it('is true for an existing user with a membership, false for one without', async () => {
    await seedUser(dbs.owner, 'u1', 'member@e.co');
    expect(await hasSignInRight(dbs.service, 'member@e.co', NOW)).toBe(false);
    await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 'x' });
    expect(await hasSignInRight(dbs.service, 'Member@E.co', NOW)).toBe(true);
  });
});

describe('acceptInvitations', () => {
  it('turns every pending invitation for the email into a membership with a linked contact', async () => {
    await seedUser(dbs.owner, 'u1', 'p@e.co');
    await createInvitation(dbs.service, { agencyId: IDS.agencyA, email: 'p@e.co', role: 'account_manager', clientScope: [IDS.clientA1], invitedBy: 'x' }, NOW);
    await createInvitation(dbs.service, { agencyId: IDS.agencyB, email: 'p@e.co', role: 'client_viewer', clientId: IDS.clientB1, invitedBy: 'x' }, NOW);
    const ids = await acceptInvitations(dbs.service, { id: 'u1', email: 'P@e.co', name: 'Pat' }, NOW);
    expect(ids).toHaveLength(2);
    const rows = await dbs.service.select().from(membership);
    expect(rows.map((m) => m.role).sort()).toEqual(['account_manager', 'client_viewer']);
    const contacts = await dbs.service.select().from(contact);
    expect(contacts).toHaveLength(2);
    expect(contacts.every((c) => c.userId === 'u1')).toBe(true);
    expect(rows.every((m) => m.contactId !== null)).toBe(true);
    const am = contacts.find((c) => c.role === 'account_manager')!;
    expect(am.clientScope).toEqual([IDS.clientA1]);
    expect((await dbs.service.select().from(invitation)).every((i) => i.acceptedBy === 'u1')).toBe(true);
  });

  it('links an existing contact with the same email instead of creating one', async () => {
    await seedUser(dbs.owner, 'u1', 'p@e.co');
    await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'P@E.co', active: false });
    await createInvitation(dbs.service, { agencyId: IDS.agencyA, email: 'p@e.co', role: 'client_owner', clientId: IDS.clientA1, invitedBy: 'x' }, NOW);
    await acceptInvitations(dbs.service, { id: 'u1', email: 'p@e.co' }, NOW);
    const contacts = await dbs.service.select().from(contact);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ userId: 'u1', active: true });
  });

  it('ignores expired and revoked invitations and is idempotent', async () => {
    await seedUser(dbs.owner, 'u1', 'p@e.co');
    await createInvitation(dbs.service, { agencyId: IDS.agencyA, email: 'p@e.co', role: 'agency_admin', invitedBy: 'x' }, new Date('2026-09-01T00:00:00Z'));
    expect(await acceptInvitations(dbs.service, { id: 'u1', email: 'p@e.co' }, NOW)).toEqual([]);
    await createInvitation(dbs.service, { agencyId: IDS.agencyA, email: 'p@e.co', role: 'agency_admin', invitedBy: 'x' }, NOW);
    expect(await acceptInvitations(dbs.service, { id: 'u1', email: 'p@e.co' }, NOW)).toHaveLength(1);
    expect(await acceptInvitations(dbs.service, { id: 'u1', email: 'p@e.co' }, NOW)).toEqual([]);
  });

  it('keeps an existing membership for the same scope and updates its role', async () => {
    await seedUser(dbs.owner, 'u1', 'p@e.co');
    await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'client_viewer', clientId: IDS.clientA1, createdBy: 'x' });
    await createInvitation(dbs.service, { agencyId: IDS.agencyA, email: 'p@e.co', role: 'client_owner', clientId: IDS.clientA1, invitedBy: 'x' }, NOW);
    await acceptInvitations(dbs.service, { id: 'u1', email: 'p@e.co' }, NOW);
    const rows = await dbs.service.select().from(membership);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.role).toBe('client_owner');
  });
});
