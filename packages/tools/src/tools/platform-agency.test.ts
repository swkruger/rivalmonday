import { type AccessContext, createAccessContext } from '@cs/core';
import { agency, auditLog, invitation, membership, platformAdmin } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryTransport } from '@cs/email';
import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { inviteMember, LAST_ADMIN_MESSAGE } from '../access/team';
import type { ToolDeps } from '../deps';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const A = IDS.agencyA;
// Operators sit in agency B (their home agency) and manage agency A.
const opCtx = (userId: string) => createAccessContext({ agencyId: IDS.agencyB, userId, role: 'agency_admin', clientScope: 'all', features: [] });
const owner = opCtx('op'); // env-listed platform owner
const staff = opCtx('staff');
const viewer = opCtx('viewer');
const adminA = createAccessContext({ agencyId: A, userId: 'admin', role: 'agency_admin', clientScope: 'all', features: [] });

let transport: ReturnType<typeof createMemoryTransport>;
let registry: ReturnType<typeof createToolRegistry>;
const deps = (): ToolDeps => ({
  app: dbs.app, service: dbs.service, appUrl: 'https://app.test', platformAdmins: ['op@example.com'],
  leadEmail: { transport, appUrl: 'https://app.test/', fromAddress: 'team@app.test', platformAdmins: [] },
});
const call = (ctx: AccessContext, name: string, input: unknown = {}) => registry.invoke(ctx, name, input);
const fails = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e as { code?: string; message: string; userFacing?: boolean }; }
  throw new Error('expected a failure');
};
const audits = (tool: string) => dbs.owner.select().from(auditLog).where(eq(auditLog.tool, tool));

let ids: { admin: string; am: string; co: string; invite: string };

beforeEach(async () => {
  transport = createMemoryTransport();
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  for (const u of ['op', 'staff', 'viewer', 'admin', 'am', 'co']) await seedUser(dbs.owner, u, `${u}@example.com`);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(agency).set({ branding: { displayName: 'Peak Digital' } }).where(eq(agency.id, A));
  await dbs.owner.insert(platformAdmin).values([
    { userId: 'staff', role: 'staff', createdBy: 'test' },
    { userId: 'viewer', role: 'viewer', createdBy: 'test' },
  ]);
  const ms = await dbs.service.insert(membership).values([
    { userId: 'admin', agencyId: A, role: 'agency_admin', createdBy: 'seed' },
    { userId: 'am', agencyId: A, role: 'account_manager', clientScope: [IDS.clientA1], createdBy: 'seed' },
    { userId: 'co', agencyId: A, role: 'client_owner', clientId: IDS.clientA1, createdBy: 'seed' },
  ]).returning({ id: membership.id });
  const inv = await inviteMember(dbs.service, adminA, { email: 'pending@example.com', role: 'account_manager' });
  ids = { admin: ms[0]!.id, am: ms[1]!.id, co: ms[2]!.id, invite: inv.id };
  registry = createToolRegistry(deps());
});

const WRITES = (): [string, Record<string, unknown>][] => [
  ['platform_rename_agency', { agencyId: A, name: 'Agency A2' }],
  ['platform_change_member_role', { agencyId: A, membershipId: ids.am, role: 'agency_admin' }],
  ['platform_remove_member', { agencyId: A, membershipId: ids.co }],
  ['platform_invite_agency_admin', { agencyId: A, email: 'new@example.com' }],
  ['platform_resend_invitation', { agencyId: A, invitationId: ids.invite }],
  ['platform_revoke_invitation', { agencyId: A, invitationId: ids.invite }],
];

describe('role matrix', () => {
  it('viewer can list, but every write is permission_denied (nothing audited, nothing changed)', async () => {
    await call(viewer, 'list_agency_people', { agencyId: A });
    for (const [name, input] of WRITES()) {
      expect((await fails(call(viewer, name, input))).code, name).toBe('permission_denied');
      expect(await audits(name), name).toEqual([]);
    }
    expect((await dbs.owner.select().from(agency).where(eq(agency.id, A)))[0]!.name).toBe('Agency A');
    expect(transport.sent).toEqual([]);
  });

  it('a non-operator agency admin is refused on all seven', async () => {
    for (const [name, input] of [['list_agency_people', { agencyId: A }] as [string, Record<string, unknown>], ...WRITES()]) {
      expect((await fails(call(adminA, name, input))).code, name).toBe('permission_denied');
    }
  });

  it('staff can run all seven; the owner can too', async () => {
    await call(staff, 'list_agency_people', { agencyId: A });
    for (const [name, input] of WRITES()) await call(staff, name, input);
    await call(owner, 'platform_rename_agency', { agencyId: A, name: 'Owner named' });
  });
});

