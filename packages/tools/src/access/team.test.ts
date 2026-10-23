import { createAccessContext } from '@cs/core';
import { hashInput } from '@cs/core/server';
import { agency, auditLog, contact, invitation, membership, notification } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import type { DeliveryConfig } from '@cs/engine';
import { createMemoryTransport, type EmailTransport } from '@cs/email';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import type { ToolDeps } from '../deps';
import { createToolRegistry } from '../registry';
import { inviteClientUser, sendClientInvite } from './client-invite';
import { inviteMember, listTeam, RESEND_LIMIT, resendInvitation, revokeInvitation, revokeMembership, TEAM_INVITE_LIMIT } from './team';

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

describe('resend + team_invite (15c-2a T11)', () => {
  const DAY = 86_400_000;
  const delivery: DeliveryConfig = { appUrl: 'https://app.test', linkSecrets: ['s'.repeat(40)], fromAddress: 'briefs@app.test' };
  let transport: ReturnType<typeof createMemoryTransport>;
  const deps = (t: EmailTransport = transport, over: Partial<ToolDeps> = {}): ToolDeps => ({
    app: dbs.app, service: dbs.service, delivery,
    leadEmail: { transport: t, appUrl: 'https://app.test/', fromAddress: 'team@app.test', platformAdmins: [] }, ...over,
  });
  // The real audit sink: the resend limit counts audit_log rows (B2).
  const registry = (d: ToolDeps = deps()) => createToolRegistry(d);
  const auditRow = (invitationId: string, outcome: string, ageHours = 0) => ({
    agencyId: IDS.agencyA, userId: 'admin', role: 'agency_admin', tool: 'resend_invitation', inputHash: hashInput({ invitationId }), outcome, rowCount: null, durationMs: 1,
    createdAt: new Date(Date.now() - ageHours * 3_600_000),
  });
  const failing: EmailTransport = { kind: 'memory', send: async () => { throw new Error('boom'); } };

  beforeEach(async () => {
    transport = createMemoryTransport();
    await dbs.owner.execute(sql`update auth."user" set name = 'Pat Lee' where id = 'admin'`);
    await dbs.owner.update(agency).set({ branding: { displayName: 'Peak Digital' } }).where(eq(agency.id, IDS.agencyA));
  });

  it('resend resets expires_at to now + 14 days', async () => {
    const { id } = await inviteMember(dbs.service, admin, { email: 'x@e.co', role: 'account_manager' }, NOW);
    const later = new Date(NOW.getTime() + 5 * DAY);
    const r = await resendInvitation(admin, deps(), id, later);
    expect(r).toEqual({ sentAt: later, expiresAt: new Date(later.getTime() + 14 * DAY), emailSent: true });
    const [row] = await dbs.service.select().from(invitation).where(eq(invitation.id, id));
    expect(row!.expiresAt.toISOString()).toBe(new Date(later.getTime() + 14 * DAY).toISOString());
    expect(RESEND_LIMIT).toEqual({ max: 3, windowHours: 24 });
  });

  it('resend refuses the 4th within 24h and ignores refused rows', async () => {
    const { id } = await inviteMember(dbs.service, admin, { email: 'x@e.co', role: 'account_manager' });
    await dbs.owner.insert(auditLog).values([
      ...Array.from({ length: 4 }, () => auditRow(id, 'rate_limited')),
      ...Array.from({ length: 4 }, () => auditRow(id, 'not_found')),
      ...Array.from({ length: 4 }, () => auditRow(id, 'ok', 25)),
    ]);
    const reg = registry();
    for (let i = 0; i < 3; i++) expect(await reg.invoke(admin, 'resend_invitation', { invitationId: id })).toMatchObject({ emailSent: true });
    const err = await reg.invoke(admin, 'resend_invitation', { invitationId: id }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'rate_limited', message: 'You can resend this invite again tomorrow.', userFacing: true });
    expect(transport.sent).toHaveLength(3);
    // The limit is per invitation: another invite still resends.
    const other = await inviteMember(dbs.service, admin, { email: 'y@e.co', role: 'account_manager' });
    expect(await reg.invoke(admin, 'resend_invitation', { invitationId: other.id })).toMatchObject({ emailSent: true });
  });

  it('client role resend writes a new outbox row each time (dedupe differs)', async () => {
    const { invitationId, contactId } = await inviteClientUser(admin, deps(), { clientId: IDS.clientA1, email: 'o@x.co', name: null, role: 'client_viewer' }, new Date());
    const reg = registry();
    expect(await reg.invoke(admin, 'resend_invitation', { invitationId })).toMatchObject({ emailSent: true });
    expect(await reg.invoke(admin, 'resend_invitation', { invitationId })).toMatchObject({ emailSent: true });
    const rows = await dbs.service.select().from(notification).where(eq(notification.kind, 'client_invite'));
    const keys = rows.map((n) => n.dedupeKey);
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(3);
    expect(keys).toContain(`client-invite:${invitationId}:${contactId}:email`);
    const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
    expect(keys.filter((k) => new RegExp(`^client-invite:${invitationId}:resend:${UUID}:${contactId}:email$`).test(k))).toHaveLength(2);
    expect(rows.every((n) => n.address === 'o@x.co' && n.contactId === contactId)).toBe(true);
    expect(transport.sent).toHaveLength(0); // client roles go through the outbox, never the direct send
  });

  it('client role resend after the 24h window still writes a new outbox row', async () => {
    const { invitationId, contactId } = await inviteClientUser(admin, deps(), { clientId: IDS.clientA1, email: 'o@x.co', name: null, role: 'client_viewer' }, new Date());
    // Yesterday's three resends: their audit rows (outside the window) and their outbox rows under count-style keys.
    await dbs.owner.insert(auditLog).values(Array.from({ length: 3 }, () => auditRow(invitationId, 'ok', 25)));
    await dbs.service.transaction(async (tx) => {
      for (const n of [1, 2, 3]) {
        await sendClientInvite(tx, deps(), { ctx: admin, clientId: IDS.clientA1, clientName: 'A1 HVAC', contactId, email: 'o@x.co', role: 'client_viewer', dedupe: `client-invite:${invitationId}:resend:${n}`, now: new Date() });
      }
    });
    expect(await registry().invoke(admin, 'resend_invitation', { invitationId })).toMatchObject({ emailSent: true });
    expect(await dbs.service.select().from(notification).where(eq(notification.kind, 'client_invite'))).toHaveLength(5);
  });

  it('swallowed outbox insert reports emailSent false', async () => {
    const { invitationId, contactId } = await inviteClientUser(admin, deps(), { clientId: IDS.clientA1, email: 'o@x.co', name: null, role: 'client_viewer' }, new Date());
    // The same dedupe key as the original invite: the outbox's unique key drops the row.
    const sent = await dbs.service.transaction((tx) =>
      sendClientInvite(tx, deps(), { ctx: admin, clientId: IDS.clientA1, clientName: 'A1 HVAC', contactId, email: 'o@x.co', role: 'client_viewer', dedupe: `client-invite:${invitationId}`, now: new Date() }));
    expect(sent).toBe(false);
    expect(await dbs.service.select().from(notification).where(eq(notification.kind, 'client_invite'))).toHaveLength(1);
  });

  it('agency role resend sends team_invite', async () => {
    const { id } = await inviteMember(dbs.service, admin, { email: 'New@E.co', role: 'agency_admin' });
    const r = (await registry().invoke(admin, 'resend_invitation', { invitationId: id })) as { sentAt: string; expiresAt: string; emailSent: boolean };
    expect(new Date(r.expiresAt).getTime() - new Date(r.sentAt).getTime()).toBe(14 * DAY);
    expect(transport.sent).toHaveLength(1);
    const m = transport.sent[0]!;
    expect(m).toMatchObject({ to: 'new@e.co', from: '"Peak Digital" <team@app.test>', subject: 'Pat Lee invited you to Peak Digital', tag: 'team_invite' });
    expect(m.text).toContain('Pat Lee has invited you to join Peak Digital as Agency admin. Sign in with this email address to accept.');
    expect(m.html).toContain('href="https://app.test/sign-in?email=new%40e.co&amp;next=%2Fagency"');
    expect(await dbs.service.select().from(notification)).toHaveLength(0);
  });

  it('account manager cannot resend an agency invite (not_found)', async () => {
    const { id } = await inviteMember(dbs.service, admin, { email: 'x@e.co', role: 'account_manager' }, NOW);
    await expect(resendInvitation(am, deps(), id, NOW)).rejects.toMatchObject({ code: 'not_found' });
    // Revoked, expired and other-agency invitations are not_found too.
    await revokeInvitation(dbs.service, admin, id, NOW);
    await expect(resendInvitation(admin, deps(), id, NOW)).rejects.toMatchObject({ code: 'not_found' });
    const fresh = await inviteMember(dbs.service, admin, { email: 'z@e.co', role: 'account_manager' }, NOW);
    await expect(resendInvitation(admin, deps(), fresh.id, new Date(NOW.getTime() + 15 * DAY))).rejects.toMatchObject({ code: 'not_found' });
    const adminB = createAccessContext({ agencyId: IDS.agencyB, userId: 'admin', role: 'agency_admin', clientScope: 'all', features: [] });
    await expect(resendInvitation(adminB, deps(), fresh.id, NOW)).rejects.toMatchObject({ code: 'not_found' });
    expect(transport.sent).toHaveLength(0);
  });

  it('inviteMember for agency_admin sends team_invite', async () => {
    const r = (await registry().invoke(admin, 'invite_member', { email: 'boss@e.co', role: 'agency_admin' })) as { invitationId: string; expiresAt: string; emailSent: boolean };
    expect(r.emailSent).toBe(true);
    expect(transport.sent).toHaveLength(1);
    const expiry = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(r.expiresAt));
    expect(transport.sent[0]).toMatchObject({ to: 'boss@e.co', subject: 'Pat Lee invited you to Peak Digital' });
    expect(transport.sent[0]!.text).toContain(`This invite expires on ${expiry}.`);
  });

  it('agency-role invites cap at 20 per agency per 24h (new + resent); the 21st is refused and creates nothing; client roles are unaffected', async () => {
    expect(TEAM_INVITE_LIMIT).toEqual({ max: 20, windowHours: 24 });
    const reg = registry();
    const refusal = { code: 'rate_limited', message: "You've sent a lot of invites today. Try again tomorrow.", userFacing: true };
    // An invite older than the window does not count.
    await dbs.service.insert(invitation).values({ agencyId: IDS.agencyA, email: 'old@e.co', role: 'account_manager', invitedBy: 'admin', createdAt: new Date(Date.now() - 25 * 3_600_000), expiresAt: new Date(Date.now() + 13 * DAY) });
    const first = (await reg.invoke(admin, 'invite_member', { email: 'm0@e.co', role: 'account_manager' })) as { invitationId: string };
    for (let i = 1; i < 18; i++) await reg.invoke(admin, 'invite_member', { email: `m${i}@e.co`, role: i % 2 ? 'agency_admin' : 'account_manager' });
    // Two resends of an agency invite count too (18 + 2 = 20).
    for (let i = 0; i < 2; i++) await reg.invoke(admin, 'resend_invitation', { invitationId: first.invitationId });
    expect(transport.sent).toHaveLength(20);
    await expect(reg.invoke(admin, 'invite_member', { email: 'm20@e.co', role: 'account_manager' })).rejects.toMatchObject(refusal);
    expect(await dbs.service.select().from(invitation).where(eq(invitation.email, 'm20@e.co'))).toHaveLength(0);
    // An agency resend is refused too, and leaves the invitation's expiry as it was.
    const [before] = await dbs.service.select().from(invitation).where(eq(invitation.id, first.invitationId));
    await expect(reg.invoke(admin, 'resend_invitation', { invitationId: first.invitationId })).rejects.toMatchObject(refusal);
    const [after] = await dbs.service.select().from(invitation).where(eq(invitation.id, first.invitationId));
    expect(after!.expiresAt.toISOString()).toBe(before!.expiresAt.toISOString());
    expect(transport.sent).toHaveLength(20);
    // Client-role invites and resends are not part of the cap.
    const c = (await reg.invoke(admin, 'invite_member', { email: 'own@x.co', role: 'client_owner', clientId: IDS.clientA1 })) as { invitationId: string; emailSent: boolean };
    expect(c.emailSent).toBe(true);
    expect(await reg.invoke(admin, 'resend_invitation', { invitationId: c.invitationId })).toMatchObject({ emailSent: true });
    // Another agency has its own budget.
    const adminB = createAccessContext({ agencyId: IDS.agencyB, userId: 'admin', role: 'agency_admin', clientScope: 'all', features: [] });
    await expect(reg.invoke(adminB, 'invite_member', { email: 'b@e.co', role: 'account_manager' })).resolves.toMatchObject({ emailSent: expect.any(Boolean) });
  });

  it('send failure still creates the invitation and returns emailSent false', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const r = (await registry(deps(failing)).invoke(admin, 'invite_member', { email: 'boss@e.co', role: 'account_manager' })) as { invitationId: string; emailSent: boolean };
      expect(r.emailSent).toBe(false);
      expect(await dbs.service.select().from(invitation).where(and(eq(invitation.id, r.invitationId), eq(invitation.email, 'boss@e.co')))).toHaveLength(1);
      // Not configured: same outcome, nothing sent.
      const n = (await registry(deps(transport, { leadEmail: null })).invoke(admin, 'resend_invitation', { invitationId: r.invitationId })) as { emailSent: boolean };
      expect(n.emailSent).toBe(false);
      expect(transport.sent).toHaveLength(0);
      // Never logs the address or the URL.
      expect(JSON.stringify([...err.mock.calls, ...warn.mock.calls])).not.toMatch(/boss|sign-in/);
    } finally {
      err.mockRestore();
      warn.mockRestore();
    }
  });
});
