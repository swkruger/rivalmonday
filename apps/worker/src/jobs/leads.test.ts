import type { Ai } from '@cs/ai';
import type { DataForSeoClient } from '@cs/collectors';
import { agencyBilling, contact, type Db, lead, type SetupLookup } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryTransport } from '@cs/email';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeadEmailDeps } from '@cs/tools';
import type { WorkerDeps } from '../deps';
import { createLeadJobs, runLeadPreview as runReal } from './leads';

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
