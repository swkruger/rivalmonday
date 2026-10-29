import { type AccessContext, createAccessContext } from '@cs/core';
import { agencyInviteLink, brief, platformAdmin, platformAuditLog, platformSetting, waitlistEntry } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
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
