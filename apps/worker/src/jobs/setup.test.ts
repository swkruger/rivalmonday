import type { Ai } from '@cs/ai';
import type { DataForSeoClient } from '@cs/collectors';
import { agencyBilling, client, clientSetup, type SetupSuggestions } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createPackLoader } from '@cs/engine';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createSetupJobs, runSetupSuggestions } from './setup';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
afterEach(() => vi.restoreAllMocks());

const packs = createPackLoader();
const ID = IDS.clientA1;
const gbpItem = {
  title: 'A1 HVAC', category: 'HVAC contractor', additional_categories: ['Plumber'], place_id: 'p1',
  description: 'Family owned. We do AC repair and drain cleaning. Call Jane Smith on 404-555-0199.', services: [{ name: 'Emergency plumber' }],
};

function fakeDfs(item: unknown = gbpItem, statusCode = 20000) {
  const calls: { path: string; scope: unknown }[] = [];
  const dfs: DataForSeoClient = {
    async post(path, _tasks, scope) {
      calls.push({ path, scope });
      return [{ id: 't', statusCode, statusMessage: statusCode === 20000 ? 'Ok.' : 'Boom', result: [{ items: [item] }] }];
    },
    async get() {
      throw new Error('unexpected get');
    },
  };
  return Object.assign(dfs, { calls });
}

const reply = (text: string) => ({ text, model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 0, cachedTokens: 0, toolCalls: [], finishReason: 'stop' });
function fakeAi(impl: () => Promise<ReturnType<typeof reply>>) {
  const chat = vi.fn(impl);
  return { ai: { chat } as unknown as Ai, chat };
}
const answering = (answer: unknown) => fakeAi(async () => reply(typeof answer === 'string' ? answer : JSON.stringify(answer)));

const good = {
  services: [{ id: 'ac_repair', quote: 'AC repair' }, { id: 'nope_service', quote: 'AC repair' }],
  keywords: [{ text: 'emergency plumber', quote: 'Emergency plumber' }, { text: 'roof leak', quote: 'roof leak' }],
};

