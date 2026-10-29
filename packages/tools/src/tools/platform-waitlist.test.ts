import { type AccessContext, createAccessContext } from '@cs/core';
import type { MapsPlace } from '@cs/collectors';
import { agencyInviteLink, brief, contact, intakeRate, lead, platformAdmin, platformAuditLog, platformSetting, type SetupLookup, waitlistEntry } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryTransport } from '@cs/email';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { createToolRegistry } from '../registry';
import { allTools } from './all';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const ctxOf = (userId: string, role: AccessContext['role'] = 'agency_admin') => createAccessContext({ agencyId: IDS.agencyA, userId, role, clientScope: 'all', features: [] });
const viewer = ctxOf('viewer');
const agencyAdmin = ctxOf('admin');
const registry = createToolRegistry({ app: dbs.app, service: dbs.service, platformAdmins: ['op@example.com'] }, { audit: { record: async () => {} } });

interface View { id: string; kind: string; status: string; email: string; emailConfirmed: boolean; orgName: string; sample: { businessName: string; status: string; stage: string | null; clientId: string | null; sentAt: string | null } | null }
interface Out { entries: View[]; total: number; nextCursor: string | null; prevCursor: string | null; counts: { agencyNew: number; businessNew: number; sampleRequested: number }; sampleMonth: { used: number; limit: number }; estimate: { discoveryCapUsd: number; startingPointAvgUsd: number | null; basedOn: number } }
const list = (input: Record<string, unknown> = {}, ctx = viewer) => registry.invoke(ctx, 'list_waitlist', input) as Promise<Out>;
const navCount = async () => ((await registry.invoke(ctxOf('op'), 'get_platform_nav_counts', {})) as { waitlist: number }).waitlist;

let n = 0;
async function mk(over: Partial<typeof waitlistEntry.$inferInsert> = {}): Promise<string> {
  n += 1;
  const [r] = await dbs.service.insert(waitlistEntry).values({
    kind: 'agency', contactName: `Contact ${n}`, email: `e${n}@x.co`, orgName: `Org ${n}`, ipHash: 'h', emailConfirmedAt: new Date(),
    createdAt: new Date(Date.UTC(2026, 9, 1) + n * 60_000), ...over,
  }).returning();
  return r!.id;
}
const sample = (status: 'requested' | 'approved' | 'sent' | 'declined' | 'failed', over: Partial<typeof waitlistEntry.$inferInsert> = {}) =>
  mk({ sampleRequested: true, sampleStatus: status, sampleBusinessName: 'Smith Dental', sampleLocation: 'Austin, TX', sampleWebsite: 'smith.co', ...over });
const startingPoint = (clientId: string, status: string) =>
  dbs.owner.insert(brief).values({ agencyId: IDS.agencyA, clientId, kind: 'starting_point', status, deliveryDate: '2026-10-05', periodStart: new Date(), periodEnd: new Date(), summary: 's' });

beforeEach(async () => {
  n = 0;
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  for (const u of ['op', 'viewer', 'admin']) await seedUser(dbs.owner, u, `${u}@example.com`);
  await seedTenancy(dbs.owner);
  await dbs.owner.insert(platformAdmin).values({ userId: 'viewer', role: 'viewer', createdBy: 'test' });
});

