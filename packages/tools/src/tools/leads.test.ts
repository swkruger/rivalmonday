import { type AccessContext, createAccessContext } from '@cs/core';
import { client, clientSetup, contact, intakeLink, invitation, lead, membership, notification, platformAdmin, type SetupLookup } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import type { DeliveryConfig } from '@cs/engine';
import { createMemoryTransport } from '@cs/email';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import type { EnqueueJob, ToolDeps } from '../deps';
import { sendLeadEmail } from '../intake/emails';
import { createToolRegistry } from '../registry';
import { slugBase, slugCandidate } from './leads';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const delivery: DeliveryConfig = { appUrl: 'https://app.test', linkSecrets: ['s'.repeat(40)], fromAddress: 'briefs@app.test' };
const lookup: SetupLookup = { placeId: 'pl-smith-1', cid: null, title: 'Smith Dental', address: '1 Main St', city: 'Austin', category: 'Dentist', phone: null, domain: null, rating: 4.5, votes: 10, lat: 30.2, lng: -97.7 };
const ready = { status: 'ready' as const, self: { name: 'Smith Dental', rating: 4.5, votes: 10 }, nearby: [], facts: ['3 of 5 nearby dentists have more reviews than you.'], summary: 'You trail on volume.', category: 'Dentist', generatedAt: '2026-10-17T00:00:00Z' };

const mk = (userId: string, role: AccessContext['role'], scope: AccessContext['clientScope'] = 'all', agencyId: string = IDS.agencyA) =>
  createAccessContext({ agencyId, userId, role, clientScope: scope, features: [] });
const admin = mk('admin', 'agency_admin');
const amAll = mk('amall', 'account_manager');
const amScoped = mk('amscoped', 'account_manager', [IDS.clientA1]);
const ownerA1 = mk('owner', 'client_owner', [IDS.clientA1]);
const viewerA1 = mk('viewer', 'client_viewer', [IDS.clientA1]);
const adminB = mk('adminb', 'agency_admin', 'all', IDS.agencyB);

let transport: ReturnType<typeof createMemoryTransport>;
const enqueue = vi.fn<EnqueueJob>(async () => {});
const deps = (over: Partial<ToolDeps> = {}): ToolDeps => ({
  app: dbs.app, service: dbs.service, enqueue, delivery, appUrl: 'https://app.test',
  leadEmail: { transport, appUrl: 'https://app.test', fromAddress: 'briefs@app.test', platformAdmins: ['Owner@Env.co'] },
  ...over,
});
const registry = (over: Partial<ToolDeps> = {}) => createToolRegistry(deps(over), { audit: { record: async () => {} } });
const call = <T = unknown>(ctx: AccessContext, tool: string, input: Record<string, unknown>) => registry().invoke(ctx, tool, input) as Promise<T>;
const fails = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e as { code?: string; message: string; userFacing?: boolean }; }
  throw new Error('expected a failure');
};

async function mkLead(over: Partial<typeof lead.$inferInsert> = {}): Promise<string> {
  const [l] = await dbs.service.insert(lead).values({ agencyId: IDS.agencyA, source: 'agency_link', status: 'verified', contactName: 'Sam Smith', email: 'Sam@Smith.co', phone: '512-555-0100', ref: 'flyer', message: 'Help with reviews', lookup, preview: ready, verifiedAt: new Date(), ...over }).returning();
  return l!.id;
}
const leadRow = async (id: string) => (await dbs.service.select().from(lead).where(eq(lead.id, id)))[0]!;

beforeEach(async () => {
  enqueue.mockClear();
  transport = createMemoryTransport();
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedUser(dbs.owner, 'admin', 'Admin@A.co');
  await dbs.service.insert(membership).values([{ userId: 'admin', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 'seed' }]);
  await dbs.service.insert(contact).values([{ agencyId: IDS.agencyA, role: 'agency_admin', email: 'admin@a.co', name: 'Ada' }]);
});

