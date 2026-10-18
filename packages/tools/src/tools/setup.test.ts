import type { MapsPlace } from '@cs/collectors';
import { type AccessContext, type CallScope, createAccessContext } from '@cs/core';
import { agencyConnect, client, clientCompetitor, clientSetup, competitorSuggestion, contact, discoveryRun, invitation, vendorCall, withTenant } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnqueueJob } from '../deps';
import { FIND_BUSINESS_DAILY_CAP } from '../setup/lookup';
import type { SetupState } from '../setup/state';
import { createToolRegistry } from '../registry';
import { closedSetupRecheck, reportedSuggestions } from './setup';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const mk = (role: AccessContext['role'], scope: AccessContext['clientScope'] = 'all') => createAccessContext({ agencyId: IDS.agencyA, userId: `u-${role}`, role, clientScope: scope, features: [] });
const admin = mk('agency_admin');
const OP = '/serp/google/maps/live/advanced';

const place = (i: number, over: Partial<MapsPlace> = {}): MapsPlace => ({
  placeId: `p${i}`, cid: `c${i}`, title: `Biz ${i}`, domain: null, url: null, rank: i, rating: 4, votes: 5, category: 'Dentist', address: 'x', lat: 1, lng: 2, city: 'Austin', phone: null, ...over,
});
let calls: { q: { keyword: string; locationName: string }; scope: CallScope }[];
let results: MapsPlace[];
let registry: ReturnType<typeof createToolRegistry>;
const find = (ctx: AccessContext = admin) => registry.invoke(ctx, 'find_business', { name: 'Smile', location: 'Austin, TX' }) as Promise<{ places: (MapsPlace & { suggestedVerticalId: string | null; isClaimed: boolean | null; possibleDuplicate: boolean })[] }>;
const fails = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e as { code?: string; message: string; userFacing?: boolean }; }
  throw new Error('expected a failure');
};
const seed = (n: number, over: Partial<typeof vendorCall.$inferInsert> = {}) =>
  dbs.owner.insert(vendorCall).values(Array.from({ length: n }, () => ({ agencyId: IDS.agencyA, clientId: null, vendor: 'dataforseo', operation: OP, units: 1, latencyMs: 1, ok: true, ...over })));

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  calls = [];
  results = [place(1)];
  registry = createToolRegistry(
    { app: dbs.app, service: dbs.service, setupLookup: async (q, scope) => { calls.push({ q, scope }); return results; } },
    { audit: { record: async () => {} } },
  );
});

