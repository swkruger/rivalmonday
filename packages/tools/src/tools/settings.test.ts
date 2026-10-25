import { type AuditEvent, createAccessContext } from '@cs/core';
import { agency, agencyWebhook, auditLog, client, contact, invitation, membership, notification } from '@cs/db';
import { hashInput } from '@cs/core/server';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { and, eq } from 'drizzle-orm';
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

  it('assistantName trimmed, >30 rejected, empty clears', async () => {
    const stored = async () => (await dbs.owner.select().from(agency).where(eq(agency.id, IDS.agencyA)))[0]!.branding;
    await registry.invoke(admin, 'update_agency_branding', { displayName: 'Peak', assistantName: '  Ally  ' });
    expect(await stored()).toMatchObject({ assistantName: 'Ally' });
    await registry.invoke(admin, 'update_agency_branding', { assistantName: 'x'.repeat(30) });
    expect((await stored())!.assistantName).toHaveLength(30);
    await expect(registry.invoke(admin, 'update_agency_branding', { assistantName: 'x'.repeat(31) })).rejects.toMatchObject({ code: 'invalid_input' });
    expect((await stored())!.assistantName).toHaveLength(30);
    await registry.invoke(admin, 'update_agency_branding', { displayName: 'Peak', assistantName: '   ' });
    expect((await stored())!.assistantName).toBeUndefined();
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

  it("refuses another agency's client (7c1 isolation): no recipient, no timezone change", async () => {
    // agency B's admin has clientScope 'all', so the scope check alone let these through (a failed FK insert / a silent no-op)
    const adminB = createAccessContext({ agencyId: IDS.agencyB, userId: 'admin-b', role: 'agency_admin', clientScope: 'all', features: [] });
    await expect(registry.invoke(adminB, 'add_client_recipient', { clientId: IDS.clientA1, email: 'x@b.co', name: null, role: 'client_viewer' })).rejects.toMatchObject({ code: 'not_found' });
    const tzOf = async () => (await dbs.owner.select({ timezone: client.timezone }).from(client).where(eq(client.id, IDS.clientA1)))[0]!.timezone;
    const tzBefore = await tzOf();
    expect(tzBefore).not.toBe('America/Denver');
    await expect(registry.invoke(adminB, 'update_client_delivery', { clientId: IDS.clientA1, timezone: 'America/Denver' })).rejects.toMatchObject({ code: 'not_found' });
    expect(await tzOf()).toBe(tzBefore);
    expect(await dbs.owner.select().from(contact)).toEqual([]);
  });

  it('lets a signed-in user change their own contact, never a guest', async () => {
    const [c] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_viewer', email: 'u1@e.co', userId: 'u1' }).returning();
    await registry.invoke(me, 'update_my_contact', { contactId: c!.id, timezone: 'America/Denver', quietHours: { start: '21:00', end: '07:00' } });
    await registry.invoke(me, 'set_my_notification_pref', { contactId: c!.id, kind: 'brief', channel: 'email', enabled: false });
    await expect(registry.invoke(me, 'update_my_contact', { contactId: c!.id, quietHours: { start: '25:00', end: '07:00' } })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(guest, 'update_my_contact', { contactId: c!.id, timezone: 'UTC' })).rejects.toMatchObject({ code: 'permission_denied' });
  });
});

