import { client, contact, membership } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { accessContextFor, coversClient, guestAccessFor, listMemberships, pickMembership } from './memberships';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedUser(dbs.owner, 'u1', 'p@e.co');
});

async function member(values: Partial<typeof membership.$inferInsert>) {
  const [m] = await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 't', ...values }).returning();
  return m!;
}

describe('listMemberships / pickMembership', () => {
  it('lists the user memberships oldest first with agency and client names', async () => {
    await member({ role: 'client_owner', clientId: IDS.clientA1, createdAt: new Date('2026-10-02T00:00:00Z') });
    await member({ agencyId: IDS.agencyB, role: 'agency_admin', createdAt: new Date('2026-10-01T00:00:00Z') });
    const list = await listMemberships(dbs.service, 'u1');
    expect(list.map((m) => [m.agencyName, m.clientName])).toEqual([['Agency B', null], ['Agency A', 'A1 HVAC']]);
    expect(pickMembership(list, undefined)?.agencyName).toBe('Agency B');
    expect(pickMembership(list, list[1]!.id)?.clientName).toBe('A1 HVAC');
    expect(pickMembership(list, 'not-mine')?.agencyName).toBe('Agency B');
    expect(pickMembership([], undefined)).toBeNull();
  });
});

describe('accessContextFor', () => {
  it('gives agency admins every client', async () => {
    await member({});
    const [m] = await listMemberships(dbs.service, 'u1');
    const ctx = await accessContextFor(dbs.service, 'u1', m!);
    expect(ctx).toMatchObject({ agencyId: IDS.agencyA, userId: 'u1', role: 'agency_admin', clientScope: 'all' });
  });

  it('scopes account managers to their list, or all when NULL', async () => {
    await member({ role: 'account_manager', clientScope: [IDS.clientA2] });
    const [m] = await listMemberships(dbs.service, 'u1');
    expect((await accessContextFor(dbs.service, 'u1', m!)).clientScope).toEqual([IDS.clientA2]);
  });

  it('gives client roles their client and the client feature flags (unknown flags dropped)', async () => {
    await dbs.owner.update(client).set({ features: ['dashboard', 'briefs_only', 'bogus'] }).where(eq(client.id, IDS.clientA1));
    await member({ role: 'client_viewer', clientId: IDS.clientA1 });
    const [m] = await listMemberships(dbs.service, 'u1');
    const ctx = await accessContextFor(dbs.service, 'u1', m!);
    expect(ctx.clientScope).toEqual([IDS.clientA1]);
    expect([...ctx.features]).toEqual(['dashboard']);
  });
});

describe('coversClient (5b-2 decision 16)', () => {
  const base = { id: 'm', agencyName: 'A', clientName: null, contactId: null, createdAt: new Date() };
  it('matches agency admins and unrestricted AMs of the client’s agency, scoped AMs in scope, and client roles of that client', () => {
    expect(coversClient({ ...base, agencyId: IDS.agencyA, role: 'agency_admin', clientId: null, clientScope: null }, IDS.clientA1, IDS.agencyA)).toBe(true);
    expect(coversClient({ ...base, agencyId: IDS.agencyB, role: 'agency_admin', clientId: null, clientScope: null }, IDS.clientA1, IDS.agencyA)).toBe(false);
    expect(coversClient({ ...base, agencyId: IDS.agencyA, role: 'account_manager', clientId: null, clientScope: null }, IDS.clientA1, IDS.agencyA)).toBe(true);
    expect(coversClient({ ...base, agencyId: IDS.agencyA, role: 'account_manager', clientId: null, clientScope: [IDS.clientA2] }, IDS.clientA1, IDS.agencyA)).toBe(false);
    expect(coversClient({ ...base, agencyId: IDS.agencyA, role: 'client_viewer', clientId: IDS.clientA1, clientScope: null }, IDS.clientA1, IDS.agencyA)).toBe(true);
    expect(coversClient({ ...base, agencyId: IDS.agencyA, role: 'client_viewer', clientId: IDS.clientA2, clientScope: null }, IDS.clientA1, IDS.agencyA)).toBe(false);
  });
});

describe('guestAccessFor', () => {
  async function clientContact(values: Partial<typeof contact.$inferInsert> = {}) {
    const [c] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'g@e.co', ...values }).returning();
    return c!;
  }
  const iat = Math.floor(new Date('2026-10-05T12:00:00Z').getTime() / 1000);

  it('gives an active client contact a read-only client_viewer context', async () => {
    const c = await clientContact();
    const ctx = await guestAccessFor(dbs.service, { contactId: c.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, iat });
    expect(ctx).toMatchObject({ userId: `contact:${c.id}`, role: 'client_viewer', clientScope: [IDS.clientA1] });
  });

  it('refuses inactive contacts, revoked links, agency contacts and mismatched claims', async () => {
    const inactive = await clientContact({ active: false });
    expect(await guestAccessFor(dbs.service, { contactId: inactive.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, iat })).toBeNull();
    const revoked = await clientContact({ email: 'r@e.co', linksRevokedBefore: new Date('2026-10-06T00:00:00Z') });
    expect(await guestAccessFor(dbs.service, { contactId: revoked.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, iat })).toBeNull();
    const [agencyContact] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, role: 'account_manager', email: 'am@e.co' }).returning();
    expect(await guestAccessFor(dbs.service, { contactId: agencyContact!.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, iat })).toBeNull();
    const ok = await clientContact({ email: 'ok@e.co' });
    expect(await guestAccessFor(dbs.service, { contactId: ok.id, agencyId: IDS.agencyB, clientId: IDS.clientA1, iat })).toBeNull();
    expect(await guestAccessFor(dbs.service, { contactId: ok.id, agencyId: IDS.agencyA, clientId: IDS.clientA2, iat })).toBeNull();
  });
});
