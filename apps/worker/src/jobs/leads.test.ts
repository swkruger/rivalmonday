import type { Ai } from '@cs/ai';
import type { DataForSeoClient } from '@cs/collectors';
import { agencyBilling, contact, type Db, intakeRate, lead, type SetupLookup } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryTransport } from '@cs/email';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeadEmailDeps } from '@cs/tools';
import type { WorkerDeps } from '../deps';
import { createLeadJobs, runLeadPreview as runReal, runLeadsCleanup } from './leads';

const runLeadPreview = (d: { db: Db; dfs: DataForSeoClient; ai: Ai; email: LeadEmailDeps | null }, id: string) => runReal({ db: d.db, email: d.email, clients: async () => ({ dfs: d.dfs, ai: d.ai }) }, id);

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
afterEach(() => vi.restoreAllMocks());

const lookup: SetupLookup = { placeId: 'me', cid: null, title: 'Smith Dental', address: null, city: 'Austin', category: 'Dentist', phone: null, domain: null, rating: 4.6, votes: 12, lat: 30, lng: -97 };
const item = (placeId: string, title: string, lat: number, rating = 4.8, votes = 40) => ({
  type: 'maps_search', title, rank_absolute: 1, place_id: placeId, rating: { value: rating, votes_count: votes }, latitude: lat, longitude: -97,
});

function fakeDfs(items: unknown[] = [item('me', 'Smith Dental', 30), item('n1', 'Near Dental', 30.01), item('n2', 'Far Dental', 30.1, 4, 5)]) {
  const calls: { path: string; scope: unknown; task: unknown }[] = [];
  const dfs: DataForSeoClient = {
    async post(path, tasks, scope) {
      calls.push({ path, scope, task: tasks[0] });
      return [{ id: 't', statusCode: 20000, statusMessage: 'Ok.', result: [{ items }] }];
    },
    async get() {
      throw new Error('unexpected get');
    },
  };
  return Object.assign(dfs, { calls });
}
const reply = (text: string) => ({ text, model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 0, cachedTokens: 0, toolCalls: [], finishReason: 'stop' });
const aiSays = (summary: string) => ({ chat: vi.fn(async () => reply(JSON.stringify({ summary }))) }) as unknown as Ai & { chat: ReturnType<typeof vi.fn> };
const aiThrows = () => ({ chat: vi.fn(async () => { throw new Error('boom'); }) }) as unknown as Ai;
const CLEAN = 'Smith Dental has 12 reviews at 4.6, while Near Dental has 40 at 4.8.';

let transport: ReturnType<typeof createMemoryTransport>;
const email = () => ({ service: dbs.service, transport, appUrl: 'https://app.test', fromAddress: 'briefs@app.test', platformAdmins: ['ops@platform.test'] });
async function mkLead(over: Partial<typeof lead.$inferInsert> = {}) {
  const [l] = await dbs.service
    .insert(lead)
    .values({ agencyId: IDS.agencyA, source: 'agency_link', status: 'verified', contactName: 'Sam Smith', email: 'sam@smith.co', lookup, ...over })
    .returning();
  return l!.id;
}
const row = async (id: string) => (await dbs.service.select().from(lead).where(eq(lead.id, id)))[0]!;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  transport = createMemoryTransport();
  await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, role: 'agency_admin', email: 'admin@a.co', name: 'Ada' });
});

