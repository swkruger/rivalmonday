import { type AccessContext, createAccessContext } from '@cs/core';
import { agencyConnect, client, clientSetup, contact, invitation, membership, notification } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import type { DeliveryConfig } from '@cs/engine';
import { renderEmail, type EmailPayload } from '@cs/email';
import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import type { ToolDeps } from '../deps';
import { createToolRegistry } from '../registry';
import { clientOwnerEmails } from '../tools/client-billing';
import { inviteClientUser } from './client-invite';
import { acceptInvitations } from './invitations';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const NOW = new Date('2026-10-17T12:00:00Z');
const delivery: DeliveryConfig = { appUrl: 'https://app.test', linkSecrets: ['s'.repeat(40)], fromAddress: 'briefs@app.test' };
const mk = (userId: string, role: AccessContext['role'], scope: AccessContext['clientScope'] = 'all') =>
  createAccessContext({ agencyId: IDS.agencyA, userId, role, clientScope: scope, features: [] });
const admin = mk('admin', 'agency_admin');
const am = mk('am', 'account_manager', [IDS.clientA2]);
const deps = (over: Partial<ToolDeps> = {}): ToolDeps => ({ app: dbs.app, service: dbs.service, delivery, ...over });
const registry = (over: Partial<ToolDeps> = {}) => createToolRegistry(deps(over), { audit: { record: async () => {} } });

const invites = () => dbs.service.select().from(invitation).orderBy(invitation.createdAt);
const contacts = () => dbs.service.select().from(contact);
const rows = () => dbs.service.select().from(notification).where(eq(notification.kind, 'client_invite'));
const payloadOf = (n: typeof notification.$inferSelect) => n.payload as unknown as EmailPayload & { cc: string[] };
const startUrl = (n: typeof notification.$inferSelect) => (payloadOf(n).props as { startUrl: string }).startUrl;
const openSetup = (clientId: string = IDS.clientA1) => dbs.owner.insert(clientSetup).values({ clientId, agencyId: IDS.agencyA });

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedUser(dbs.owner, 'admin', 'Admin@E.co');
  await seedUser(dbs.owner, 'am', 'am@e.co');
  await dbs.service.insert(membership).values([
    { userId: 'admin', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 'seed' },
    { userId: 'am', agencyId: IDS.agencyA, role: 'account_manager', clientScope: [IDS.clientA2], createdBy: 'seed' },
  ]);
});