describe('list_waitlist', () => {
  it('viewer may list, non-operator → not_found', async () => {
    const id = await mk();
    expect((await list()).entries.map((e) => e.id)).toEqual([id]);
    await expect(list({}, agencyAdmin)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('filters by kind, status, sample and q', async () => {
    const a = await mk({ orgName: 'Cool Air Co' });
    const b = await mk({ kind: 'business', orgName: 'Smith Plumbing', contactName: 'Sam' });
    const c = await mk({ status: 'invited', email: 'invited@x.co' });
    const s = await sample('requested');
    expect((await list({ kind: 'business' })).entries.map((e) => e.id)).toEqual([b]);
    expect((await list({ status: 'invited' })).entries.map((e) => e.id)).toEqual([c]);
    expect((await list({ sample: true })).entries.map((e) => e.id)).toEqual([s]);
    expect((await list({ q: 'cool air' })).entries.map((e) => e.id)).toEqual([a]);
    expect((await list({ q: 'SAM' })).entries.map((e) => e.id)).toEqual([b]);
    expect((await list({ q: 'invited@x' })).entries.map((e) => e.id)).toEqual([c]);
    expect((await list({ q: 'smith dental' })).entries.map((e) => e.id)).toEqual([s]);
    expect((await list({ q: '100%' })).entries).toEqual([]);
    expect((await list()).entries.map((e) => e.id)).toEqual([s, c, b, a]); // newest first
  });

  it('masks email in a support-audited context', () => {
    expect(allTools.find((t) => t.name === 'list_waitlist')?.supportMask).toContain('entries[].email');
  });

  it('stage derived from the starting point', async () => {
    const stageOf = async (id: string) => (await list({ sample: true })).entries.find((e) => e.id === id)!.sample!.stage;
    const noBrief = await sample('approved', { sampleClientId: IDS.clientA1 });
    expect(await stageOf(noBrief)).toBe('setup');
    const withBrief = await sample('approved', { sampleClientId: IDS.clientA2 });
    for (const [status, stage] of [['generating', 'generating'], ['failed', 'generating'], ['ready', 'review'], ['approved', 'ready_to_send'], ['sent', 'sent']] as const) {
      await dbs.owner.delete(brief);
      await startingPoint(IDS.clientA2, status);
      expect(await stageOf(withBrief), status).toBe(stage);
    }
    // a sent entry is 'sent' (its client kept); a requested one has no stage
    const sent = await sample('sent', { sampleClientId: IDS.clientA1, sampleSentAt: new Date('2026-10-20T00:00:00Z') });
    const req = await sample('requested');
    const entries = (await list({ sample: true })).entries;
    expect(entries.find((e) => e.id === sent)!.sample).toMatchObject({ stage: 'sent', clientId: IDS.clientA1, sentAt: '2026-10-20T00:00:00.000Z' });
    expect(entries.find((e) => e.id === req)!.sample).toMatchObject({ stage: null, status: 'requested', businessName: 'Smith Dental' });
  });

  it('counts and badge agree', async () => {
    await mk(); // agency new, confirmed
    await mk({ emailConfirmedAt: null }); // unconfirmed: not counted
    await mk({ status: 'invited' }); // not new
    await mk({ kind: 'business' }); // business new
    await mk({ kind: 'business', emailConfirmedAt: null });
    await sample('requested'); // also a new agency entry => counted in both
    await sample('requested', { emailConfirmedAt: null });
    await sample('approved');
    const out = await list();
    expect(out.counts).toEqual({ agencyNew: 3, businessNew: 1, sampleRequested: 1 });
    expect(await navCount()).toBe(out.counts.agencyNew + out.counts.businessNew + out.counts.sampleRequested);
    expect(await navCount()).toBe(5);
    // the counts are global, not narrowed by the page's filters
    expect((await list({ kind: 'business' })).counts).toEqual(out.counts);
  });

  it('sampleMonth counts this UTC month only', async () => {
    const now = new Date();
    const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 1));
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 1000);
    await sample('approved', { sampleApprovedAt: thisMonth });
    await sample('sent', { sampleApprovedAt: lastMonth });
    await sample('requested');
    expect((await list()).sampleMonth).toEqual({ used: 1, limit: 10 });
    await dbs.service.insert(platformSetting).values({ key: 'sample_brief_monthly_limit', value: { n: 4 }, updatedBy: 't' });
    expect((await list()).sampleMonth).toEqual({ used: 1, limit: 4 });
    expect((await list()).estimate).toEqual({ discoveryCapUsd: 3, startingPointAvgUsd: null, basedOn: 0 });
  });

  it('pages 25 newest first', async () => {
    for (let i = 0; i < 27; i++) await mk();
    const p1 = await list();
    expect(p1.entries).toHaveLength(25);
    expect(p1.total).toBe(27);
    const p2 = await list({ cursor: p1.nextCursor! });
    expect(p2.entries).toHaveLength(2);
    expect(p2.nextCursor).toBeNull();
    expect(p2.prevCursor).not.toBeNull();
  });
});