describe('runLeadPreview', () => {
  it('ready + confirmation once across two runs', async () => {
    const id = await mkLead();
    const d = { db: dbs.service, dfs: fakeDfs(), ai: aiSays(CLEAN), email: email() };
    expect(await runLeadPreview(d, id)).toEqual({ status: 'ready' });
    const r = await row(id);
    expect(r.preview).toMatchObject({ status: 'ready', summary: CLEAN, category: 'Dentist' });
    expect(r.preview.status === 'ready' && r.preview.nearby.map((b) => b.name)).toEqual(['Near Dental', 'Far Dental']);
    expect(r.confirmationSentAt).not.toBeNull();
    expect(r.agencyNotifiedAt).not.toBeNull();
    expect(await runLeadPreview(d, id)).toEqual({ skipped: 'preview ready' });
    expect(transport.sent.filter((m) => m.to === 'sam@smith.co')).toHaveLength(1);
    expect(transport.sent.filter((m) => m.to === 'admin@a.co')).toHaveLength(1);
  });

  it('failed without category', async () => {
    const dfs = fakeDfs();
    const id = await mkLead({ lookup: { ...lookup, category: null } });
    expect(await runLeadPreview({ db: dbs.service, dfs, ai: aiSays(CLEAN), email: email() }, id)).toEqual({ status: 'failed' });
    expect((await row(id)).preview).toEqual({ status: 'failed' });
    expect(dfs.calls).toHaveLength(0);
    expect(transport.sent.filter((m) => m.to === 'sam@smith.co')).toHaveLength(1); // fallback copy
  });

  it('failed when no nearby business is usable', async () => {
    const id = await mkLead();
    expect(await runLeadPreview({ db: dbs.service, dfs: fakeDfs([item('me', 'Smith Dental', 30)]), ai: aiSays(CLEAN), email: email() }, id)).toEqual({ status: 'failed' });
    expect((await row(id)).preview.status).toBe('failed');
  });

  it('AI throws → ready with summary null', async () => {
    const id = await mkLead();
    expect(await runLeadPreview({ db: dbs.service, dfs: fakeDfs(), ai: aiThrows(), email: email() }, id)).toEqual({ status: 'ready' });
    expect((await row(id)).preview).toMatchObject({ status: 'ready', summary: null });
  });

  it('a summary that fails validation is dropped', async () => {
    const id = await mkLead();
    await runLeadPreview({ db: dbs.service, dfs: fakeDfs(), ai: aiSays('You have 99 reviews, the best in town.'), email: email() }, id);
    expect((await row(id)).preview).toMatchObject({ status: 'ready', summary: null });
  });

  it('deps unconfigured → failed + confirmation once', async () => {
    const id = await mkLead();
    const d = { db: dbs.service, email: email(), clients: async (): Promise<never> => { throw new Error('DATAFORSEO_LOGIN required'); } };
    expect(await runReal(d, id)).toEqual({ status: 'failed' });
    expect((await row(id)).preview).toEqual({ status: 'failed' });
    await runReal(d, id);
    expect(transport.sent.filter((m) => m.to === 'sam@smith.co')).toHaveLength(1);
  });

  it('re-run on a failed preview rebuilds it and sends no second confirmation', async () => {
    const id = await mkLead({ lookup: { ...lookup, category: null } });
    await runLeadPreview({ db: dbs.service, dfs: fakeDfs(), ai: aiSays(CLEAN), email: email() }, id);
    await dbs.service.update(lead).set({ lookup }).where(eq(lead.id, id));
    expect(await runLeadPreview({ db: dbs.service, dfs: fakeDfs(), ai: aiSays(CLEAN), email: email() }, id)).toEqual({ status: 'ready' });
    expect((await row(id)).preview.status).toBe('ready');
    expect(transport.sent.filter((m) => m.to === 'sam@smith.co')).toHaveLength(1);
  });

  it('pool lead notifies platform admins once', async () => {
    const id = await mkLead({ agencyId: null, source: 'platform' });
    const d = { db: dbs.service, dfs: fakeDfs(), ai: aiSays(CLEAN), email: email() };
    await runLeadPreview(d, id);
    await dbs.service.update(lead).set({ preview: { status: 'none' } }).where(eq(lead.id, id));
    await runLeadPreview(d, id);
    expect(transport.sent.filter((m) => m.to === 'ops@platform.test')).toHaveLength(1);
    expect(transport.sent.filter((m) => m.to === 'admin@a.co')).toHaveLength(0);
    expect((await row(id)).poolNotifiedAt).not.toBeNull();
  });

  it('skips leads of a suspended agency', async () => {
    await dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyA, state: 'suspended' } as typeof agencyBilling.$inferInsert);
    const id = await mkLead();
    const dfs = fakeDfs();
    expect(await runLeadPreview({ db: dbs.service, dfs, ai: aiSays(CLEAN), email: email() }, id)).toEqual({ skipped: 'lead not found or agency not serviceable' });
    expect(dfs.calls).toHaveLength(0);
    expect((await row(id)).preview).toEqual({ status: 'none' });
    expect(transport.sent).toHaveLength(0);
  });

  it('skips leads that are not verified', async () => {
    const id = await mkLead({ status: 'unverified' });
    expect(await runLeadPreview({ db: dbs.service, dfs: fakeDfs(), ai: aiSays(CLEAN), email: email() }, id)).toEqual({ skipped: 'lead unverified' });
  });

  it('preview Maps call ledgers with agency_id NULL', async () => {
    const id = await mkLead();
    const dfs = fakeDfs();
    const ai = aiSays(CLEAN);
    await runLeadPreview({ db: dbs.service, dfs, ai, email: email() }, id);
    expect(dfs.calls).toHaveLength(1);
    expect(dfs.calls[0]?.scope).toEqual({ agencyId: null, clientId: null });
    expect(dfs.calls[0]?.task).toMatchObject({ keyword: 'Dentist', depth: 20 });
    expect(ai.chat).toHaveBeenCalledWith('lead_preview_summary', expect.anything(), { agencyId: null, clientId: null });
  });

  it('still completes when emails are not configured', async () => {
    const id = await mkLead();
    expect(await runLeadPreview({ db: dbs.service, dfs: fakeDfs(), ai: aiSays(CLEAN), email: null }, id)).toEqual({ status: 'ready' });
  });
});

