import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDS, errorText, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { invitation, membership } from './schema';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

async function seedUser(id: string, email: string) {
  await dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values (${id}, ${email}, ${email}, true)`);
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await dbs.owner.execute(sql`truncate auth."user" cascade`);
  await seedTenancy(dbs.owner);
  await seedUser('u1', 'one@example.com');
});

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);

describe('membership', () => {
  it('stores an agency admin with no client', async () => {
    await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 'test' });
    expect(await dbs.service.select().from(membership)).toHaveLength(1);
  });

  it('requires a client for client roles and forbids one for agency roles', async () => {
    expect(await errorText(dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'client_owner', createdBy: 't' }))).toMatch(/membership_role_scope_check/);
    expect(await errorText(dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'agency_admin', clientId: IDS.clientA1, createdBy: 't' }))).toMatch(/membership_role_scope_check/);
  });

  it('allows client_scope only for account managers and never empty', async () => {
    expect(await errorText(dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'agency_admin', clientScope: [IDS.clientA1], createdBy: 't' }))).toMatch(/membership_client_scope_check/);
    expect(await errorText(dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'account_manager', clientScope: [], createdBy: 't' }))).toMatch(/membership_client_scope_check/);
    await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'account_manager', clientScope: [IDS.clientA1], createdBy: 't' });
  });

  it('rejects a client of another agency (composite FK)', async () => {
    expect(await errorText(dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'client_owner', clientId: IDS.clientB1, createdBy: 't' }))).toMatch(/foreign key/);
  });

  it('rejects an unknown user and cascades when the user is deleted', async () => {
    expect(await errorText(dbs.service.insert(membership).values({ userId: 'nobody', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 't' }))).toMatch(/membership_user_id_fk/);
    await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 't' });
    await dbs.owner.execute(sql`delete from auth."user" where id = 'u1'`);
    expect(await dbs.service.select().from(membership)).toHaveLength(0);
  });

  it('is invisible and read-only to app_user', async () => {
    expect(await errorText(dbs.app.select().from(membership))).toMatch(/permission denied/);
    expect(await errorText(dbs.app.select().from(invitation))).toMatch(/permission denied/);
    expect(await errorText(dbs.app.execute(sql`select * from auth."user"`))).toMatch(/permission denied/);
  });
});

describe('invitation', () => {
  it('allows one pending invitation per agency, client and email, case-insensitively', async () => {
    await dbs.service.insert(invitation).values({ agencyId: IDS.agencyA, email: 'New@Example.com', role: 'agency_admin', invitedBy: 't', expiresAt: inDays(14) });
    expect(await errorText(dbs.service.insert(invitation).values({ agencyId: IDS.agencyA, email: 'new@example.com', role: 'account_manager', invitedBy: 't', expiresAt: inDays(14) }))).toMatch(/invitation_pending_unique/);
    await dbs.service.update(invitation).set({ revokedAt: new Date() });
    await dbs.service.insert(invitation).values({ agencyId: IDS.agencyA, email: 'new@example.com', role: 'account_manager', invitedBy: 't', expiresAt: inDays(14) });
  });

  it('rejects malformed emails', async () => {
    expect(await errorText(dbs.service.insert(invitation).values({ agencyId: IDS.agencyA, email: 'nope', role: 'agency_admin', invitedBy: 't', expiresAt: inDays(1) }))).toMatch(/invitation_email_check/);
  });
});