describe('invite_waitlist_agencies and decline_waitlist_entry', () => {
  const op = ctxOf('op');
  const inviteRegistry = createToolRegistry({ app: dbs.app, service: dbs.service, platformAdmins: ['op@example.com'], appUrl: 'https://app.test' }, { audit: { record: async () => {} } });
  const invite = (ctx: AccessContext, input: Record<string, unknown>) => inviteRegistry.invoke(ctx, 'invite_waitlist_agencies', input) as Promise<{ results: { id: string; outcome: string; reason?: string; email?: string; url?: string; expiresAt?: string }[] }>;
  const decline = (ctx: AccessContext, id: string) => inviteRegistry.invoke(ctx, 'decline_waitlist_entry', { id });
  const fails = async (p: Promise<unknown>) => { try { await p; } catch (e) { return e as { code?: string; message: string }; } throw new Error('expected a failure'); };
  const row = async (id: string) => (await dbs.service.select().from(waitlistEntry).where(eq(waitlistEntry.id, id)))[0]!;
  const pilotEnd = () => new Date(Date.now() + 60 * 86_400_000).toISOString();

  it('skips unconfirmed, non-agency and non-new rows with reasons', async () => {
    const unconfirmed = await mk({ emailConfirmedAt: null });
    const business = await mk({ kind: 'business' });
    const handled = await mk({ status: 'declined' });
    const missing = '99999999-9999-4999-8999-999999999999';
    const r = await invite(op, { ids: [unconfirmed, business, handled, missing], offer: 'trial' });
    expect(r.results.map((x) => [x.id, x.outcome, x.reason])).toEqual([
      [unconfirmed, 'skipped', 'unconfirmed'], [business, 'skipped', 'not_agency'], [handled, 'skipped', 'not_new'], [missing, 'skipped', 'not_found'],
    ]);
    expect(await dbs.service.select().from(agencyInviteLink)).toHaveLength(0);
  });

  it('creates one email-locked single-use link per row and marks invited', async () => {
    const a = await mk({ email: 'a@x.co' });
    const b = await mk({ email: 'b@x.co' });
    const r = await invite(op, { ids: [a, b, a], offer: 'pilot', pilotEndsAt: pilotEnd() });
    expect(r.results).toHaveLength(2);
    expect(r.results.every((x) => x.outcome === 'invited' && x.url?.startsWith('https://app.test/join/') && x.expiresAt)).toBe(true);
    const links = await dbs.service.select().from(agencyInviteLink);
    expect(links.map((l) => [l.emailLock, l.maxUses, l.offer, l.note]).sort()).toEqual([['a@x.co', 1, 'pilot', 'waitlist'], ['b@x.co', 1, 'pilot', 'waitlist']]);
    const ra = await row(a);
    expect(ra.status).toBe('invited');
    expect(ra.inviteLinkId).toBe(links.find((l) => l.emailLock === 'a@x.co')!.id);
    expect(ra.decidedAt).not.toBeNull();
    expect(ra.decidedBy).toBe('op');
    expect((await dbs.service.select().from(platformAuditLog)).filter((x) => x.tool === 'invite_waitlist_agencies')).toHaveLength(1);
    const again = await invite(op, { ids: [a], offer: 'trial' });
    expect(again.results[0]).toMatchObject({ outcome: 'skipped', reason: 'not_new' });
  });

  it('pilot without pilotEndsAt → invalid_input before any row', async () => {
    const a = await mk();
    expect((await fails(invite(op, { ids: [a], offer: 'pilot' }))).code).toBe('invalid_input');
    expect((await row(a)).status).toBe('new');
    expect(await dbs.service.select().from(agencyInviteLink)).toHaveLength(0);
  });

  it('51 ids → invalid_input', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    expect((await fails(invite(op, { ids, offer: 'trial' }))).code).toBe('invalid_input');
  });

  it('staff only (viewer → permission_denied)', async () => {
    const a = await mk();
    expect((await fails(invite(viewer, { ids: [a], offer: 'trial' }))).code).toBe('permission_denied');
    expect((await fails(decline(viewer, a))).code).toBe('permission_denied');
  });

  it('decline twice → conflict; a requested sample is declined with it', async () => {
    const s = await sample('requested');
    await decline(op, s);
    const d = await row(s);
    expect([d.status, d.sampleStatus, d.sampleRequested, d.decidedBy]).toEqual(['declined', 'declined', true, 'op']);
    const e = await fails(decline(op, s));
    expect(e.code).toBe('conflict');
    expect(e.message).toBe('This entry was already handled.');
  });
});

