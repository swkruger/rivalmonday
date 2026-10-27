import type { Ai } from '@cs/ai';
import type { DataForSeoClient } from '@cs/collectors';
import { agencyBilling, agencyWebhook, client, clientSetup, competitorSuggestion, contact, discoveryRun, invitation, notification, type SetupSuggestions } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { addContact, createPackLoader, type DeliveryConfig } from '@cs/engine';
import { eq, like } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createSetupJobs, runSetupReminders, runSetupSuggestions } from './setup';
import { workerLog } from '../log';

const review = vi.hoisted(() => ({ failFor: null as string | null }));
vi.mock('@cs/tools', async (orig) => {
  const mod = await orig<typeof import('@cs/tools')>();
  return {
    ...mod,
    queueCompetitorReview: (...a: Parameters<typeof mod.queueCompetitorReview>) => {
      if (review.failFor === a[2].clientId) throw new Error('boom');
      return mod.queueCompetitorReview(...a);
    },
  };
});

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
afterEach(() => {
  vi.restoreAllMocks();
  review.failFor = null;
});

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
  vi.spyOn(workerLog, 'info').mockImplementation(() => {});
  vi.spyOn(workerLog, 'error').mockImplementation(() => {});
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
      status: 'ready', newAreas: [], sources: ['gbp'],
      services: [{ value: 'ac_repair', quote: 'AC repair' }],
      keywords: [{ value: 'emergency plumber', quote: 'Emergency plumber' }, { value: 'ac repair austin', quote: 'AC repair' }],
    });
    expect(dfs.calls[0]).toMatchObject({ scope: { agencyId: IDS.agencyA, clientId: ID } });
    expect(chat).toHaveBeenCalledWith('setup_suggestions', expect.anything(), { agencyId: IDS.agencyA, clientId: ID });
  });

  it('stores Google services that match no area as newAreas (14a), from the GBP services alone', async () => {
    await seed();
    const dfs = fakeDfs({ ...gbpItem, services: [{ name: 'Radiant floor heating' }, { name: 'AC repair' }] });
    const { ai } = answering(good);
    await runSetupSuggestions({ db: dbs.service, dfs, ai, packs }, ID);
    expect(await stored()).toMatchObject({ status: 'ready', newAreas: [{ name: 'Radiant floor heating', quote: 'Radiant floor heating' }] });
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

  it('model input keeps the GBP title as a business name, even when it differs from the client name', async () => {
    await seed();
    const item = { ...gbpItem, title: 'Mike Johnson Plumbing', description: 'Mike Johnson Plumbing does AC repair. Ask for Jane Smith.' };
    const { ai, chat } = answering(good);
    await runSetupSuggestions({ db: dbs.service, dfs: fakeDfs(item), ai, packs }, ID);
    const input = (chat.mock.calls[0] as unknown[])[1] as { messages: { content: string }[] };
    const sent = input.messages.map((m) => m.content).join(' ');
    expect(sent).toContain('Mike Johnson Plumbing does AC repair');
    expect(sent).not.toContain('Jane Smith');
  });

  it('skips a paused client without a paid call', async () => {
    await seed();
    await dbs.owner.update(client).set({ pausedAt: new Date() }).where(eq(client.id, ID));
    const dfs = fakeDfs();
    const { ai, chat } = answering(good);
    expect(await runSetupSuggestions({ db: dbs.service, dfs, ai, packs }, ID)).toEqual({ skipped: 'client paused' });
    expect(dfs.calls).toHaveLength(0);
    expect(chat).not.toHaveBeenCalled();
    expect((await stored()).status).toBe('pending');
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

describe('runSetupReminders (Task 9)', () => {
  const delivery: DeliveryConfig = { appUrl: 'https://app.example', linkSecrets: ['s'.repeat(32)], fromAddress: 'b@agency.example' };
  const NOW = new Date('2026-10-20T14:00:00Z');
  const D = 86_400_000;
  const ago = (ms: number) => new Date(NOW.getTime() - ms);
  const later = (ms: number) => new Date(NOW.getTime() + ms);
  const run = (now = NOW) => runSetupReminders({ db: dbs.service, delivery }, now);
  const rows = (kind?: string) =>
    dbs.owner.select().from(notification).then((r) => r.filter((n) => n.channel === 'email' && (!kind || n.kind === kind)));
  const tiers = async () => (await rows('setup_idle')).map((r) => r.dedupeKey.split(':')[2]).sort();

  /** Steps 1-3 done (phone + owner contact, keywords + a centre); the setup row as given. */
  async function seedOpen(over: Partial<typeof clientSetup.$inferInsert> = {}) {
    await dbs.owner.update(client).set({ phone: '817-555-0100', keywords: ['hvac'], serviceArea: { center: { lat: 1, lng: 1 }, radiusKm: 16, zips: [] }, placeId: 'p1' }).where(eq(client.id, ID));
    await dbs.owner.insert(contact).values({ agencyId: IDS.agencyA, clientId: ID, role: 'client_owner', email: 'pat@smith.co', name: 'Pat', active: false });
    await dbs.owner.insert(clientSetup).values({ clientId: ID, agencyId: IDS.agencyA, createdAt: ago(D), ...over });
  }
  async function withDoneRun(suggested: number) {
    const [r] = await dbs.owner.insert(discoveryRun).values({ agencyId: IDS.agencyA, clientId: ID, status: 'done', trigger: 'auto', startedAt: ago(D / 2) }).returning();
    for (let i = 0; i < suggested; i++) {
      await dbs.owner.insert(competitorSuggestion).values({ agencyId: IDS.agencyA, clientId: ID, name: `Rival ${i}`, placeId: `rp${i}`, appearances: 1, overlapScore: 1, runId: r!.id, tier: 'top' });
    }
  }
  beforeEach(async () => {
    await addContact(dbs.service, { agencyId: IDS.agencyA, role: 'account_manager', email: 'am@a.example' });
    await dbs.service.insert(agencyWebhook).values({ agencyId: IDS.agencyA, kind: 'slack', url: 'https://hooks.slack.com/services/T/B/X', createdBy: 'x' });
  });

  it('queues suggestions_ready once across two runs', async () => {
    await seedOpen();
    await withDoneRun(2);
    expect((await run()).queued).toBe(3); // email + in_app + slack
    expect(await run()).toEqual({ queued: 0 });
    const [mail] = await rows('setup_suggestions_ready');
    expect(mail).toMatchObject({ title: 'Competitor suggestions are ready for A1 HVAC', subjectType: 'setup', subjectId: ID, address: 'am@a.example' });
    expect(mail!.dedupeKey).toMatch(new RegExp(`^setup-ready:${ID}:`));
    expect(mail!.link).toContain('/l/');
    expect(mail!.payload).toMatchObject({ template: 'agency_notice', props: { notice: 'setup_suggestions_ready', actionLabel: 'Open setup', clientName: 'A1 HVAC' } });
  });

  it('does not queue suggestions_ready for a done run with no suggested rows', async () => {
    await seedOpen();
    await withDoneRun(0);
    await run();
    expect(await rows('setup_suggestions_ready')).toHaveLength(0);
  });

  it('a done search with zero rivals found sends the idle reminder, not suggestions_ready', async () => {
    await seedOpen({ createdAt: ago(4 * D) });
    await withDoneRun(0);
    expect((await run()).queued).toBe(3);
    expect(await rows('setup_suggestions_ready')).toHaveLength(0);
    expect(await tiers()).toEqual(['3']);
  });

  it('Done picking no longer ends the reminders: idle fires while the invite step is todo, stops once it is skipped', async () => {
    await seedOpen({ createdAt: ago(4 * D), competitorsDoneAt: ago(4 * D) });
    await withDoneRun(0);
    expect((await run()).queued).toBe(3);
    expect(await tiers()).toEqual(['3']);
    await dbs.owner.update(clientSetup).set({ skipped: ['invite'] }); // billing reads skipped without Connect: nothing left
    expect(await run(later(4 * D))).toEqual({ queued: 0 });
  });

  it('client_changed once per day', async () => {
    await seedOpen({ lastChangedRole: 'client_owner', lastChangedAt: ago(2 * 3_600_000) });
    expect((await run()).queued).toBe(3);
    expect(await run()).toEqual({ queued: 0 });
    const [mail] = await rows('setup_client_changed');
    expect(mail).toMatchObject({ title: 'A1 HVAC updated their setup' });
    expect(mail!.dedupeKey).toMatch(new RegExp(`^setup-client:${ID}:2026-10-20:`));
    // a staff change does not queue; neither does a client change older than 24 h
    await dbs.owner.update(clientSetup).set({ lastChangedRole: 'account_manager' });
    expect(await run(later(3_600_000))).toEqual({ queued: 0 });
    await dbs.owner.update(clientSetup).set({ lastChangedRole: 'client_owner' });
    expect(await run(later(D))).toEqual({ queued: 0 });
  });

  it('idle at 3 and 7 days, never 14', async () => {
    await seedOpen({ createdAt: ago(2 * D) });
    expect(await run()).toEqual({ queued: 0 });
    expect((await run(later(D))).queued).toBe(3);
    expect((await rows('setup_idle'))[0]).toMatchObject({ title: "A1 HVAC's setup is waiting on you" });
    expect((await run(later(3 * D))).queued).toBe(0);
    expect((await run(later(5 * D))).queued).toBe(3); // 7 days old
    expect(await tiers()).toEqual(['3', '7']);
    expect((await run(later(12 * D))).queued).toBe(0); // 14 days old: nothing new
  });

  it('idle: a setup already past 7 days with no 3-day notice gets the 3-day first, then the 7-day', async () => {
    await seedOpen({ createdAt: ago(8 * D) });
    await run();
    expect(await tiers()).toEqual(['3']);
    await run(later(D));
    expect(await tiers()).toEqual(['3', '7']);
  });

  it('idle counts from last_changed_at, and only while waiting on the agency', async () => {
    await seedOpen({ createdAt: ago(10 * D), lastChangedAt: ago(D), lastChangedRole: 'account_manager' });
    expect(await run()).toEqual({ queued: 0 });
    await dbs.owner.update(clientSetup).set({ lastChangedAt: ago(4 * D) });
    expect((await run()).queued).toBe(3);
    // profile done + search running = waiting on the system, not the agency
    await truncateAll(dbs.owner);
    await seedTenancy(dbs.owner);
    await addContact(dbs.service, { agencyId: IDS.agencyA, role: 'account_manager', email: 'am@a.example' });
    await seedOpen({ createdAt: ago(10 * D) });
    await dbs.owner.insert(discoveryRun).values({ agencyId: IDS.agencyA, clientId: ID, status: 'searching', trigger: 'auto' });
    expect(await run()).toEqual({ queued: 0 });
  });

  describe('competitor review email (Task 20)', () => {
    const reviews = () => rows('competitor_review');
    async function invite() {
      const [c] = await dbs.owner.insert(contact).values({ agencyId: IDS.agencyA, clientId: ID, role: 'client_owner', email: 'owner@smith.co', active: false }).returning();
      await dbs.owner.update(clientSetup).set({ invitedContactId: c!.id }).where(eq(clientSetup.clientId, ID));
      await dbs.owner.insert(invitation).values({ agencyId: IDS.agencyA, clientId: ID, email: 'owner@smith.co', role: 'client_owner', invitedBy: 'x', expiresAt: later(5 * D) });
    }

    it('sends once across two runs, to the invited owner only, before staff notices', async () => {
      await seedOpen();
      await withDoneRun(2);
      await invite();
      await run();
      await run();
      const mail = await reviews();
      expect(mail).toHaveLength(1);
      expect(mail[0]).toMatchObject({ address: 'owner@smith.co', subjectType: 'setup', subjectId: ID });
      expect(mail[0]!.payload).toMatchObject({ template: 'competitor_review', props: { competitorNames: ['Rival 0', 'Rival 1'], businessName: 'A1 HVAC' } });
    });

    it('sends in the same run as the staff notices', async () => {
      await seedOpen({ lastChangedAt: ago(1000), lastChangedRole: 'account_manager' });
      await withDoneRun(1);
      await invite();
      expect((await run()).queued).toBe(4); // suggestions_ready (3) + the owner's review
      expect(await reviews()).toHaveLength(1);
    });

    it('a throwing review does not block the staff notices or the next client', async () => {
      await seedOpen({ lastChangedRole: 'client_owner', lastChangedAt: ago(3_600_000) });
      await withDoneRun(1);
      await invite();
      review.failFor = ID;
      vi.spyOn(workerLog, 'error').mockImplementation(() => {});
      expect((await run()).queued).toBe(6); // suggestions_ready + client_changed, 3 rows each; no review
      expect(await reviews()).toHaveLength(0);
      expect(await rows('setup_client_changed')).toHaveLength(1);
    });

    it('a completed setup waiting on the owner pick still sends the review email, but no staff notices (O12)', async () => {
      await seedOpen({ createdAt: ago(10 * D), ownerPickRequestedAt: ago(D), completedAt: ago(D), skipped: ['invite'] });
      await withDoneRun(2);
      await invite();
      expect((await run()).queued).toBe(1);
      expect(await reviews()).toHaveLength(1);
      expect(await dbs.owner.select().from(notification).where(like(notification.dedupeKey, 'setup-%'))).toHaveLength(0);
      // Once the owner picked, nothing more.
      await truncateAll(dbs.owner);
      await seedTenancy(dbs.owner);
      await seedOpen({ ownerPickRequestedAt: ago(D), competitorsDoneAt: ago(1000), completedAt: ago(D) });
      await withDoneRun(2);
      await invite();
      expect(await run()).toEqual({ queued: 0 });
    });

    it('no suggestions_ready notice while waiting on the owner (they pick, not staff)', async () => {
      await seedOpen({ ownerPickRequestedAt: ago(1000) });
      await withDoneRun(2);
      await run();
      expect(await rows('setup_suggestions_ready')).toHaveLength(0);
    });

    it('does not send without an invite or once competitors are done', async () => {
      await seedOpen();
      await withDoneRun(2);
      await run();
      expect(await reviews()).toHaveLength(0);
      await invite();
      await dbs.owner.update(clientSetup).set({ competitorsDoneAt: ago(1000) });
      await run();
      expect(await reviews()).toHaveLength(0);
    });
  });

  it('skips completed, dismissed, paused clients and unserviceable agencies', async () => {
    await seedOpen({ createdAt: ago(10 * D), lastChangedRole: 'client_owner', lastChangedAt: ago(3_600_000) });
    await withDoneRun(1);
    const set = (v: Partial<typeof clientSetup.$inferInsert>) => dbs.owner.update(clientSetup).set(v).where(eq(clientSetup.clientId, ID));
    await set({ completedAt: ago(1000) });
    expect(await run()).toEqual({ queued: 0 });
    await set({ completedAt: null, dismissedAt: ago(1000) });
    expect(await run()).toEqual({ queued: 0 });
    await set({ dismissedAt: null });
    await dbs.owner.update(client).set({ pausedAt: ago(1000) }).where(eq(client.id, ID));
    expect(await run()).toEqual({ queued: 0 });
    await dbs.owner.update(client).set({ pausedAt: null }).where(eq(client.id, ID));
    await dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyA, state: 'suspended' });
    expect(await run()).toEqual({ queued: 0 });
    expect(await dbs.owner.select().from(notification).where(like(notification.dedupeKey, 'setup-%'))).toHaveLength(0);
  });

  it('skips in demo/test and when delivery is not configured', async () => {
    for (const envName of ['demo', 'test'] as const) {
      const setupReminders = vi.fn();
      const { reminders } = createSetupJobs({ setupReminders, deliveryConfigured: () => true } as unknown as WorkerDeps, { envName });
      expect(await reminders.handler({})).toEqual({ skipped: envName });
      expect(setupReminders).not.toHaveBeenCalled();
    }
    const setupReminders = vi.fn(async () => ({ queued: 2 }));
    expect(await createSetupJobs({ setupReminders, deliveryConfigured: () => false } as unknown as WorkerDeps, { envName: 'dev' }).reminders.handler({})).toEqual({ skipped: 'delivery not configured' });
    expect(await createSetupJobs({ setupReminders, deliveryConfigured: () => true } as unknown as WorkerDeps, { envName: 'dev' }).reminders.handler({})).toEqual({ queued: 2 });
  });
});