describe('inviteClientUser', () => {
  it('account manager outside scope refused', async () => {
    await expect(inviteClientUser(am, deps(), { clientId: IDS.clientA1, email: 'o@x.co', name: null, role: 'client_owner' }, NOW)).rejects.toMatchObject({ code: 'not_found' });
    // Another agency's client is refused too (scope 'all' passes canAccessClient; the agency check must catch it).
    await expect(inviteClientUser(admin, deps(), { clientId: IDS.clientB1, email: 'o@x.co', name: null, role: 'client_owner' }, NOW)).rejects.toMatchObject({ code: 'not_found' });
    expect(await invites()).toHaveLength(0);
    expect(await contacts()).toHaveLength(0);
  });

  it('client roles refused', async () => {
    const owner = mk('own', 'client_owner', [IDS.clientA1]);
    await expect(inviteClientUser(owner, deps(), { clientId: IDS.clientA1, email: 'o@x.co', name: null, role: 'client_viewer' }, NOW)).rejects.toMatchObject({ code: 'permission_denied' });
    const guest = mk('contact:abc', 'agency_admin');
    await expect(inviteClientUser(guest, deps(), { clientId: IDS.clientA1, email: 'o@x.co', name: null, role: 'client_owner' }, NOW)).rejects.toMatchObject({ code: 'permission_denied' });
    expect(await invites()).toHaveLength(0);
  });

  it('creates an inactive contact and one client_invite row with cc', async () => {
    await openSetup();
    const r = await inviteClientUser(admin, deps(), { clientId: IDS.clientA1, email: ' Owner@Smith.co ', name: 'Pat Owner', role: 'client_owner' }, NOW);
    const [inv] = await invites();
    expect(inv).toMatchObject({ id: r.invitationId, email: 'owner@smith.co', role: 'client_owner', clientId: IDS.clientA1, invitedBy: 'admin' });
    expect(r.expiresAt.getTime()).toBe(NOW.getTime() + 14 * 86_400_000);
    const [c] = await contacts();
    expect(c).toMatchObject({ id: r.contactId, active: false, role: 'client_owner', clientId: IDS.clientA1, name: 'Pat Owner', email: 'owner@smith.co' });
    const [setup] = await dbs.service.select().from(clientSetup).where(eq(clientSetup.clientId, IDS.clientA1));
    expect(setup).toMatchObject({ invitedContactId: r.contactId, invitedBy: 'admin' });
    const out = await rows();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ contactId: r.contactId, channel: 'email', address: 'owner@smith.co', subjectType: 'setup', subjectId: IDS.clientA1, status: 'pending' });
    expect(out[0]!.dedupeKey).toBe(`client-invite:${r.invitationId}:${r.contactId}:email`);
    const p = payloadOf(out[0]!);
    expect(p.template).toBe('client_invite');
    expect(p.cc).toEqual(['admin@e.co']);
    expect(p.props).toMatchObject({ businessName: 'A1 HVAC', agencyName: 'Agency A' });
    expect(startUrl(out[0]!)).toBe(`https://app.test/sign-in?email=owner%40smith.co&next=${encodeURIComponent(`/c/${IDS.clientA1}/setup`)}`);
    const rendered = await renderEmail(p);
    expect(rendered.subject).toBe('Agency A invited you to see your competitors');
  });

  it('re-invite same email reuses the contact and queues a new row (new invitation id)', async () => {
    const a = await inviteClientUser(admin, deps(), { clientId: IDS.clientA1, email: 'o@x.co', name: null, role: 'client_owner' }, NOW);
    const b = await inviteClientUser(admin, deps(), { clientId: IDS.clientA1, email: 'O@X.co', name: 'Later Name', role: 'client_owner' }, new Date(NOW.getTime() + 60_000));
    expect(b.contactId).toBe(a.contactId);
    expect(b.invitationId).not.toBe(a.invitationId);
    expect(await contacts()).toHaveLength(1);
    const pending = await dbs.service.select().from(invitation).where(isNull(invitation.revokedAt));
    expect(pending.map((i) => i.id)).toEqual([b.invitationId]);
    expect((await rows()).map((n) => n.dedupeKey).sort()).toEqual([`client-invite:${a.invitationId}:${a.contactId}:email`, `client-invite:${b.invitationId}:${a.contactId}:email`].sort());
  });

  it('re-invite keeps an existing active contact active', async () => {
    const [existing] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_viewer', email: 'o@x.co', active: true }).returning();
    const r = await inviteClientUser(admin, deps(), { clientId: IDS.clientA1, email: 'o@x.co', name: null, role: 'client_owner' }, NOW);
    expect(r.contactId).toBe(existing!.id);
    const [c] = await contacts();
    expect(c).toMatchObject({ active: true, role: 'client_owner' });
  });

  it('concurrent invites end with one pending invitation and one contact', async () => {
    const input = { clientId: IDS.clientA1, email: 'race@x.co', name: null, role: 'client_owner' as const };
    // Wizard + team page racing (several, to make interleaving likely on the 5-connection pool).
    const out = await Promise.all([1, 2, 3, 4].map((i) => inviteClientUser(admin, deps(), { ...input, role: i % 2 ? 'client_owner' : 'client_viewer' }, NOW)));
    expect(new Set(out.map((r) => r.contactId)).size).toBe(1);
    expect(await contacts()).toHaveLength(1);
    const pending = await dbs.service.select().from(invitation).where(isNull(invitation.revokedAt));
    expect(pending).toHaveLength(1);
    expect(await invites()).toHaveLength(4);
  });

  it('prospect invite allowed', async () => {
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA2));
    const r = await inviteClientUser(am, deps(), { clientId: IDS.clientA2, email: 'p@x.co', name: null, role: 'client_owner' }, NOW);
    expect(r.invitationId).toBeTruthy();
    expect(await rows()).toHaveLength(1);
  });

  it('acceptance activates the contact', async () => {
    const r = await inviteClientUser(admin, deps(), { clientId: IDS.clientA1, email: 'o@x.co', name: null, role: 'client_owner' }, NOW);
    await seedUser(dbs.owner, 'u-o', 'o@x.co');
    const ids = await acceptInvitations(dbs.service, { id: 'u-o', email: 'o@x.co' }, new Date(NOW.getTime() + 1000));
    expect(ids).toHaveLength(1);
    const [c] = await contacts();
    expect(c).toMatchObject({ id: r.contactId, active: true, userId: 'u-o' });
    const [m] = await dbs.service.select().from(membership).where(eq(membership.userId, 'u-o'));
    expect(m).toMatchObject({ contactId: r.contactId, role: 'client_owner', clientId: IDS.clientA1 });
  });

  it('startUrl points at /c/<id> when the setup is closed', async () => {
    await dbs.owner.insert(clientSetup).values({ clientId: IDS.clientA1, agencyId: IDS.agencyA, completedAt: NOW });
    await inviteClientUser(admin, deps(), { clientId: IDS.clientA1, email: 'o@x.co', name: null, role: 'client_owner' }, NOW);
    const [n] = await rows();
    expect(startUrl(n!)).toBe(`https://app.test/sign-in?email=o%40x.co&next=${encodeURIComponent(`/c/${IDS.clientA1}`)}`);
    // No setup row at all reads as closed too.
    await inviteClientUser(admin, deps(), { clientId: IDS.clientA2, email: 'o2@x.co', name: null, role: 'client_owner' }, NOW);
    const n2 = (await rows()).find((x) => x.clientId === IDS.clientA2)!;
    expect(startUrl(n2)).toBe(`https://app.test/sign-in?email=o2%40x.co&next=${encodeURIComponent(`/c/${IDS.clientA2}`)}`);
  });

  it('startUrl points at /c/<id> once the owner steps are done, though the setup stays open for staff (billing todo)', async () => {
    await dbs.owner.update(client).set({ keywords: ['ac'], serviceArea: { center: { lat: 1, lng: 2 }, radiusKm: 5, zips: [] }, placeId: 'ChIJx' }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.insert(agencyConnect).values({ agencyId: IDS.agencyA, stripeAccountId: 'acct_1', status: 'connected', chargesEnabled: true, detailsSubmitted: true });
    await dbs.owner.insert(clientSetup).values({ clientId: IDS.clientA1, agencyId: IDS.agencyA, skipped: ['search'], competitorsDoneAt: NOW });
    await inviteClientUser(admin, deps(), { clientId: IDS.clientA1, email: 'o@x.co', name: null, role: 'client_owner' }, NOW);
    const [n] = await rows();
    expect(startUrl(n!)).toBe(`https://app.test/sign-in?email=o%40x.co&next=${encodeURIComponent(`/c/${IDS.clientA1}`)}`);
    const [row] = await dbs.service.select().from(clientSetup);
    expect(row!.completedAt).toBeNull(); // billing still todo
  });

  it('inviting the owner as the last open step completes the setup; a viewer invite does not', async () => {
    await dbs.owner.update(client).set({ keywords: ['ac'], serviceArea: { center: { lat: 1, lng: 2 }, radiusKm: 5, zips: [] }, placeId: 'ChIJx' }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.insert(clientSetup).values({ clientId: IDS.clientA1, agencyId: IDS.agencyA, skipped: ['search'], competitorsDoneAt: NOW });
    await inviteClientUser(admin, deps(), { clientId: IDS.clientA1, email: 'v@x.co', name: null, role: 'client_viewer' }, NOW);
    expect((await dbs.service.select().from(clientSetup))[0]!.completedAt).toBeNull();
    await inviteClientUser(admin, deps(), { clientId: IDS.clientA1, email: 'o@x.co', name: null, role: 'client_owner' }, NOW);
    expect((await dbs.service.select().from(clientSetup))[0]!.completedAt).toEqual(NOW); // billing reads skipped without Connect
  });

  it('without delivery still creates the invitation and contact, queues nothing and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await inviteClientUser(admin, deps({ delivery: null }), { clientId: IDS.clientA1, email: 'o@x.co', name: null, role: 'client_owner' }, NOW);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    expect(await invites()).toHaveLength(1);
    expect((await contacts())[0]).toMatchObject({ id: r.contactId, active: false });
    expect(await rows()).toHaveLength(0);
  });
});