describe('find_business', () => {
  it('find_business collapses identical listings before the 5-result cap', async () => {
    results = [place(1), place(2), place(1, { rank: 3 }), place(3), place(2, { placeId: 'other', rank: 5 }), place(4), place(5), place(6)];
    const r = await find();
    expect(r.places.map((p) => p.placeId)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('find_business flags rows sharing a phone', async () => {
    results = [place(1, { phone: '+1817-286-3655' }), place(2, { phone: '(817) 286-3655' }), place(3, { phone: '+1817-111-2222' })];
    expect((await find()).places.map((p) => p.possibleDuplicate)).toEqual([true, true, false]);
  });

  it('find_business passes isClaimed through (a collapsed twin claims it)', async () => {
    results = [place(1, { isClaimed: false }), place(1, { isClaimed: true }), place(2, { isClaimed: false }), place(3)];
    expect((await find()).places.map((p) => p.isClaimed)).toEqual([true, false, null]);
  });

  it('refuses client-scoped staff', async () => {
    expect((await fails(find(mk('account_manager', [IDS.clientA1])))).code).toBe('permission_denied');
    expect(calls).toHaveLength(0);
  });

  it('refuses (rate_limited, user-facing copy) once 30 calls exist today', async () => {
    await seed(FIND_BUSINESS_DAILY_CAP);
    const e = await fails(find());
    expect(e.code).toBe('rate_limited');
    expect(e.message).toBe("You've reached today's limit of 30 business searches. Try again tomorrow or enter the details by hand.");
    expect(e.userFacing).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('allows the 30th call and ignores yesterday, other operations and other agencies', async () => {
    await seed(FIND_BUSINESS_DAILY_CAP - 1);
    await seed(5, { createdAt: new Date(Date.now() - 2 * 86_400_000) });
    await seed(5, { operation: '/other' });
    await seed(5, { agencyId: IDS.agencyB });
    await expect(find()).resolves.toBeTruthy();
  });

  it('client-scoped maps calls do not count toward the cap', async () => {
    await seed(FIND_BUSINESS_DAILY_CAP, { clientId: IDS.clientA1 });
    await expect(find()).resolves.toBeTruthy();
  });

  it('find_business turns a vendor failure into a user-facing refusal', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reg = createToolRegistry(
      { app: dbs.app, service: dbs.service, setupLookup: async () => { throw new Error('DataForSEO 503 for Smile Austin'); } },
      { audit: { record: async () => {} } },
    );
    const e = await fails(reg.invoke(admin, 'find_business', { name: 'Smile', location: 'Austin, TX' }));
    spy.mockRestore();
    expect(e.code).toBe('internal');
    expect(e.userFacing).toBe(true);
    expect(e.message).toBe("Business search isn't available right now. Try again, or enter the details by hand.");
  });

  it('ledgers with clientId null', async () => {
    await find();
    expect(calls).toEqual([{ q: { keyword: 'Smile Austin, TX', locationName: 'United States' }, scope: { agencyId: IDS.agencyA, clientId: null } }]);
  });

  it('hides closed places and caps at 5', async () => {
    results = [place(1, { closed: true }), place(2, { lat: null }), ...[3, 4, 5, 6, 7, 8, 9].map((i) => place(i))];
    const { places } = await find();
    expect(places.map((p) => p.placeId)).toEqual(['p3', 'p4', 'p5', 'p6', 'p7']);
    expect(places[0]!.suggestedVerticalId).toBe('dental');
  });

  it('refuses with a user-facing message when no lookup is configured', async () => {
    registry = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async () => {} } });
    const e = await fails(find());
    expect(e.code).toBe('internal');
    expect(e.message).toBe('Business search is not configured');
    expect(e.userFacing).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Phase 11a Task 7: wizard tools.

const wizEnqueue = vi.fn<EnqueueJob>(async () => {});
const wiz = () => createToolRegistry({ app: dbs.app, service: dbs.service, enqueue: wizEnqueue }, { audit: { record: async () => {} } });
const ownerA1 = mk('client_owner', [IDS.clientA1]);
const viewerA1 = mk('client_viewer', [IDS.clientA1]);
const adminB = createAccessContext({ agencyId: IDS.agencyB, userId: 'u-admin-b', role: 'agency_admin', clientScope: 'all', features: [] });
const AREA = { center: { lat: 32.44, lng: -97.79 }, radiusKm: 10, zips: [] };
const PROFILE = { keywords: ['ac repair'], serviceArea: AREA, placeId: 'ChIJa1hvacplace1' };
type Out = { state: SetupState; searchRefusal?: string | null };
type GetOut = Out & {
  invite: { status: string; name: string | null; email: string | null };
  lookup: unknown; suggestions: { status: string };
  search: { status: string; progress: Record<string, number>; kept: number | null; finishedAt: string | null } | null;
  competitorSuggestions: { id: string; tier: string; status: string; preTicked: boolean }[];
  vertical: { name: string; services: { id: string; name: string }[]; seedKeywords: string[] };
};

const setupRow = (v: Partial<typeof clientSetup.$inferInsert> = {}) => dbs.owner.insert(clientSetup).values({ clientId: IDS.clientA1, agencyId: IDS.agencyA, ...v });
const setupOf = async () => (await dbs.owner.select().from(clientSetup).where(eq(clientSetup.clientId, IDS.clientA1)))[0]!;
const fillProfile = () => dbs.owner.update(client).set(PROFILE).where(eq(client.id, IDS.clientA1));
const runs = () => dbs.owner.select().from(discoveryRun).where(eq(discoveryRun.clientId, IDS.clientA1));
const statuses = async () => Object.fromEntries((await dbs.owner.select().from(competitorSuggestion)).map((x) => [x.id, x.status]));

type RunStatus = typeof discoveryRun.$inferInsert['status'];
async function run(status: RunStatus, o: { trigger?: 'manual' | 'auto'; finishedAt?: Date | null; clientId?: string } = {}): Promise<string> {
  const finishedAt = o.finishedAt === undefined ? (status === 'done' || status === 'failed' ? new Date(Date.now() - 3_600_000) : null) : o.finishedAt;
  const [r] = await dbs.owner.insert(discoveryRun).values({
    agencyId: IDS.agencyA, clientId: o.clientId ?? IDS.clientA1, trigger: o.trigger ?? 'auto', status, finishedAt,
    startedAt: new Date((finishedAt ?? new Date()).getTime() - 600_000),
  }).returning({ id: discoveryRun.id });
  return r!.id;
}

async function sug(runId: string, name: string, o: { tier?: 'top' | 'watch' | 'minor'; overlap?: number; status?: 'suggested' | 'accepted' | 'dismissed'; clientId?: string } = {}): Promise<string> {
  const [s] = await dbs.owner.insert(competitorSuggestion).values({
    agencyId: IDS.agencyA, clientId: o.clientId ?? IDS.clientA1, runId, name, placeId: `pl-${name.replace(/\W/g, '')}-place`, appearances: 4, bestRank: 2,
    overlapScore: o.overlap ?? 0.5, status: o.status ?? 'suggested', tier: o.tier ?? 'top', overlap: o.overlap ?? 0.5, activity: 0.5, rating: 4.5, votes: 40,
    distanceKm: 3.1, signals: { rating: 4.5 }, adMatches: [{ platform: 'google', accountId: 'AR1', name: 'x', strength: 'weak' }],
  }).returning({ id: competitorSuggestion.id });
  return s!.id;
}

const get = (ctx: AccessContext, clientId: string = IDS.clientA1) => wiz().invoke(ctx, 'get_client_setup', { clientId }) as Promise<GetOut>;
const save = (ctx: AccessContext, input: Record<string, unknown>) => wiz().invoke(ctx, 'save_setup_profile', { clientId: IDS.clientA1, ...input }) as Promise<Out>;
const pick = (ctx: AccessContext, accept: string[], dismiss: string[] = [], clientId: string = IDS.clientA1) =>
  wiz().invoke(ctx, 'pick_setup_competitors', { clientId, accept, dismiss }) as Promise<Out>;
const advance = (ctx: AccessContext, action: string, clientId: string = IDS.clientA1) => wiz().invoke(ctx, 'advance_client_setup', { clientId, action }) as Promise<Out>;

describe('wizard tools', () => {
  beforeEach(() => wizEnqueue.mockClear());

  describe('assertSetupActor', () => {
    it('client_owner can save profile while open', async () => {
      await setupRow();
      const out = await save(ownerA1, { keywords: ['furnace repair'] });
      expect(out.state.open).toBe(true);
      const [c] = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1));
      expect(c!.keywords).toEqual(['furnace repair']);
      expect(await setupOf()).toMatchObject({ lastChangedBy: 'u-client_owner', lastChangedRole: 'client_owner' });
    });

    it('client_owner refused after completion (permission_denied)', async () => {
      await setupRow({ completedAt: new Date() });
      const id = await sug(await run('done'), 'Rival One');
      expect((await fails(save(ownerA1, { keywords: ['x'] }))).code).toBe('permission_denied');
      expect((await fails(pick(ownerA1, [id]))).code).toBe('permission_denied');
      expect((await fails(advance(ownerA1, 'confirm_competitors'))).code).toBe('permission_denied');
      expect((await fails(advance(ownerA1, 'start_search'))).code).toBe('permission_denied');
      const [c] = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1));
      expect(c!.keywords).toEqual([]);
      expect(await statuses()).toEqual({ [id]: 'suggested' });
      expect((await setupOf()).competitorsDoneAt).toBeNull();
    });

    it('client_owner refused once dismissed; staff still allowed', async () => {
      await setupRow({ dismissedAt: new Date() });
      expect((await fails(save(ownerA1, { keywords: ['x'] }))).code).toBe('permission_denied');
      await expect(save(admin, { keywords: ['heat pump'] })).resolves.toMatchObject({ state: { open: false } });
    });

    it('the in-transaction re-check refuses a client owner once the row closed (a concurrent completion wins)', async () => {
      await setupRow();
      const ownerCheck = (ctx: AccessContext) => withTenant(dbs.app, ctx, (tx) => closedSetupRecheck(ctx, IDS.clientA1)(tx));
      await expect(ownerCheck(ownerA1)).resolves.toBeUndefined();
      await dbs.owner.update(clientSetup).set({ completedAt: new Date() }).where(eq(clientSetup.clientId, IDS.clientA1));
      await expect(ownerCheck(ownerA1)).rejects.toMatchObject({ code: 'permission_denied' });
      await expect(ownerCheck(admin)).resolves.toBeUndefined();
      await expect(dbs.service.transaction((tx) => closedSetupRecheck(ownerA1, IDS.clientA1)(tx))).rejects.toMatchObject({ code: 'permission_denied' });
    });

    it('the in-transaction re-check refuses a client owner once their three steps are done (invite still todo)', async () => {
      await fillProfile();
      await setupRow({ skipped: ['search'] });
      const ownerCheck = () => withTenant(dbs.app, ownerA1, (tx) => closedSetupRecheck(ownerA1, IDS.clientA1)(tx));
      await expect(ownerCheck()).resolves.toBeUndefined();
      await dbs.owner.update(clientSetup).set({ competitorsDoneAt: new Date() }).where(eq(clientSetup.clientId, IDS.clientA1));
      await expect(ownerCheck()).rejects.toMatchObject({ code: 'permission_denied' });
      await expect(withTenant(dbs.app, admin, (tx) => closedSetupRecheck(admin, IDS.clientA1)(tx))).resolves.toBeUndefined();
    });

    it('client owner sees setup closed once their three steps are done while invite/billing are still todo', async () => {
      await fillProfile();
      await dbs.owner.insert(agencyConnect).values({ agencyId: IDS.agencyA, stripeAccountId: 'acct_1', status: 'connected', chargesEnabled: true, detailsSubmitted: true });
      await setupRow({ skipped: ['search'] });
      await expect(get(ownerA1)).resolves.toMatchObject({ state: { open: true, clientOpen: true } });
      const out = await advance(ownerA1, 'confirm_competitors');
      expect(out.state).toMatchObject({ open: true, clientOpen: false, totalSteps: 5, steps: { competitors: 'done', invite: 'todo', billing: 'todo' }, waitingOn: 'agency' });
      expect((await setupOf()).completedAt).toBeNull();
      expect((await fails(get(ownerA1))).code).toBe('not_found');
      expect((await fails(save(ownerA1, { keywords: ['x'] }))).code).toBe('permission_denied');
      expect((await fails(advance(ownerA1, 'confirm_competitors'))).code).toBe('permission_denied');
      await expect(get(admin)).resolves.toMatchObject({ state: { open: true, clientOpen: false, steps: { invite: 'todo', billing: 'todo' } } });
    });

    it('client_viewer refused', async () => {
      await setupRow();
      // The registry hides `manage` tools from viewers (not_found, like an unknown tool).
      expect((await fails(save(viewerA1, { keywords: ['x'] }))).code).toBe('not_found');
      expect((await fails(advance(viewerA1, 'skip_search'))).code).toBe('not_found');
      expect((await fails(get(viewerA1))).code).toBe('not_found');
      expect((await setupOf()).skipped).toEqual([]);
    });

    it('other agency → not_found', async () => {
      await setupRow();
      const id = await sug(await run('done'), 'Rival One');
      expect((await fails(get(adminB))).code).toBe('not_found');
      expect((await fails(save(adminB, { keywords: ['x'] }))).code).toBe('not_found');
      expect((await fails(pick(adminB, [id]))).code).toBe('not_found');
      expect((await fails(pick(adminB, [], [id]))).code).toBe('not_found');
      expect((await fails(advance(adminB, 'skip_search'))).code).toBe('not_found');
      expect((await setupOf()).skipped).toEqual([]);
      expect(await statuses()).toEqual({ [id]: 'suggested' });
    });

    it('a client owner of another client → not_found', async () => {
      await setupRow();
      const other = mk('client_owner', [IDS.clientA2]);
      expect((await fails(get(other))).code).toBe('not_found');
      expect((await fails(advance(other, 'skip_search'))).code).toBe('not_found');
    });
  });

  describe('get_client_setup', () => {
    it('get_client_setup payload has none of overlap_score/signals/ad_matches/appearances/best_rank/upsell_tag', async () => {
      await setupRow({ suggestions: { status: 'ready', services: [{ value: 'ac_repair', quote: 'we fix ACs' }], keywords: [], sources: ['gbp'], generatedAt: new Date().toISOString() } });
      const r = await run('done');
      await sug(r, 'Rival One');
      // Internal run data that must never reach the payload (hidden names/reasons, cost, vendor error text).
      await dbs.owner.update(discoveryRun).set({
        hidden: { chain: 2 }, costUsd: 1.23, error: 'vendor said no',
        progress: { searchesDone: 9, searchesTotal: 9, checksDone: 5, checksTotal: 5, hiddenList: [{ name: 'Secret Chain', reason: 'chain' }] },
      }).where(eq(discoveryRun.id, r));
      for (const ctx of [admin, ownerA1]) {
        const out = await get(ctx);
        expect(out.competitorSuggestions).toHaveLength(1);
        const keys = new Set<string>();
        const json = JSON.stringify(out, (k, v: unknown) => { keys.add(k); return v; });
        for (const k of ['overlap_score', 'overlapScore', 'signals', 'ad_matches', 'adMatches', 'appearances', 'best_rank', 'bestRank', 'upsell_tag', 'upsellTag', 'hidden', 'hiddenList', 'costUsd', 'cost_usd', 'error']) expect(keys.has(k)).toBe(false);
        expect(json).not.toContain('Secret Chain');
        expect(json).not.toContain('vendor said no');
        expect(Object.keys(out.competitorSuggestions[0]!).sort()).toEqual(['distanceKm', 'id', 'name', 'preTicked', 'rating', 'status', 'tier', 'votes']);
        expect(Object.keys(out.search!).sort()).toEqual(['finishedAt', 'kept', 'progress', 'status']);
        expect(Object.keys(out.search!.progress).sort()).toEqual(['checksDone', 'checksTotal', 'searchesDone', 'searchesTotal']);
      }
    });

    it('get_client_setup includes search progress while a run is running', async () => {
      await setupRow();
      const r = await run('checking');
      await dbs.owner.update(discoveryRun).set({ progress: { searchesDone: 9, searchesTotal: 9, checksDone: 2 } }).where(eq(discoveryRun.id, r));
      for (const ctx of [admin, ownerA1]) {
        const out = await get(ctx);
        expect(out.search).toEqual({ status: 'checking', progress: { searchesDone: 9, searchesTotal: 9, checksDone: 2, checksTotal: 0 }, kept: null, finishedAt: null });
        expect(out.state.steps.search).toBe('running');
      }
    });

    it('search is null without a run', async () => {
      await setupRow();
      expect((await get(ownerA1)).search).toBeNull();
    });

    it('returns state, lookup, suggestions and the vertical services + seed keywords', async () => {
      await setupRow();
      const out = await get(admin);
      expect(out.state).toMatchObject({ open: true, exists: true });
      expect(out.lookup).toBeNull();
      expect(out.suggestions).toEqual({ status: 'none' });
      expect(out.vertical.seedKeywords).toEqual(['hvac contractor', 'ac repair', 'plumber']);
      expect(out.vertical.services.length).toBeGreaterThan(5);
      expect(Object.keys(out.vertical.services[0]!).sort()).toEqual(['id', 'name']);
    });

    it('get_client_setup returns the pack name', async () => {
      await setupRow();
      const out = await get(admin);
      expect(out.vertical.name).toBe('HVAC & Plumbing');
    });

    it('get_client_setup not_found for client role once closed; staff still read it', async () => {
      await setupRow({ completedAt: new Date() });
      expect((await fails(get(ownerA1))).code).toBe('not_found');
      await expect(get(admin)).resolves.toMatchObject({ state: { open: false } });
    });

    it('get_client_setup reports the invited owner: name and email for staff only', async () => {
      await setupRow();
      expect((await get(admin)).invite).toEqual({ status: 'none', name: null, email: null });
      const [c] = await dbs.owner.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'olive@x.co', name: 'Olive', active: false }).returning();
      await dbs.owner.update(clientSetup).set({ invitedContactId: c!.id }).where(eq(clientSetup.clientId, IDS.clientA1));
      await dbs.owner.insert(invitation).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, email: 'olive@x.co', role: 'client_owner', invitedBy: 'x', expiresAt: new Date(Date.now() + 86_400_000) });
      const staff = await get(admin);
      expect(staff.invite).toEqual({ status: 'pending', name: 'Olive', email: 'olive@x.co' });
      expect(staff.state.steps.invite).toBe('done');
      expect((await get(ownerA1)).invite).toEqual({ status: 'pending', name: null, email: null });
    });

    it('get_client_setup not_found for client_viewer', async () => {
      await setupRow();
      expect((await fails(get(viewerA1))).code).toBe('not_found');
    });

    it('a client without a setup row: staff read it as complete, a client owner gets not_found', async () => {
      await expect(get(admin)).resolves.toMatchObject({ state: { exists: false, open: false }, suggestions: { status: 'none' } });
      expect((await fails(get(ownerA1))).code).toBe('not_found');
    });

    it('get_client_setup reports a stale pending suggestion as failed', async () => {
      await setupRow({ suggestions: { status: 'pending' }, createdAt: new Date(Date.now() - 16 * 60_000) });
      expect((await get(admin)).suggestions).toEqual({ status: 'failed' });
      expect((await setupOf()).suggestions).toEqual({ status: 'pending' }); // no DB write
      await dbs.owner.update(clientSetup).set({ createdAt: new Date(Date.now() - 5 * 60_000) });
      expect((await get(admin)).suggestions).toEqual({ status: 'pending' });
    });

    it('reportedSuggestions: only pending older than 15 minutes turns failed', () => {
      const now = new Date('2026-10-16T12:00:00Z');
      const at = (min: number) => new Date(now.getTime() - min * 60_000);
      expect(reportedSuggestions({ status: 'pending' }, at(15.01), now)).toEqual({ status: 'failed' });
      expect(reportedSuggestions({ status: 'pending' }, at(15), now)).toEqual({ status: 'pending' });
      expect(reportedSuggestions({ status: 'none' }, at(60), now)).toEqual({ status: 'none' });
      const ready = { status: 'ready' as const, services: [], keywords: [], sources: [], generatedAt: now.toISOString() };
      expect(reportedSuggestions(ready, at(60), now)).toBe(ready);
    });

    it('lists suggested and accepted rows of the latest done run, never dismissed or older-run rows', async () => {
      await setupRow();
      await sug(await run('done', { finishedAt: new Date(Date.now() - 3 * 86_400_000) }), 'Old Run Rival');
      const r = await run('done');
      const kept = await sug(r, 'Kept', { tier: 'watch' });
      const taken = await sug(r, 'Taken', { status: 'accepted' });
      await sug(r, 'Gone', { status: 'dismissed' });
      const out = await get(admin);
      expect(out.competitorSuggestions.map((s) => [s.id, s.status])).toEqual([[taken, 'accepted'], [kept, 'suggested']]);
      expect(out.competitorSuggestions.every((s) => !s.preTicked || s.status === 'suggested')).toBe(true);
    });

    it('preTicked respects the competitor limit room', async () => {
      await setupRow();
      await dbs.owner.update(client).set({ competitorLimit: 3 }).where(eq(client.id, IDS.clientA1)); // tracks X already → room 2
      const r = await run('done');
      const weak = await sug(r, 'Top Weak', { overlap: 0.6 });
      const strong = await sug(r, 'Top Strong', { overlap: 0.9 });
      const mid = await sug(r, 'Top Mid', { overlap: 0.7 });
      const watch = await sug(r, 'Watch', { tier: 'watch', overlap: 0.95 });
      const out = await get(admin);
      expect(out.competitorSuggestions.filter((s) => s.preTicked).map((s) => s.id)).toEqual([strong, mid]);
      expect(out.competitorSuggestions.map((s) => s.id)).toEqual([strong, mid, weak, watch]);
    });
  });

  describe('save_setup_profile', () => {
    it('profile save while a search is running starts no second search', async () => {
      await setupRow();
      await run('searching');
      const out = await save(ownerA1, PROFILE);
      expect(out.searchRefusal).toBeNull();
      expect(await runs()).toHaveLength(1);
      expect(wizEnqueue.mock.calls.filter((c) => c[0] === 'rival-search')).toHaveLength(0);
      expect(out.state.steps).toMatchObject({ profile: 'done', search: 'running' });
    });

    it('completing the profile starts the first auto search', async () => {
      await setupRow();
      const out = await save(ownerA1, PROFILE);
      expect(out.searchRefusal).toBeNull();
      expect((await runs()).map((x) => x.trigger)).toEqual(['auto']);
      expect(out.state.steps.search).toBe('running');
    });

    it('save_setup_profile returns searchRefusal when the auto start is refused', async () => {
      await setupRow();
      await dbs.owner.update(client).set({ pausedAt: new Date() }).where(eq(client.id, IDS.clientA1));
      const out = await save(admin, PROFILE);
      expect(out.searchRefusal).toBe('This client is paused. Resume it to search for competitors.');
      expect(out.state.steps).toMatchObject({ profile: 'done', search: 'todo' });
    });

    it('never changes name or features (not part of the input)', async () => {
      await setupRow();
      await save(ownerA1, { name: 'Hijacked', features: ['dashboard'], keywords: ['ok'] });
      const [c] = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1));
      expect(c!.name).toBe('A1 HVAC');
      expect(c!.features).toEqual([]);
      expect(c!.keywords).toEqual(['ok']);
    });

    it('a service-area centre/radius change enqueues rank-map-refresh; a keyword-only save does not', async () => {
      await setupRow();
      await save(ownerA1, { keywords: ['furnace repair'] });
      expect(wizEnqueue).not.toHaveBeenCalledWith('rank-map-refresh', expect.anything(), expect.anything());
      await save(ownerA1, { serviceArea: AREA });
      expect(wizEnqueue).toHaveBeenCalledWith('rank-map-refresh', { clientId: IDS.clientA1 }, `rank-map:${IDS.clientA1}`);
    });

    it('rejects a radius outside 2-40 km (ServiceAreaWrite)', async () => {
      await setupRow();
      expect((await fails(save(ownerA1, { serviceArea: { ...AREA, radiusKm: 41 } }))).code).toBe('invalid_input');
      expect((await fails(save(ownerA1, { serviceArea: { ...AREA, radiusKm: 1 } }))).code).toBe('invalid_input');
    });

    it('a profile save that completes the last open step sets completed_at', async () => {
      await setupRow({ skipped: ['search', 'competitors', 'invite'] });
      const out = await save(admin, PROFILE);
      expect(out.state.open).toBe(false);
      expect((await setupOf()).completedAt).toBeInstanceOf(Date);
    });
  });

  describe('pick_setup_competitors', () => {
    it('client owner can pick competitors without manage_competitors while open', async () => {
      await setupRow();
      const r = await run('done');
      const a = await sug(r, 'Pick Me');
      const d = await sug(r, 'Not Me');
      const out = await pick(ownerA1, [a], [d]);
      expect(out.state.open).toBe(true);
      expect(await statuses()).toEqual({ [a]: 'accepted', [d]: 'dismissed' });
      expect(await dbs.owner.select().from(clientCompetitor).where(eq(clientCompetitor.clientId, IDS.clientA1))).toHaveLength(2);
      // Outside the wizard the same owner still needs the flag.
      const e = await sug(r, 'Elsewhere');
      expect((await fails(wiz().invoke(ownerA1, 'accept_competitor_suggestion', { suggestionId: e }))).code).toBe('not_found');
    });

    it('ids of another client are ignored/refused', async () => {
      await setupRow();
      const mine = await sug(await run('done'), 'Mine');
      const theirs = await sug(await run('done', { clientId: IDS.clientA2 }), 'Theirs', { clientId: IDS.clientA2 });
      expect((await fails(pick(admin, [mine, theirs]))).code).toBe('not_found'); // accept is all-or-nothing
      await pick(admin, [], [theirs]); // dismiss filters by client: ignored
      expect(await statuses()).toEqual({ [mine]: 'suggested', [theirs]: 'suggested' });
    });

    it('pick re-submitting an accepted id succeeds', async () => {
      await setupRow();
      const r = await run('done');
      const a = await sug(r, 'Pick Me');
      const b = await sug(r, 'Me Too');
      await pick(ownerA1, [a]);
      await expect(pick(ownerA1, [a, b])).resolves.toMatchObject({ state: { open: true } });
      await expect(pick(ownerA1, [a, b])).resolves.toMatchObject({ state: { open: true } });
      expect(await statuses()).toEqual({ [a]: 'accepted', [b]: 'accepted' });
    });

    it('refuses an id in both lists', async () => {
      await setupRow();
      const a = await sug(await run('done'), 'Both');
      expect((await fails(pick(admin, [a], [a]))).code).toBe('invalid_input');
    });
  });

  describe('advance_client_setup', () => {
    it('dismiss refused for client_owner', async () => {
      await setupRow();
      expect((await fails(advance(ownerA1, 'dismiss'))).code).toBe('permission_denied');
      expect((await setupOf()).dismissedAt).toBeNull();
      const out = await advance(admin, 'dismiss');
      expect(out.state.open).toBe(false);
      expect((await setupOf()).dismissedAt).toBeInstanceOf(Date);
    });

    it('skip_invite/skip_billing refused for client roles', async () => {
      await setupRow();
      for (const action of ['skip_invite', 'skip_billing']) expect((await fails(advance(ownerA1, action))).code).toBe('permission_denied');
      expect((await setupOf()).skipped).toEqual([]);
      await advance(admin, 'skip_invite');
      await advance(mk('account_manager', [IDS.clientA1]), 'skip_billing');
      expect([...(await setupOf()).skipped].sort()).toEqual(['billing', 'invite']);
    });

    it('skip_billing is refused for a prospect (no billing step); skip_invite is allowed', async () => {
      await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA1));
      await setupRow();
      expect((await fails(advance(admin, 'skip_billing'))).code).toBe('invalid_input');
      const out = await advance(admin, 'skip_invite');
      expect(out.state).toMatchObject({ totalSteps: 4, steps: { invite: 'skipped' } });
      expect(out.state.steps.billing).toBeUndefined();
    });

    it('confirm twice keeps the first competitors_done_at', async () => {
      await setupRow();
      await advance(admin, 'confirm_competitors');
      const first = (await setupOf()).competitorsDoneAt;
      expect(first).toBeInstanceOf(Date);
      await advance(admin, 'confirm_competitors');
      await advance(admin, 'skip_competitors');
      const row = await setupOf();
      expect(row.competitorsDoneAt).toEqual(first);
      expect(row).toMatchObject({ lastChangedBy: 'u-agency_admin', lastChangedRole: 'agency_admin' });
    });

    it('staff and owner confirming at once set competitors_done_at and completed_at once', async () => {
      await fillProfile();
      await setupRow({ skipped: ['search', 'invite'] });
      const results = await Promise.allSettled([advance(admin, 'confirm_competitors'), advance(ownerA1, 'confirm_competitors')]);
      expect(results[0]!.status).toBe('fulfilled');
      const row = await setupOf();
      expect(row.completedAt).toBeInstanceOf(Date);
      expect(row.competitorsDoneAt!.getTime()).toBeLessThanOrEqual(row.completedAt!.getTime());
    });

    it('completed_at set once all steps done/skipped', async () => {
      await fillProfile();
      await setupRow();
      await advance(ownerA1, 'skip_search');
      expect((await setupOf()).completedAt).toBeNull();
      // Done picking no longer closes the setup: the invite step is next (billing reads skipped without Connect).
      const picked = await advance(ownerA1, 'skip_competitors');
      expect(picked.state).toMatchObject({ open: true, clientOpen: false, steps: { profile: 'done', search: 'skipped', competitors: 'skipped', invite: 'todo', billing: 'skipped' } });
      expect((await setupOf()).completedAt).toBeNull();
      const out = await advance(admin, 'skip_invite');
      expect(out.state).toMatchObject({ open: false, steps: { invite: 'skipped' } });
      const row = await setupOf();
      expect([...row.skipped].sort()).toEqual(['competitors', 'invite', 'search']);
      const at = row.completedAt;
      expect(at).toBeInstanceOf(Date);
      await advance(admin, 'confirm_competitors');
      expect((await setupOf()).completedAt).toEqual(at);
    });

    it('a dismissed setup is never completed afterwards', async () => {
      await fillProfile();
      await setupRow({ skipped: ['search'], dismissedAt: new Date() });
      await advance(admin, 'confirm_competitors');
      expect((await setupOf()).completedAt).toBeNull();
    });

    it('start_search starts an auto run when search is todo', async () => {
      await fillProfile();
      await setupRow();
      const out = await advance(ownerA1, 'start_search');
      expect(out.searchRefusal).toBeNull();
      expect((await runs()).map((x) => x.trigger)).toEqual(['auto']);
      expect(wizEnqueue).toHaveBeenCalledWith('rival-search', expect.anything(), `rival:${IDS.clientA1}`);
      expect(out.state.steps.search).toBe('running');
      expect(await setupOf()).toMatchObject({ lastChangedRole: 'client_owner' });
    });

    it('start_search returns searchRefusal (cooldown) without throwing', async () => {
      await fillProfile();
      await setupRow();
      await run('failed', { finishedAt: new Date(Date.now() - 60_000) });
      const out = await advance(admin, 'start_search');
      expect(out.searchRefusal).toBe('A search just finished — its suggestions are below. You can search again in a few minutes.');
      expect(await runs()).toHaveLength(1);
      expect(out.state.steps.search).toBe('blocked');
    });

    it('start_search ignores the manual weekly limit', async () => {
      await fillProfile();
      await setupRow();
      await run('failed', { trigger: 'manual', finishedAt: new Date(Date.now() - 3_600_000) });
      const out = await advance(admin, 'start_search');
      expect(out.searchRefusal).toBeNull();
      expect(await runs()).toHaveLength(2);
    });

    it('start_search refused (invalid_input) while a run is running/done', async () => {
      await fillProfile();
      await setupRow();
      await run('searching');
      expect((await fails(advance(admin, 'start_search'))).code).toBe('invalid_input');
      await dbs.owner.update(discoveryRun).set({ status: 'done', finishedAt: new Date(Date.now() - 3_600_000) });
      expect((await fails(advance(admin, 'start_search'))).code).toBe('invalid_input');
      expect(await runs()).toHaveLength(1);
    });

    it('start_search with an incomplete profile returns the missing-profile copy', async () => {
      await setupRow();
      const out = await advance(admin, 'start_search');
      expect(out.searchRefusal).toBe('Add keywords, a service area and the Google place id to the client profile first');
      expect(await runs()).toHaveLength(0);
    });

    it('refuses a client without a setup row (not_found)', async () => {
      expect((await fails(advance(admin, 'skip_search'))).code).toBe('not_found');
    });
  });
});