describe('platform_find_business and assign_waitlist_business', () => {
  const op = ctxOf('op');
  const place: SetupLookup = { placeId: 'pl-smith-1', cid: null, title: 'Smith Dental', address: '1 Main St', city: 'Austin', category: 'Dentist', phone: null, domain: null, rating: 4.5, votes: 10, lat: 30.2, lng: -97.7 };
  const maps = (i: number): MapsPlace => ({ placeId: `p${i}`, cid: `c${i}`, title: `Biz ${i}`, domain: null, url: null, rank: i, rating: 4, votes: 5, category: 'Dentist', address: 'x', lat: 1, lng: 2, city: 'Austin', phone: null });
  let transport: ReturnType<typeof createMemoryTransport>;
  let calls: { q: { keyword: string; locationName: string }; scope: unknown }[];
  let reg: ReturnType<typeof createToolRegistry>;
  const fails = async (p: Promise<unknown>) => { try { await p; } catch (e) { return e as { code?: string; message: string; userFacing?: boolean }; } throw new Error('expected a failure'); };
  const assign = (ctx: AccessContext, input: Record<string, unknown>) => reg.invoke(ctx, 'assign_waitlist_business', input) as Promise<{ leadId: string }>;
  const row = async (id: string) => (await dbs.service.select().from(waitlistEntry).where(eq(waitlistEntry.id, id)))[0]!;
  const biz = (over: Partial<typeof waitlistEntry.$inferInsert> = {}) => mk({ kind: 'business', email: 'sam@smith.co', contactName: 'Sam Smith', orgName: 'Smith Dental', location: 'Austin, TX', ...over });
  const pool = () => dbs.service.select().from(lead).where(eq(lead.source, 'platform'));

  beforeEach(async () => {
    transport = createMemoryTransport();
    calls = [];
    reg = createToolRegistry({
      app: dbs.app, service: dbs.service, platformAdmins: ['op@example.com'],
      setupLookup: async (q, scope) => { calls.push({ q, scope }); return [maps(1), maps(2)]; },
      leadEmail: { transport, appUrl: 'https://app.test', fromAddress: 'briefs@app.test', platformAdmins: ['op@example.com'] },
    }, { audit: { record: async () => {} } });
    await dbs.service.insert(contact).values({ agencyId: IDS.agencyB, role: 'agency_admin', email: 'admin@b.co', name: 'Bea' });
  });

  it('refuses unconfirmed, handled and agency entries; viewers are refused', async () => {
    const unconfirmed = await biz({ emailConfirmedAt: null, email: 'u@x.co' });
    const handled = await biz({ status: 'declined', email: 'h@x.co' });
    const agencyRow = await mk();
    for (const id of [unconfirmed, handled]) {
      const e = await fails(assign(op, { id, agencyId: IDS.agencyB, lookup: place }));
      expect([e.code, e.message]).toEqual(['conflict', 'Only confirmed new entries can be assigned.']);
    }
    expect((await fails(assign(op, { id: agencyRow, agencyId: IDS.agencyB, lookup: place }))).code).toBe('not_found');
    expect((await fails(assign(op, { id: '99999999-9999-4999-8999-999999999999', agencyId: IDS.agencyB, lookup: place }))).code).toBe('not_found');
    const ok = await biz({ email: 'ok@x.co' });
    expect((await fails(assign(viewer, { id: ok, agencyId: IDS.agencyB, lookup: place }))).code).toBe('permission_denied');
    expect(await pool()).toHaveLength(0);
  });

  it('creates a verified pool lead and assigns it in one transaction', async () => {
    const confirmed = new Date(Date.UTC(2026, 9, 20));
    const id = await biz({ emailConfirmedAt: confirmed, ipHash: 'iph' });
    const { leadId } = await assign(op, { id, agencyId: IDS.agencyB, lookup: place });
    const rows = await pool();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: leadId, agencyId: IDS.agencyB, source: 'platform', status: 'verified', ref: 'waitlist', contactName: 'Sam Smith', email: 'sam@smith.co', ipHash: 'iph', assignedBy: 'op' });
    expect(rows[0]!.verifiedAt).toEqual(confirmed);
    expect(rows[0]!.lookup.placeId).toBe('pl-smith-1');
    expect(rows.filter((x) => x.agencyId === null)).toHaveLength(0); // never visible in the pool
    const e = await row(id);
    expect([e.status, e.leadId, e.decidedBy]).toEqual(['assigned', leadId, 'op']);
    expect(e.decidedAt).not.toBeNull();
  });

  it('reuses an identical pool lead', async () => {
    const [existing] = await dbs.service.insert(lead).values({ agencyId: null, source: 'platform', status: 'verified', contactName: 'Sam', email: 'SAM@smith.co', lookup: place, verifiedAt: new Date() }).returning();
    const id = await biz();
    const { leadId } = await assign(op, { id, agencyId: IDS.agencyB, lookup: place });
    expect(leadId).toBe(existing!.id);
    const rows = await pool();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.agencyId).toBe(IDS.agencyB);
  });

  it('agency twin → conflict, entry unchanged', async () => {
    await dbs.service.insert(lead).values({ agencyId: IDS.agencyB, source: 'agency_link', status: 'verified', contactName: 'Sam', email: 'sam@smith.co', lookup: place, verifiedAt: new Date() });
    const id = await biz();
    const e = await fails(assign(op, { id, agencyId: IDS.agencyB, lookup: place }));
    expect([e.code, e.message]).toEqual(['conflict', 'This agency already has this lead.']);
    const after = await row(id);
    expect([after.status, after.leadId, after.decidedAt]).toEqual(['new', null, null]);
    expect(await dbs.service.select().from(lead)).toHaveLength(1); // only the twin: the pool lead inserted in the failed transaction rolled back
    expect(transport.sent).toHaveLength(0);
  });

  it('sends agency_new after commit', async () => {
    const id = await biz();
    await assign(op, { id, agencyId: IDS.agencyB, lookup: place });
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]!.to).toBe('admin@b.co');
  });

  it('platform_find_business is ledgered with agencyId null and capped at 50/day', async () => {
    const find = () => reg.invoke(op, 'platform_find_business', { name: 'Smile', location: 'Austin, TX' }) as Promise<{ places: { placeId: string; possibleDuplicate: boolean }[] }>;
    const r = await find();
    expect(r.places.map((p) => p.placeId)).toEqual(['p1', 'p2']);
    expect(r.places[0]).toHaveProperty('possibleDuplicate', false);
    expect(calls).toEqual([{ q: { keyword: 'Smile Austin, TX', locationName: 'United States' }, scope: { agencyId: null, clientId: null } }]);
    await dbs.service.update(intakeRate).set({ count: 50 }).where(eq(intakeRate.key, 'platform-lookup:op'));
    const e = await fails(find());
    expect([e.code, e.userFacing, e.message]).toEqual(['rate_limited', true, "You've reached today's limit of 50 business searches."]);
    expect(calls).toHaveLength(1);
    expect((await fails(reg.invoke(viewer, 'platform_find_business', { name: 'Smile', location: 'Austin, TX' }))).code).toBe('permission_denied');
  });
});