describe('accept_lead', () => {
  it('accept creates prospect + setup(source) + inactive owner contact + client_invite row', async () => {
    const id = await mkLead();
    const { clientId } = await call<{ clientId: string }>(admin, 'accept_lead', { leadId: id, verticalId: 'dental' });
    const [c] = await dbs.owner.select().from(client).where(eq(client.id, clientId));
    expect(c).toMatchObject({ agencyId: IDS.agencyA, status: 'prospect', name: 'Smith Dental', verticalId: 'dental', placeId: 'pl-smith-1', keywords: [], activatedAt: null });
    const [s] = await dbs.owner.select().from(clientSetup).where(eq(clientSetup.clientId, clientId));
    expect(s).toMatchObject({ source: 'agency_link', lookup, suggestions: { status: 'pending' } });
    const [ct] = await dbs.owner.select().from(contact).where(eq(contact.clientId, clientId));
    expect(ct).toMatchObject({ role: 'client_owner', email: 'sam@smith.co', name: 'Sam Smith', active: false });
    expect(s!.invitedContactId).toBe(ct!.id);
    const [inv] = await dbs.owner.select().from(invitation).where(eq(invitation.clientId, clientId));
    expect(inv).toMatchObject({ role: 'client_owner', email: 'sam@smith.co', invitedBy: 'admin' });
    const notes = await dbs.owner.select().from(notification).where(eq(notification.clientId, clientId));
    expect(notes.map((n) => n.kind)).toEqual(['client_invite']);
    expect(await leadRow(id)).toMatchObject({ status: 'accepted', clientId, decidedBy: 'admin' });
    expect((await leadRow(id)).decidedAt).toBeInstanceOf(Date);
    expect(enqueue).toHaveBeenCalledWith('setup-suggestions', { clientId }, `setup-suggestions:${clientId}`);
  });

  it('a platform lead becomes a platform_lead setup', async () => {
    const id = await mkLead({ source: 'platform', assignedBy: 'op', assignedAt: new Date() });
    const { clientId } = await call<{ clientId: string }>(amAll, 'accept_lead', { leadId: id, verticalId: 'dental' });
    const [s] = await dbs.owner.select().from(clientSetup).where(eq(clientSetup.clientId, clientId));
    expect(s!.source).toBe('platform_lead');
  });

  it('accept twice → second not_found', async () => {
    const id = await mkLead();
    await call(admin, 'accept_lead', { leadId: id, verticalId: 'dental' });
    expect((await fails(call(admin, 'accept_lead', { leadId: id, verticalId: 'dental' }))).code).toBe('not_found');
    expect(await dbs.owner.select().from(client).where(eq(client.status, 'prospect'))).toHaveLength(1);
  });

  it('other agency lead → not_found', async () => {
    const id = await mkLead({ agencyId: IDS.agencyB });
    expect((await fails(call(admin, 'accept_lead', { leadId: id, verticalId: 'dental' }))).code).toBe('not_found');
    const pool = await mkLead({ agencyId: null, source: 'platform', email: 'pool@x.co' });
    expect((await fails(call(admin, 'accept_lead', { leadId: pool, verticalId: 'dental' }))).code).toBe('not_found');
    expect((await leadRow(id)).status).toBe('verified');
  });

  it('unverified lead → not_found', async () => {
    const id = await mkLead({ status: 'unverified', verifiedAt: null });
    expect((await fails(call(admin, 'accept_lead', { leadId: id, verticalId: 'dental' }))).code).toBe('not_found');
    const declined = await mkLead({ status: 'declined', email: 'd@x.co' });
    expect((await fails(call(admin, 'accept_lead', { leadId: declined, verticalId: 'dental' }))).code).toBe('not_found');
  });

  it('an unknown vertical rolls everything back', async () => {
    const id = await mkLead();
    expect((await fails(call(admin, 'accept_lead', { leadId: id, verticalId: 'bakery' }))).code).toBe('invalid_input');
    expect((await leadRow(id)).status).toBe('verified');
    expect(await dbs.owner.select().from(invitation)).toHaveLength(0);
    expect(await dbs.owner.select().from(client).where(eq(client.status, 'prospect'))).toHaveLength(0);
  });

  it('a failing invite rolls back the client and the lead', async () => {
    const id = await mkLead();
    const before = (await dbs.owner.select().from(client)).length;
    // A guest (link-session) admin passes the tool checks but inviteClientUser refuses it — after the client insert ran.
    const guest = mk('contact:abc', 'agency_admin');
    expect((await fails(call(guest, 'accept_lead', { leadId: id, verticalId: 'dental' }))).code).toBe('permission_denied');
    expect(await leadRow(id)).toMatchObject({ status: 'verified', clientId: null });
    expect((await dbs.owner.select().from(client)).length).toBe(before);
    expect(await dbs.owner.select().from(clientSetup)).toHaveLength(0);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('the invited client_owner of an accepted (prospect) lead can read get_client_setup while clientOpen', async () => {
    const id = await mkLead();
    const { clientId } = await call<{ clientId: string }>(admin, 'accept_lead', { leadId: id, verticalId: 'dental' });
    const owner = mk('sam-user', 'client_owner', [clientId]);
    const out = await call<{ state: { clientOpen: boolean; totalSteps: number } }>(owner, 'get_client_setup', { clientId });
    expect(out.state).toMatchObject({ clientOpen: true, totalSteps: 4 });
  });
});

describe('decline_lead', () => {
  it('decline platform lead returns it to the pool and agency can no longer read it', async () => {
    const id = await mkLead({ source: 'platform', assignedBy: 'op', assignedAt: new Date(), agencyNotifiedAt: new Date() });
    await expect(call(admin, 'decline_lead', { leadId: id, notify: true })).resolves.toEqual({ ok: true });
    expect(await leadRow(id)).toMatchObject({ agencyId: null, status: 'verified', assignedBy: null, assignedAt: null, agencyNotifiedAt: null });
    expect((await fails(call(admin, 'get_lead', { leadId: id }))).code).toBe('not_found');
    expect((await call<{ leads: unknown[] }>(admin, 'list_leads', {})).leads).toHaveLength(0);
    // Never the agency-branded "declined" mail to a lead that goes back to the pool.
    expect(transport.sent.filter((m) => m.to.toLowerCase() === 'sam@smith.co')).toHaveLength(0);
  });

  it('declined-back pool lead clears pool_notified_at and notifies platform admins once', async () => {
    await seedUser(dbs.owner, 'staff1', 'Staff@P.co');
    await dbs.owner.insert(platformAdmin).values({ userId: 'staff1', role: 'staff' });
    const id = await mkLead({ source: 'platform', assignedBy: 'op', assignedAt: new Date(), poolNotifiedAt: new Date('2026-10-01T00:00:00Z') });
    await call(admin, 'decline_lead', { leadId: id, notify: false });
    expect(transport.sent.map((m) => m.to).sort()).toEqual(['owner@env.co', 'staff@p.co']);
    expect(transport.sent[0]!.html).toContain('https://app.test/platform/leads');
    const after = await leadRow(id);
    expect(after.poolNotifiedAt).not.toBeNull();
    expect(after.poolNotifiedAt!.getTime()).toBeGreaterThan(new Date('2026-10-02T00:00:00Z').getTime());
    // A cleanup retry (guarded) does not send again.
    await sendLeadEmail({ service: dbs.service, transport, appUrl: 'https://app.test', fromAddress: 'briefs@app.test', platformAdmins: ['Owner@Env.co'] }, id, 'pool_new');
    expect(transport.sent).toHaveLength(2);
  });

  it('decline platform lead whose visitor re-submitted to the pool → ok, one open pool row', async () => {
    const id = await mkLead({ source: 'platform', assignedBy: 'op', assignedAt: new Date() });
    const twin = await mkLead({ agencyId: null, source: 'platform', status: 'unverified', email: 'sam@smith.co', verifiedAt: null });
    await expect(call(admin, 'decline_lead', { leadId: id, notify: true })).resolves.toEqual({ ok: true });
    expect(await leadRow(id)).toMatchObject({ status: 'declined', agencyId: IDS.agencyA, decidedBy: 'admin' });
    const open = await dbs.service.select({ id: lead.id }).from(lead).where(and(isNull(lead.agencyId), inArray(lead.status, ['unverified', 'verified'])));
    expect(open.map((r) => r.id)).toEqual([twin]);
    expect(transport.sent).toHaveLength(0); // no pool notice, no agency-branded declined mail
  });

  it('decline agency lead with notify sends once', async () => {
    const id = await mkLead();
    await call(admin, 'decline_lead', { leadId: id, notify: true });
    expect(await leadRow(id)).toMatchObject({ status: 'declined', agencyId: IDS.agencyA, decidedBy: 'admin' });
    expect(transport.sent.map((m) => m.to.toLowerCase())).toEqual(['sam@smith.co']);
    expect(transport.sent[0]!.text).toMatch(/isn't able to take on new clients in your area right now\./);
    expect((await fails(call(admin, 'decline_lead', { leadId: id, notify: true }))).code).toBe('not_found');
    expect(transport.sent).toHaveLength(1);
  });

  it('decline agency lead without notify sends nothing', async () => {
    const id = await mkLead();
    await call(admin, 'decline_lead', { leadId: id, notify: false });
    expect((await leadRow(id)).status).toBe('declined');
    expect(transport.sent).toHaveLength(0);
  });

  it('decline without lead email configured still commits', async () => {
    const id = await mkLead();
    await registry({ leadEmail: null }).invoke(admin, 'decline_lead', { leadId: id, notify: true });
    expect((await leadRow(id)).status).toBe('declined');
  });

  it('other agency / pool / accepted leads → not_found', async () => {
    const b = await mkLead({ agencyId: IDS.agencyB });
    expect((await fails(call(admin, 'decline_lead', { leadId: b, notify: false }))).code).toBe('not_found');
    const accepted = await mkLead({ status: 'accepted', email: 'acc@x.co' });
    expect((await fails(call(admin, 'decline_lead', { leadId: accepted, notify: false }))).code).toBe('not_found');
  });
});

describe('list_leads / get_lead', () => {
  it('lists the agency leads by status, newest first, never unverified or other agencies', async () => {
    const a = await mkLead({ createdAt: new Date('2026-10-10T00:00:00Z') });
    const b = await mkLead({ email: 'b@x.co', createdAt: new Date('2026-10-12T00:00:00Z') });
    await mkLead({ email: 'c@x.co', status: 'unverified', verifiedAt: null });
    const d = await mkLead({ email: 'd@x.co', status: 'declined' });
    await mkLead({ email: 'e@x.co', agencyId: IDS.agencyB });
    const all = await call<{ leads: { id: string }[] }>(admin, 'list_leads', {});
    expect(all.leads.map((l) => l.id).sort()).toEqual([a, b, d].sort());
    const verified = await call<{ leads: { id: string; businessName: string; email: string; contactName: string; preview: { status: string } }[] }>(amAll, 'list_leads', { status: 'verified' });
    expect(verified.leads.map((l) => l.id)).toEqual([b, a]);
    expect(verified.leads[1]).toMatchObject({ businessName: 'Smith Dental', email: 'Sam@Smith.co', contactName: 'Sam Smith', preview: { status: 'ready' } });
  });

  it('get_lead returns the detail with a suggested vertical; unverified and foreign leads are not_found', async () => {
    const a = await mkLead();
    const out = await call<{ id: string; suggestedVerticalId: string | null; lookup: SetupLookup }>(admin, 'get_lead', { leadId: a });
    expect(out).toMatchObject({ id: a, suggestedVerticalId: 'dental', lookup: { placeId: 'pl-smith-1' } });
    const u = await mkLead({ email: 'u@x.co', status: 'unverified', verifiedAt: null });
    expect((await fails(call(admin, 'get_lead', { leadId: u }))).code).toBe('not_found');
    expect((await fails(call(adminB, 'get_lead', { leadId: a }))).code).toBe('not_found');
  });

  it('account_manager with limited scope refused', async () => {
    const id = await mkLead();
    expect((await fails(call(amScoped, 'list_leads', {}))).code).toBe('permission_denied');
    expect((await fails(call(amScoped, 'get_lead', { leadId: id }))).code).toBe('permission_denied');
    expect((await fails(call(amScoped, 'accept_lead', { leadId: id, verticalId: 'dental' }))).code).toBe('permission_denied');
    expect((await fails(call(amScoped, 'decline_lead', { leadId: id, notify: false }))).code).toBe('permission_denied');
    expect((await fails(call(amScoped, 'get_intake_link', {}))).code).toBe('permission_denied');
    expect((await leadRow(id)).status).toBe('verified');
  });

  it('client roles refused', async () => {
    const id = await mkLead();
    for (const ctx of [ownerA1, viewerA1]) {
      for (const [tool, input] of [['list_leads', {}], ['get_lead', { leadId: id }], ['accept_lead', { leadId: id, verticalId: 'dental' }], ['decline_lead', { leadId: id, notify: false }], ['get_intake_link', {}], ['update_intake_link', { enabled: false }]] as const) {
        expect((await fails(call(ctx, tool, input))).code, `${ctx.role} ${tool}`).toBe('not_found');
      }
    }
    expect((await leadRow(id)).status).toBe('verified');
  });
});

describe('intake link', () => {
  it('intake link create/update/slug_taken', async () => {
    expect(await call(admin, 'get_intake_link', {})).toEqual({ slug: null, enabled: false, url: null, counts: { newThisMonth: 0, accepted: 0 } });
    // First update creates the row with the slugified agency name.
    expect(await call(admin, 'update_intake_link', {})).toMatchObject({ slug: 'agency-a', enabled: true, url: 'https://app.test/start/agency-a' });
    expect(await call(admin, 'update_intake_link', { enabled: false })).toMatchObject({ slug: 'agency-a', enabled: false });
    expect(await call(admin, 'update_intake_link', { slug: 'smile-team', enabled: true })).toMatchObject({ slug: 'smile-team', enabled: true, url: 'https://app.test/start/smile-team' });
    // Another agency: its default slug collides → suffixed; an explicit taken slug → slug_taken.
    await dbs.owner.update(intakeLink).set({ slug: 'agency-b' }).where(eq(intakeLink.agencyId, IDS.agencyA));
    expect(await call(adminB, 'update_intake_link', {})).toMatchObject({ slug: 'agency-b-2' });
    const e = await fails(call(adminB, 'update_intake_link', { slug: 'agency-b' }));
    expect(e).toMatchObject({ code: 'slug_taken', message: 'That link name is taken. Try another.', userFacing: true });
    expect((await fails(call(admin, 'update_intake_link', { slug: 'verify' }))).code).toBe('slug_taken');
    expect((await fails(call(admin, 'update_intake_link', { slug: 'Bad Slug!' }))).code).toBe('invalid_input');
  });

  it('a first update with a taken slug is slug_taken and creates nothing', async () => {
    await dbs.owner.insert(intakeLink).values({ agencyId: IDS.agencyB, slug: 'taken-one' });
    expect((await fails(call(admin, 'update_intake_link', { slug: 'taken-one' }))).code).toBe('slug_taken');
    expect(await dbs.owner.select().from(intakeLink).where(eq(intakeLink.agencyId, IDS.agencyA))).toHaveLength(0);
  });

  it('counts new agency-link leads this month and accepted ones', async () => {
    await call(admin, 'update_intake_link', { slug: 'agency-a' });
    await mkLead();
    await mkLead({ email: 'b@x.co', status: 'accepted' });
    await mkLead({ email: 'c@x.co', verifiedAt: new Date('2020-01-01T00:00:00Z') });
    await mkLead({ email: 'd@x.co', source: 'platform' });
    await mkLead({ email: 'e@x.co', status: 'unverified', verifiedAt: null });
    expect((await call<{ counts: unknown }>(admin, 'get_intake_link', {})).counts).toEqual({ newThisMonth: 2, accepted: 1 });
  });

  it('only agency admins read or change the intake link', async () => {
    expect((await fails(call(amAll, 'get_intake_link', {}))).code).toBe('permission_denied');
    expect((await fails(call(amAll, 'update_intake_link', { enabled: true }))).code).toBe('permission_denied');
    expect(await dbs.owner.select().from(intakeLink)).toHaveLength(0);
  });
});

describe('slug helpers', () => {
  it('slugBase lower-cases, strips accents and punctuation, pads short names and caps at 40', () => {
    expect(slugBase('Agency A')).toBe('agency-a');
    expect(slugBase('  Café & Co. Marketing!! ')).toBe('cafe-co-marketing');
    expect(slugBase('AB')).toBe('ab-agency');
    expect(slugBase('***')).toBe('agency');
    const long = slugBase('x'.repeat(39) + ' yz');
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long).toMatch(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/);
  });

  it('slugCandidate suffixes and still fits 40 characters', () => {
    expect(slugCandidate('agency-a', 1)).toBe('agency-a');
    expect(slugCandidate('agency-a', 2)).toBe('agency-a-2');
    const c = slugCandidate('a'.repeat(40), 12);
    expect(c).toHaveLength(40);
    expect(c.endsWith('-12')).toBe(true);
  });
});
