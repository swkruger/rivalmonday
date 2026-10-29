import { type AccessContext, createAccessContext } from '@cs/core';
import { brief, platformAdmin, platformSetting, waitlistEntry } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
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