describe('send_competitor_review', () => {
  const D = 86_400_000;
  const withDelivery = () =>
    createToolRegistry(
      { app: dbs.app, service: dbs.service, delivery: { appUrl: 'https://app.test', linkSecrets: ['s'.repeat(40)], fromAddress: 'b@app.test' } },
      { audit: { record: async () => {} } },
    );
  async function seedInvited() {
    await dbs.owner.insert(clientSetup).values({ clientId: IDS.clientA1, agencyId: IDS.agencyA });
    const [c] = await dbs.owner.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'o@x.co', active: false }).returning();
    await dbs.owner.update(clientSetup).set({ invitedContactId: c!.id, competitorsDoneAt: new Date() }).where(eq(clientSetup.clientId, IDS.clientA1));
    await dbs.owner.insert(invitation).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, email: 'o@x.co', role: 'client_owner', invitedBy: 'x', expiresAt: new Date(Date.now() + 5 * D) });
    const [r] = await dbs.owner.insert(discoveryRun).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done', trigger: 'auto' }).returning();
    await dbs.owner.insert(competitorSuggestion).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, name: 'Rival', placeId: 'rp', appearances: 1, overlapScore: 1, runId: r!.id, tier: 'top' });
  }

  it('refuses when delivery is not configured', async () => {
    expect((await fails(registry.invoke(admin, 'send_competitor_review', { clientId: IDS.clientA1 }))).code).toBe('invalid_input');
  });

  it('queues once per day, ignoring the competitors step', async () => {
    await seedInvited();
    const r = withDelivery();
    expect(await r.invoke(admin, 'send_competitor_review', { clientId: IDS.clientA1 })).toEqual({ queued: true });
    expect(await r.invoke(admin, 'send_competitor_review', { clientId: IDS.clientA1 })).toEqual({ queued: false });
  });

  it('refuses client roles (404) and clients outside the account manager scope', async () => {
    await seedInvited();
    const r = withDelivery();
    expect((await fails(r.invoke(mk('client_owner', [IDS.clientA1]), 'send_competitor_review', { clientId: IDS.clientA1 }))).code).toBe('not_found');
    expect((await fails(r.invoke(mk('account_manager', [IDS.clientA2]), 'send_competitor_review', { clientId: IDS.clientA1 }))).code).toBe('not_found');
  });
});
