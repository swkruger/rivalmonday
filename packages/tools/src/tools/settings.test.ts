import { type AuditEvent, createAccessContext } from '@cs/core';
import { agency, contact, invitation, membership } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const audit: AuditEvent[] = [];
const registry = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async (e) => void audit.push(e) } });
const admin = createAccessContext({ agencyId: IDS.agencyA, userId: 'admin', role: 'agency_admin', clientScope: 'all', features: [] });
const am = createAccessContext({ agencyId: IDS.agencyA, userId: 'am', role: 'account_manager', clientScope: [IDS.clientA1], features: [] });
const me = createAccessContext({ agencyId: IDS.agencyA, userId: 'u1', role: 'client_viewer', clientScope: [IDS.clientA1], features: [] });
const guest = createAccessContext({ agencyId: IDS.agencyA, userId: 'contact:00000000-0000-4000-8000-000000000001', role: 'client_viewer', clientScope: [IDS.clientA1], features: [] });

beforeEach(async () => {
  audit.length = 0;
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedUser(dbs.owner, 'admin', 'admin@e.co');
  await seedUser(dbs.owner, 'u1', 'u1@e.co');
  await dbs.service.insert(membership).values({ userId: 'admin', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 'seed' });
});

describe('settings writes are audited tools (m4)', () => {
  it('invites and revokes through the registry, one audit row per call', async () => {
    const { invitationId } = (await registry.invoke(admin, 'invite_member', { email: 'new@e.co', role: 'client_viewer', clientId: IDS.clientA1 })) as { invitationId: string };
    await registry.invoke(admin, 'revoke_invitation', { invitationId });
    expect((await dbs.owner.select().from(invitation))[0]!.revokedAt).not.toBeNull();
    expect(audit.map((a) => [a.tool, a.outcome])).toEqual([['invite_member', 'ok'], ['revoke_invitation', 'ok']]);
  });

  it('saves branding (admins only) and audits the refusal too', async () => {
    await registry.invoke(admin, 'update_agency_branding', { displayName: 'Peak Digital', primary: '#112233' });
    expect((await dbs.owner.select().from(agency).where(eq(agency.id, IDS.agencyA)))[0]!.branding).toMatchObject({ displayName: 'Peak Digital', primary: '#112233' });
    await expect(registry.invoke(am, 'update_agency_branding', { displayName: 'x' })).rejects.toMatchObject({ code: 'permission_denied' });
    expect(audit.at(-1)).toMatchObject({ tool: 'update_agency_branding', outcome: 'permission_denied' });
  });

  it('turns malformed ids into invalid_input instead of a driver error (m2)', async () => {
    await expect(registry.invoke(admin, 'revoke_membership', { membershipId: 'nope' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(admin, 'deactivate_recipient', { contactId: "1' or 1=1" })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('adds and deactivates a client recipient, and updates delivery', async () => {
    const { contactId } = (await registry.invoke(am, 'add_client_recipient', { clientId: IDS.clientA1, email: 'owner@a1.co', name: null, role: 'client_owner' })) as { contactId: string };
    await registry.invoke(am, 'update_client_delivery', { clientId: IDS.clientA1, alertMode: 'digest_only', briefAutoSend: true, timezone: 'America/Denver' });
    await registry.invoke(am, 'deactivate_recipient', { contactId });
    expect((await dbs.owner.select().from(contact).where(eq(contact.id, contactId)))[0]!.active).toBe(false);
    await expect(registry.invoke(am, 'update_client_delivery', { clientId: IDS.clientA2, alertMode: 'direct' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('lets a signed-in user change their own contact, never a guest', async () => {
    const [c] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_viewer', email: 'u1@e.co', userId: 'u1' }).returning();
    await registry.invoke(me, 'update_my_contact', { contactId: c!.id, timezone: 'America/Denver', quietHours: { start: '21:00', end: '07:00' } });
    await registry.invoke(me, 'set_my_notification_pref', { contactId: c!.id, kind: 'brief', channel: 'email', enabled: false });
    await expect(registry.invoke(me, 'update_my_contact', { contactId: c!.id, quietHours: { start: '25:00', end: '07:00' } })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(guest, 'update_my_contact', { contactId: c!.id, timezone: 'UTC' })).rejects.toMatchObject({ code: 'permission_denied' });
  });
});