describe('webhook test and delete (15c-2a T10)', () => {
  const SLACK = 'https://hooks.slack.com/services/T/B/secret';
  const sent: { url: string; body: unknown; redirect?: RequestRedirect }[] = [];
  const webhookFetch = (async (url: string, init: RequestInit) => {
    sent.push({ url, body: JSON.parse(String(init.body)), redirect: init.redirect });
    return new Response('ok', { status: 200 });
  }) as unknown as typeof fetch;
  // The real audit sink: the rate limit counts audit_log rows (B2).
  const real = createToolRegistry({ app: dbs.app, service: dbs.service, webhookFetch });
  const hook = async (agencyId: string = IDS.agencyA, url = SLACK, active = true) =>
    (await dbs.service.insert(agencyWebhook).values({ agencyId, kind: 'slack', url, active, createdBy: 'admin' }).returning({ id: agencyWebhook.id }))[0]!.id;
  const auditRow = (webhookId: string, outcome: string, ageMinutes = 0) => ({
    agencyId: IDS.agencyA, userId: 'admin', role: 'agency_admin', tool: 'test_webhook', inputHash: hashInput({ webhookId }), outcome, rowCount: null, durationMs: 1,
    createdAt: new Date(Date.now() - ageMinutes * 60_000),
  });
  beforeEach(() => { sent.length = 0; });

  it('posts the B9 test message with the agency display name, no link, and returns the receiver status', async () => {
    await dbs.owner.update(agency).set({ branding: { displayName: 'Peak Digital' } }).where(eq(agency.id, IDS.agencyA));
    const webhookId = await hook(IDS.agencyA, SLACK, false); // inactive webhooks can be tested
    expect(await real.invoke(admin, 'test_webhook', { webhookId })).toEqual({ ok: true, status: 200 });
    expect(sent).toEqual([{ url: SLACK, redirect: 'manual', body: { text: '*Test message from Peak Digital*\nBriefs and alerts from Peak Digital will appear in this channel.' } }]);
  });

  it('test_webhook rate-limits the 6th within 10 min', async () => {
    const webhookId = await hook();
    for (let i = 0; i < 5; i++) await real.invoke(admin, 'test_webhook', { webhookId });
    const err = await real.invoke(admin, 'test_webhook', { webhookId }).catch((e) => e);
    expect(err).toMatchObject({ code: 'rate_limited', message: 'You can send another test in a few minutes.', userFacing: true });
    expect(sent).toHaveLength(5);
    // The limit is per webhook: another one still sends.
    expect(await real.invoke(admin, 'test_webhook', { webhookId: await hook(IDS.agencyA, 'https://hooks.slack.com/services/T/B/other') })).toMatchObject({ ok: true });
  });

  it("refused calls don't count (nor rows older than 10 minutes)", async () => {
    const webhookId = await hook();
    await dbs.owner.insert(auditLog).values([
      ...Array.from({ length: 6 }, () => auditRow(webhookId, 'rate_limited')),
      ...Array.from({ length: 6 }, () => auditRow(webhookId, 'permission_denied')),
      ...Array.from({ length: 6 }, () => auditRow(webhookId, 'ok', 11)),
      ...Array.from({ length: 4 }, () => auditRow(webhookId, 'ok', 1)),
    ]);
    expect(await real.invoke(admin, 'test_webhook', { webhookId })).toMatchObject({ ok: true });
    await expect(real.invoke(admin, 'test_webhook', { webhookId })).rejects.toMatchObject({ code: 'rate_limited' });
    const refused = await dbs.owner.select().from(auditLog).where(and(eq(auditLog.tool, 'test_webhook'), eq(auditLog.outcome, 'rate_limited')));
    expect(refused).toHaveLength(7);
  });

  it("test of another agency's webhook is not_found", async () => {
    const other = await hook(IDS.agencyB);
    await expect(real.invoke(admin, 'test_webhook', { webhookId: other })).rejects.toMatchObject({ code: 'not_found' });
    await expect(real.invoke(admin, 'delete_webhook', { webhookId: other })).rejects.toMatchObject({ code: 'not_found' });
    expect(sent).toHaveLength(0);
    expect(await dbs.owner.select().from(agencyWebhook).where(eq(agencyWebhook.id, other))).toHaveLength(1);
  });

  it('writes no notification row', async () => {
    const webhookId = await hook();
    await real.invoke(admin, 'test_webhook', { webhookId });
    expect(await dbs.owner.select().from(notification)).toHaveLength(0);
  });

  it('delete_webhook cascades notifications and refuses account managers', async () => {
    const webhookId = await hook();
    await dbs.service.insert(notification).values({
      agencyId: IDS.agencyA, clientId: IDS.clientA1, webhookId, channel: 'slack', kind: 'brief_ready', subjectType: 'brief', subjectId: IDS.clientA1,
      dedupeKey: 'wh-1', title: 'T', body: 'B', status: 'pending',
    });
    await expect(real.invoke(am, 'delete_webhook', { webhookId })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(real.invoke(am, 'test_webhook', { webhookId })).rejects.toMatchObject({ code: 'permission_denied' });
    expect(await dbs.owner.select().from(agencyWebhook).where(eq(agencyWebhook.id, webhookId))).toHaveLength(1);
    expect(await real.invoke(admin, 'delete_webhook', { webhookId })).toEqual({ deleted: true });
    expect(await dbs.owner.select().from(agencyWebhook).where(eq(agencyWebhook.id, webhookId))).toHaveLength(0);
    expect(await dbs.owner.select().from(notification)).toHaveLength(0);
    await expect(real.invoke(admin, 'delete_webhook', { webhookId })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('a URL changed in the DB to a non-webhook host is blocked without fetching', async () => {
    const webhookId = await hook();
    await dbs.owner.update(agencyWebhook).set({ url: 'http://169.254.169.254/latest' }).where(eq(agencyWebhook.id, webhookId));
    expect(await real.invoke(admin, 'test_webhook', { webhookId })).toEqual({ ok: false, error: 'blocked' });
    expect(sent).toHaveLength(0);
  });
});