describe('target agency', () => {
  const UNKNOWN = '00000000-0000-4000-8000-00000000dead';

  it('unknown agency → not_found for all seven', async () => {
    for (const [name, input] of [['list_agency_people', { agencyId: A }] as [string, Record<string, unknown>], ...WRITES()]) {
      expect((await fails(call(staff, name, { ...input, agencyId: UNKNOWN }))).code, name).toBe('not_found');
    }
  });

  it('archived agency → not_found for writes, ok for list_agency_people', async () => {
    await dbs.owner.update(agency).set({ archivedAt: new Date() }).where(eq(agency.id, A));
    for (const [name, input] of WRITES()) expect((await fails(call(staff, name, input))).code, name).toBe('not_found');
    const r = (await call(viewer, 'list_agency_people', { agencyId: A })) as { members: unknown[] };
    expect(r.members).toHaveLength(3);
  });

  it("an object of another agency is not_found (the context is the target agency's)", async () => {
    await seedUser(dbs.owner, 'b', 'b@example.com');
    const [b] = await dbs.service.insert(membership).values({ userId: 'b', agencyId: IDS.agencyB, role: 'account_manager', createdBy: 'x' }).returning();
    expect((await fails(call(staff, 'platform_remove_member', { agencyId: A, membershipId: b!.id }))).code).toBe('not_found');
    expect((await fails(call(staff, 'platform_change_member_role', { agencyId: A, membershipId: b!.id, role: 'agency_admin' }))).code).toBe('not_found');
  });
});

describe('audit', () => {
  it('each write leaves exactly one audit_log row with role platform_staff in the target agency', async () => {
    for (const [name, input] of WRITES()) {
      await call(staff, name, input);
      const rows = await audits(name);
      expect(rows, name).toHaveLength(1);
      expect(rows[0], name).toMatchObject({ agencyId: A, role: 'platform_staff', userId: 'staff', outcome: 'ok' });
    }
  });

  it('a refused body is audited with its code', async () => {
    expect((await fails(call(staff, 'platform_remove_member', { agencyId: A, membershipId: ids.admin }))).message).toBe(LAST_ADMIN_MESSAGE);
    expect(await audits('platform_remove_member')).toMatchObject([{ agencyId: A, outcome: 'invalid_input' }]);
  });
});

describe('list_agency_people', () => {
  it('maps members with their clients and pending invitations', async () => {
    const r = (await call(viewer, 'list_agency_people', { agencyId: A })) as {
      members: { membershipId: string; role: string; email: string; clients: { id: string; name: string }[] }[];
      invitations: { invitationId: string; email: string; role: string; clientId: string | null; clientName: string | null; sentAt: string; expiresAt: string }[];
    };
    const by = Object.fromEntries(r.members.map((m) => [m.membershipId, m]));
    expect(by[ids.admin]).toMatchObject({ role: 'agency_admin', email: 'admin@example.com', clients: [] });
    expect(by[ids.am]).toMatchObject({ role: 'account_manager', clients: [{ id: IDS.clientA1, name: 'A1 HVAC' }] });
    expect(by[ids.co]).toMatchObject({ role: 'client_owner', clients: [{ id: IDS.clientA1, name: 'A1 HVAC' }] });
    expect(r.invitations).toEqual([expect.objectContaining({ invitationId: ids.invite, email: 'pending@example.com', role: 'account_manager', clientId: null, clientName: null })]);
    expect(new Date(r.invitations[0]!.expiresAt).getTime() - new Date(r.invitations[0]!.sentAt).getTime()).toBe(14 * 86_400_000);
  });
});

describe('platform_rename_agency', () => {
  it('trims the name', async () => {
    expect(await call(staff, 'platform_rename_agency', { agencyId: A, name: '  Peak Partners  ' })).toEqual({ name: 'Peak Partners' });
    expect((await dbs.owner.select().from(agency).where(eq(agency.id, A)))[0]!.name).toBe('Peak Partners');
  });

  it('empty or 121 chars → invalid_input', async () => {
    for (const name of ['', '   ', 'x'.repeat(121)]) expect((await fails(call(staff, 'platform_rename_agency', { agencyId: A, name }))).code).toBe('invalid_input');
    expect(await call(staff, 'platform_rename_agency', { agencyId: A, name: 'x'.repeat(120) })).toEqual({ name: 'x'.repeat(120) });
  });
});