describe('invite_client_owner tool', () => {
  it('returns the ids with an ISO expiry', async () => {
    await openSetup();
    const out = (await registry().invoke(admin, 'invite_client_owner', { clientId: IDS.clientA1, name: 'Pat', email: 'pat@x.co' })) as { invitationId: string; expiresAt: string; contactId: string };
    expect(out.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const [c] = await contacts();
    expect(c).toMatchObject({ id: out.contactId, name: 'Pat', active: false });
    expect(await rows()).toHaveLength(1);
  });

  it('re-inviting a different email revokes the previous pending owner invitation', async () => {
    await openSetup();
    // An unrelated pending owner invitation for another client stays untouched.
    await registry().invoke(admin, 'invite_client_owner', { clientId: IDS.clientA2, name: 'Other', email: 'pat@acme.co' });
    const first = (await registry().invoke(admin, 'invite_client_owner', { clientId: IDS.clientA1, name: 'Pat', email: 'pat@acme.co' })) as { invitationId: string; contactId: string };
    const second = (await registry().invoke(admin, 'invite_client_owner', { clientId: IDS.clientA1, name: 'Pat', email: 'pat@acme.com' })) as { invitationId: string; contactId: string };
    expect(second.contactId).not.toBe(first.contactId);
    const pending = (await dbs.service.select().from(invitation).where(isNull(invitation.revokedAt))).map((i) => `${i.clientId}:${i.email}`).sort();
    expect(pending).toEqual([`${IDS.clientA1}:pat@acme.com`, `${IDS.clientA2}:pat@acme.co`].sort());
    expect((await invites()).find((i) => i.id === first.invitationId)!.revokedAt).toBeInstanceOf(Date);
    expect(await clientOwnerEmails(dbs.service, IDS.clientA1, new Date())).toEqual(['pat@acme.com']);
    const [setup] = await dbs.service.select().from(clientSetup).where(eq(clientSetup.clientId, IDS.clientA1));
    expect(setup!.invitedContactId).toBe(second.contactId);
  });
});

describe('invite_member with client roles', () => {
  it('team-page invite of a second owner does not revoke the first', async () => {
    await openSetup();
    await registry().invoke(admin, 'invite_client_owner', { clientId: IDS.clientA1, name: 'Pat', email: 'pat@acme.com' });
    await registry().invoke(admin, 'invite_member', { email: 'sam@acme.com', role: 'client_owner', clientId: IDS.clientA1 });
    const pending = (await dbs.service.select().from(invitation).where(isNull(invitation.revokedAt))).map((i) => i.email).sort();
    expect(pending).toEqual(['pat@acme.com', 'sam@acme.com']);
    expect(await clientOwnerEmails(dbs.service, IDS.clientA1, new Date())).toEqual(['pat@acme.com', 'sam@acme.com']);
  });

  it('team invite for client_viewer also queues client_invite', async () => {
    await openSetup(IDS.clientA2);
    const out = (await registry().invoke(am, 'invite_member', { email: 'v@x.co', role: 'client_viewer', clientId: IDS.clientA2 })) as { invitationId: string; expiresAt: string };
    expect(out.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const [c] = await contacts();
    expect(c).toMatchObject({ role: 'client_viewer', active: false, clientId: IDS.clientA2, name: null });
    const [n] = await rows();
    expect(n).toMatchObject({ contactId: c!.id, dedupeKey: `client-invite:${out.invitationId}:${c!.id}:email` });
    expect(payloadOf(n!).cc).toEqual(['am@e.co']);
    expect(startUrl(n!)).toBe(`https://app.test/sign-in?email=v%40x.co&next=${encodeURIComponent(`/c/${IDS.clientA2}`)}`);
    // A viewer is never the setup's invited owner.
    const [setup] = await dbs.service.select().from(clientSetup).where(eq(clientSetup.clientId, IDS.clientA2));
    expect(setup!.invitedContactId).toBeNull();
  });

  it('a client_viewer link points at /c/<id> even while the setup is open', async () => {
    await openSetup();
    await registry().invoke(admin, 'invite_member', { email: 'v@x.co', role: 'client_viewer', clientId: IDS.clientA1 });
    const [n] = await rows();
    expect(startUrl(n!)).toBe(`https://app.test/sign-in?email=v%40x.co&next=${encodeURIComponent(`/c/${IDS.clientA1}`)}`);
  });

  it('agency-role invite_member unchanged', async () => {
    const out = (await registry().invoke(admin, 'invite_member', { email: 'staff@x.co', role: 'account_manager', clientScope: [IDS.clientA1] })) as { invitationId: string };
    const [inv] = await invites();
    expect(inv).toMatchObject({ id: out.invitationId, role: 'account_manager', clientId: null });
    expect(await contacts()).toHaveLength(0);
    expect(await dbs.service.select().from(notification)).toHaveLength(0);
  });

  it('client role without a client is refused as before', async () => {
    await expect(registry().invoke(admin, 'invite_member', { email: 'v@x.co', role: 'client_viewer' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry().invoke(admin, 'invite_member', { email: 'v@x.co', role: 'client_viewer', clientId: IDS.clientA1, clientScope: [IDS.clientA1] })).rejects.toMatchObject({ code: 'invalid_input' });
    expect(await invites()).toHaveLength(0);
    expect(await dbs.service.select().from(contact).where(and(eq(contact.email, 'v@x.co')))).toHaveLength(0);
  });
});