describe('lead-preview job', () => {
  it('declares name and a short queue', () => {
    expect(createLeadJobs({} as WorkerDeps, { envName: 'dev' }).preview).toMatchObject({ name: 'lead-preview', queue: { policy: 'short' } });
  });

  it.each(['demo', 'test'] as const)('skips in %s even with ref demo-fixture', async (envName) => {
    const generateLeadPreview = vi.fn();
    const id = await mkLead({ ref: 'demo-fixture' });
    const { preview } = createLeadJobs({ generateLeadPreview } as unknown as WorkerDeps, { envName });
    expect(await preview.handler({ leadId: id })).toEqual({ skipped: envName });
    expect(generateLeadPreview).not.toHaveBeenCalled();
  });

  it('delegates to deps in dev', async () => {
    const generateLeadPreview = vi.fn(async () => ({ status: 'ready' as const }));
    const { preview } = createLeadJobs({ generateLeadPreview } as unknown as WorkerDeps, { envName: 'dev' });
    const id = '11111111-1111-4111-8111-111111111111';
    expect(await preview.handler({ leadId: id })).toEqual({ status: 'ready' });
    expect(generateLeadPreview).toHaveBeenCalledWith(id);
  });
});

describe('leads-cleanup', () => {
  const DAYS = 86_400_000;
  const ago = (ms: number) => new Date(Date.now() - ms);
  const ready = { status: 'ready' as const, self: { name: 'Smith Dental', rating: 4.6, votes: 12 }, nearby: [], facts: [], summary: null, category: 'Dentist', generatedAt: '2026-10-17T00:00:00Z' };
  const cleanup = (email: LeadEmailDeps | null = email_()) => runLeadsCleanup({ db: dbs.service, email });
  const email_ = () => email();
  let n = 0;
  const mk = (over: Partial<typeof lead.$inferInsert> = {}) => mkLead({ email: `p${n++}@x.co`, preview: ready, ...over });

  it('declares name, cron and skips in demo/test', async () => {
    const runs = vi.fn();
    expect(createLeadJobs({ serviceDb: runs } as unknown as WorkerDeps, { envName: 'dev' }).cleanup).toMatchObject({ name: 'leads-cleanup', cron: '30 3 * * *' });
    for (const envName of ['demo', 'test'] as const) {
      expect(await createLeadJobs({ serviceDb: runs } as unknown as WorkerDeps, { envName }).cleanup.handler({})).toEqual({ skipped: envName });
    }
    expect(runs).not.toHaveBeenCalled();
  });

  it('expires unverified leads past 48 h', async () => {
    const old = await mk({ status: 'unverified', verifyExpiresAt: ago(1000) });
    const fresh = await mk({ status: 'unverified', verifyExpiresAt: new Date(Date.now() + 3600_000) });
    await cleanup();
    expect((await row(old)).status).toBe('expired');
    expect((await row(fresh)).status).toBe('unverified');
  });

  it('deletes declined/expired > 90 d, scrubs accepted > 90 d, keeps recent ones', async () => {
    const stale = ago(91 * DAYS);
    const declined = await mk({ status: 'declined', decidedAt: stale, updatedAt: stale, confirmationSentAt: stale });
    const expired = await mk({ status: 'expired', updatedAt: stale });
    const recentDeclined = await mk({ status: 'declined', decidedAt: ago(10 * DAYS), updatedAt: ago(10 * DAYS) });
    const accepted = await mk({ status: 'accepted', decidedAt: stale, updatedAt: stale, message: 'hi', phone: '555' });
    const recentAccepted = await mk({ status: 'accepted', decidedAt: ago(DAYS), updatedAt: ago(DAYS), message: 'hi', phone: '555' });
    const r = await cleanup();
    expect(r).toMatchObject({ deleted: 2, scrubbed: 1 });
    expect(await dbs.service.select().from(lead).where(eq(lead.id, declined))).toEqual([]);
    expect(await dbs.service.select().from(lead).where(eq(lead.id, expired))).toEqual([]);
    expect((await row(recentDeclined)).status).toBe('declined');
    expect(await row(accepted)).toMatchObject({ status: 'accepted', message: null, phone: null, contactName: 'Sam Smith' });
    expect(await row(recentAccepted)).toMatchObject({ message: 'hi', phone: '555' });
  });

  it('purges rate rows older than 2 days', async () => {
    await dbs.service.insert(intakeRate).values([
      { key: 'old', windowStart: ago(3 * DAYS), count: 1 },
      { key: 'new', windowStart: ago(3600_000), count: 1 },
    ]);
    expect(await cleanup()).toMatchObject({ ratePurged: 1 });
    expect((await dbs.service.select().from(intakeRate)).map((x) => x.key)).toEqual(['new']);
  });

  it('stale pending preview becomes failed and the confirmation is sent once', async () => {
    const stale = await mk({ preview: { status: 'pending' }, updatedAt: ago(20 * 60_000) });
    const live = await mk({ preview: { status: 'pending' }, updatedAt: ago(60_000) });
    await cleanup();
    await cleanup();
    expect((await row(stale)).preview).toEqual({ status: 'failed' });
    expect((await row(live)).preview).toEqual({ status: 'pending' });
    const toLead = transport.sent.filter((m) => m.to === 'sam@smith.co' || String(m.to).startsWith('p'));
    expect(toLead.filter((m) => m.tag === 'lead_confirmation')).toHaveLength(1);
    expect((await row(stale)).confirmationSentAt).toBeInstanceOf(Date);
    expect((await row(live)).confirmationSentAt).toBeNull();
  });

  it('re-sends a confirmation whose guard was cleared, once', async () => {
    const id = await mk();
    await cleanup();
    await cleanup();
    expect(transport.sent.filter((m) => m.tag === 'lead_confirmation')).toHaveLength(1);
    await dbs.service.update(lead).set({ confirmationSentAt: null }).where(eq(lead.id, id));
    await cleanup();
    await cleanup();
    expect(transport.sent.filter((m) => m.tag === 'lead_confirmation')).toHaveLength(2);
  });

  it('re-sends agency_new and pool_new with null guards', async () => {
    const agencyLead = await mk({ confirmationSentAt: new Date() });
    const poolLead = await mk({ agencyId: null, source: 'platform', confirmationSentAt: new Date() });
    const r = await cleanup();
    expect(r.retried).toMatchObject({ agency_new: 1, pool_new: 1 });
    expect(transport.sent.map((m) => m.tag).sort()).toEqual(['lead_agency_new', 'lead_pool_new']);
    expect((await row(agencyLead)).agencyNotifiedAt).toBeInstanceOf(Date);
    expect((await row(poolLead)).poolNotifiedAt).toBeInstanceOf(Date);
  });

  it('does not send an agency notice for an unassigned-preview agency lead still pending', async () => {
    await mk({ preview: { status: 'none' }, confirmationSentAt: new Date() });
    await cleanup();
    expect(transport.sent).toEqual([]);
  });

  it('ignores leads updated > 7 days ago', async () => {
    await mk({ updatedAt: ago(8 * DAYS) });
    const r = await cleanup();
    expect(r.retried).toEqual({ confirmation: 0, agency_new: 0, pool_new: 0 });
    expect(transport.sent).toEqual([]);
  });

  it('never re-sends declined', async () => {
    await mk({ status: 'declined', decidedAt: ago(DAYS), updatedAt: ago(DAYS), declinedNotifiedAt: null });
    await cleanup();
    expect(transport.sent).toEqual([]);
  });

  it('without email config it still cleans and skips the retry', async () => {
    const id = await mk();
    const r = await cleanup(null);
    expect(r.retried).toEqual({ confirmation: 0, agency_new: 0, pool_new: 0 });
    expect((await row(id)).confirmationSentAt).toBeNull();
  });

  it('a verified lead whose preview never started (enqueue lost) becomes failed and gets the confirmation', async () => {
    const id = await mk({ preview: { status: 'none' }, updatedAt: ago(20 * 60_000) });
    const fresh = await mk({ preview: { status: 'none' }, updatedAt: ago(60_000) });
    const r = await cleanup();
    expect((await row(id)).preview).toEqual({ status: 'failed' });
    expect((await row(fresh)).preview).toEqual({ status: 'none' });
    expect(r.retried.confirmation).toBe(1);
    expect(transport.sent.filter((m) => m.tag === 'lead_confirmation')).toHaveLength(1);
  });

  it('one failing step does not stop the later steps, and the job still fails', async () => {
    const id = await mk({ preview: { status: 'pending' }, updatedAt: ago(20 * 60_000) });
    await dbs.service.insert(intakeRate).values({ key: 'old', windowStart: ago(3 * DAYS), count: 1 });
    const db = dbs.service;
    const broken = new Proxy(db, {
      get(t, k, rcv) {
        if (k === 'delete') return () => { throw new Error('boom'); };
        return Reflect.get(t, k, rcv);
      },
    }) as Db;
    await expect(runLeadsCleanup({ db: broken, email: email() })).rejects.toThrow(/delete, rate/);
    expect((await row(id)).preview).toEqual({ status: 'failed' });
    expect(transport.sent.filter((m) => m.tag === 'lead_confirmation')).toHaveLength(1);
  });
});