describe('platform_change_member_role / platform_remove_member', () => {
  it('promotes and demotes, clearing the scope; last admin refused', async () => {
    expect(await call(staff, 'platform_change_member_role', { agencyId: A, membershipId: ids.am, role: 'agency_admin' })).toEqual({ role: 'agency_admin' });
    expect((await dbs.owner.select().from(membership).where(eq(membership.id, ids.am)))[0]).toMatchObject({ role: 'agency_admin', clientScope: null });
    await call(staff, 'platform_change_member_role', { agencyId: A, membershipId: ids.admin, role: 'account_manager' });
    const err = await fails(call(staff, 'platform_change_member_role', { agencyId: A, membershipId: ids.am, role: 'account_manager' }));
    expect(err).toMatchObject({ code: 'invalid_input', message: LAST_ADMIN_MESSAGE });
  });

  it('a client-role target of change role → not_found; remove takes any membership', async () => {
    expect((await fails(call(staff, 'platform_change_member_role', { agencyId: A, membershipId: ids.co, role: 'agency_admin' }))).code).toBe('not_found');
    expect(await call(staff, 'platform_remove_member', { agencyId: A, membershipId: ids.co })).toEqual({ removed: true });
    expect(await dbs.owner.select().from(membership).where(eq(membership.id, ids.co))).toEqual([]);
  });
});

describe('platform_invite_agency_admin', () => {
  it('creates an agency_admin invitation; the email names the agency and has no replyTo', async () => {
    const r = (await call(staff, 'platform_invite_agency_admin', { agencyId: A, email: ' New@Example.com ' })) as { invitationId: string; emailSent: boolean };
    expect(r.emailSent).toBe(true);
    const [row] = await dbs.owner.select().from(invitation).where(eq(invitation.id, r.invitationId));
    expect(row).toMatchObject({ agencyId: A, email: 'new@example.com', role: 'agency_admin', clientId: null });
    const m = transport.sent[0]!;
    expect(m.subject).toBe('Peak Digital invited you to Peak Digital');
    expect(m.replyTo ?? null).toBeNull();
    expect(m.to).toBe('new@example.com');
    expect(m.text).not.toContain('staff@example.com');
  });

  it('an existing admin at that scope is refused like invite_member', async () => {
    const err = await fails(call(staff, 'platform_invite_agency_admin', { agencyId: A, email: 'admin@example.com' }));
    expect(err.code).toBe('invalid_input');
  });

  it('refuses at the 20-invite budget, creating nothing', async () => {
    for (let n = 1; n < 20; n++) await inviteMember(dbs.service, adminA, { email: `m${n}@example.com`, role: 'account_manager' });
    const before = (await dbs.owner.select().from(invitation).where(and(eq(invitation.agencyId, A), isNull(invitation.clientId)))).length;
    expect(before).toBe(20);
    const err = await fails(call(staff, 'platform_invite_agency_admin', { agencyId: A, email: 'x@example.com' }));
    expect(err).toMatchObject({ code: 'rate_limited', message: "You've sent a lot of invites today. Try again tomorrow." });
    expect((await dbs.owner.select().from(invitation).where(eq(invitation.agencyId, A))).length).toBe(20);
    expect(transport.sent).toEqual([]);
  });
});

describe('platform_resend_invitation', () => {
  it('resends as the agency and returns sentAt / expiresAt / emailSent', async () => {
    const r = (await call(staff, 'platform_resend_invitation', { agencyId: A, invitationId: ids.invite })) as { sentAt: string; expiresAt: string; emailSent: boolean };
    expect(r.emailSent).toBe(true);
    expect(new Date(r.expiresAt).getTime() - new Date(r.sentAt).getTime()).toBe(14 * 86_400_000);
    expect(transport.sent[0]!.replyTo ?? null).toBeNull();
    expect(transport.sent[0]!.subject).toBe('Peak Digital invited you to Peak Digital');
  });

  it('the 4th resend in 24 h across resend_invitation and platform_resend_invitation is refused', async () => {
    await call(adminA, 'resend_invitation', { invitationId: ids.invite });
    await call(staff, 'platform_resend_invitation', { agencyId: A, invitationId: ids.invite });
    await call(adminA, 'resend_invitation', { invitationId: ids.invite });
    const err = await fails(call(staff, 'platform_resend_invitation', { agencyId: A, invitationId: ids.invite }));
    expect(err).toMatchObject({ code: 'rate_limited', message: 'You can resend this invite again tomorrow.', userFacing: true });
    // And the other way round: the agency's own tool counts the platform rows.
    expect((await fails(call(adminA, 'resend_invitation', { invitationId: ids.invite }))).code).toBe('rate_limited');
  });
});

describe('platform_revoke_invitation', () => {
  it('revokes the pending invitation', async () => {
    expect(await call(staff, 'platform_revoke_invitation', { agencyId: A, invitationId: ids.invite })).toEqual({ revoked: true });
    expect((await dbs.owner.select().from(invitation).where(eq(invitation.id, ids.invite)))[0]!.revokedAt).not.toBeNull();
    expect((await fails(call(staff, 'platform_revoke_invitation', { agencyId: A, invitationId: ids.invite }))).code).toBe('not_found');
  });
});