async function seed(over: { status?: SetupSuggestions['status']; placeId?: string | null } = {}) {
  await dbs.owner.update(client).set({ placeId: over.placeId === undefined ? 'place123456' : over.placeId }).where(eq(client.id, ID));
  await dbs.owner.insert(clientSetup).values({
    clientId: ID, agencyId: IDS.agencyA,
    lookup: { placeId: 'place123456', cid: null, title: 'A1 HVAC', address: null, city: 'Austin', category: null, phone: null, domain: null, rating: null, votes: null, lat: 1, lng: 1 },
    suggestions: { status: over.status ?? 'pending' } as SetupSuggestions,
  });
}
const stored = async () => (await dbs.owner.select().from(clientSetup).where(eq(clientSetup.clientId, ID)))[0]!.suggestions;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('runSetupSuggestions', () => {
  it('skips when not pending', async () => {
    await seed({ status: 'ready' });
    const { ai, chat } = answering(good);
    expect(await runSetupSuggestions({ db: dbs.service, dfs: fakeDfs(), ai, packs }, ID)).toEqual({ skipped: 'suggestions ready' });
    expect(chat).not.toHaveBeenCalled();
  });

  it('skips when the setup row is missing or the agency is not serviceable', async () => {
    const { ai, chat } = answering(good);
    expect(await runSetupSuggestions({ db: dbs.service, dfs: fakeDfs(), ai, packs }, ID)).toMatchObject({ skipped: expect.any(String) });
    await seed();
    await dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyA, state: 'suspended' });
    expect(await runSetupSuggestions({ db: dbs.service, dfs: fakeDfs(), ai, packs }, ID)).toMatchObject({ skipped: expect.any(String) });
    expect((await stored()).status).toBe('pending');
    expect(chat).not.toHaveBeenCalled();
  });

  it('writes ready with validated lists', async () => {
    await seed();
    const dfs = fakeDfs();
    const { ai, chat } = answering(good);
    expect(await runSetupSuggestions({ db: dbs.service, dfs, ai, packs }, ID)).toEqual({ status: 'ready' });
    expect(await stored()).toMatchObject({
      status: 'ready', sources: ['gbp'],
      services: [{ value: 'ac_repair', quote: 'AC repair' }],
      keywords: [{ value: 'emergency plumber', quote: 'Emergency plumber' }, { value: 'ac repair austin', quote: 'AC repair' }],
    });
    expect(dfs.calls[0]).toMatchObject({ scope: { agencyId: IDS.agencyA, clientId: ID } });
    expect(chat).toHaveBeenCalledWith('setup_suggestions', expect.anything(), { agencyId: IDS.agencyA, clientId: ID });
  });

  it('model input is redacted', async () => {
    await seed();
    const { ai, chat } = answering(good);
    await runSetupSuggestions({ db: dbs.service, dfs: fakeDfs(), ai, packs }, ID);
    const input = (chat.mock.calls[0] as unknown[])[1] as { messages: { content: string }[] };
    const sent = input.messages.map((m) => m.content).join('\n');
    expect(sent).not.toContain('404-555-0199');
    expect(sent).not.toContain('Jane Smith');
    expect(sent).toContain('AC repair');
  });

  it('writes failed when AI throws', async () => {
    await seed();
    const { ai } = fakeAi(async () => {
      throw new Error('boom');
    });
    expect(await runSetupSuggestions({ db: dbs.service, dfs: fakeDfs(), ai, packs }, ID)).toEqual({ status: 'failed' });
    expect((await stored()).status).toBe('failed');
  });

  it('writes failed when validateSuggestions returns null (never stays pending)', async () => {
    await seed();
    const { ai } = answering('not json');
    expect(await runSetupSuggestions({ db: dbs.service, dfs: fakeDfs(), ai, packs }, ID)).toEqual({ status: 'failed' });
    expect((await stored()).status).toBe('failed');
  });

  it('writes failed on a vendor error and when there is no place id', async () => {
    await seed();
    const { ai, chat } = answering(good);
    expect(await runSetupSuggestions({ db: dbs.service, dfs: fakeDfs(gbpItem, 50000), ai, packs }, ID)).toEqual({ status: 'failed' });
    expect((await stored()).status).toBe('failed');
    await dbs.owner.update(clientSetup).set({ suggestions: { status: 'pending' } }).where(eq(clientSetup.clientId, ID));
    await dbs.owner.update(client).set({ placeId: null }).where(eq(client.id, ID));
    expect(await runSetupSuggestions({ db: dbs.service, dfs: fakeDfs(), ai, packs }, ID)).toEqual({ status: 'failed' });
    expect((await stored()).status).toBe('failed');
    expect(chat).not.toHaveBeenCalled();
  });

  it('does not overwrite a result that landed while it ran (guarded update)', async () => {
    await seed();
    const { ai } = fakeAi(async () => {
      await dbs.owner.update(clientSetup).set({ suggestions: { status: 'failed' } }).where(eq(clientSetup.clientId, ID));
      return reply(JSON.stringify(good));
    });
    await runSetupSuggestions({ db: dbs.service, dfs: fakeDfs(), ai, packs }, ID);
    expect((await stored()).status).toBe('failed');
  });
});

describe('setup-suggestions job', () => {
  it('declares name and a short queue', () => {
    const { suggestions } = createSetupJobs({} as WorkerDeps, { envName: 'dev' });
    expect(suggestions).toMatchObject({ name: 'setup-suggestions', queue: { policy: 'short' } });
  });

  it.each(['demo', 'test'] as const)('skips in %s', async (envName) => {
    const generateSetupSuggestions = vi.fn();
    const { suggestions } = createSetupJobs({ generateSetupSuggestions } as unknown as WorkerDeps, { envName });
    expect(await suggestions.handler({ clientId: ID })).toEqual({ skipped: envName });
    expect(generateSetupSuggestions).not.toHaveBeenCalled();
  });

  it('delegates to deps in dev', async () => {
    const generateSetupSuggestions = vi.fn(async () => ({ status: 'ready' as const }));
    const { suggestions } = createSetupJobs({ generateSetupSuggestions } as unknown as WorkerDeps, { envName: 'dev' });
    expect(await suggestions.handler({ clientId: ID })).toEqual({ status: 'ready' });
    expect(generateSetupSuggestions).toHaveBeenCalledWith(ID);
  });
});
