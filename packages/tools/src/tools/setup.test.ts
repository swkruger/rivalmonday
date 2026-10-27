import type { MapsPlace } from '@cs/collectors';
import { type AccessContext, type CallScope, createAccessContext } from '@cs/core';
import { businessArea, client, clientCompetitor, clientSetup, competitorSuggestion, contact, discoveryRun, invitation, notification, vendorCall, withTenant } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnqueueJob } from '../deps';
import { FIND_BUSINESS_DAILY_CAP } from '../setup/lookup';
import type { SetupState } from '../setup/state';
import { createToolRegistry } from '../registry';
import { catalogOf } from '../catalog/access';
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
/** Step 1 done: a phone and an owner contact (A1 already has a name). */
const fillDetails = async () => {
  await dbs.owner.update(client).set({ phone: '817-555-0100' }).where(eq(client.id, IDS.clientA1));
  await dbs.owner.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'pat@x.co', name: 'Pat Owner', active: false });
};
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
    const ASKED = { ownerPickRequestedAt: new Date() };

    it('owner may pick only while waiting_owner', async () => {
      await fillProfile();
      await fillDetails();
      await setupRow();
      const r = await run('done');
      const a = await sug(r, 'Pick Me');
      // Not asked yet: the setup is open for staff, but the owner is refused (scope refusal, P13).
      expect((await fails(pick(ownerA1, [a]))).code).toBe('not_found');
      expect((await fails(advance(ownerA1, 'confirm_competitors'))).code).toBe('not_found');
      expect((await fails(get(ownerA1))).code).toBe('not_found');
      expect(await statuses()).toEqual({ [a]: 'suggested' });
      await advance(admin, 'ask_owner');
      await expect(get(ownerA1)).resolves.toMatchObject({ state: { competitors: 'waiting_owner' } });
      await pick(ownerA1, [a]);
      expect(await statuses()).toEqual({ [a]: 'accepted' });
      const out = await advance(ownerA1, 'confirm_competitors');
      expect(out.state.competitors).toBe('done');
      expect(await setupOf()).toMatchObject({ lastChangedRole: 'client_owner' });
      expect((await setupOf()).competitorsDoneAt).toBeInstanceOf(Date);
    });

    it('owner gets not_found on save_setup_profile', async () => {
      await setupRow(ASKED);
      expect((await fails(save(ownerA1, { keywords: ['furnace repair'] }))).code).toBe('not_found');
      await dbs.owner.update(clientSetup).set({ ownerPickRequestedAt: null });
      expect((await fails(save(ownerA1, { keywords: ['furnace repair'] }))).code).toBe('not_found');
      const [c] = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1));
      expect(c!.keywords).toEqual([]);
      expect((await setupOf()).lastChangedBy).toBeNull();
    });

    it('owner gets not_found for every other advance action, even while waiting_owner', async () => {
      await fillProfile();
      await setupRow(ASKED);
      for (const action of ['start_search', 'skip_search', 'skip_competitors', 'skip_invite', 'skip_billing', 'dismiss', 'ask_owner']) {
        expect((await fails(advance(ownerA1, action))).code, action).toBe('not_found');
      }
      const row = await setupOf();
      expect(row).toMatchObject({ skipped: [], dismissedAt: null, competitorsDoneAt: null, lastChangedBy: null });
      expect(await runs()).toHaveLength(0);
    });

    it('owner gets not_found after competitors done', async () => {
      await setupRow({ ...ASKED, competitorsDoneAt: new Date() });
      const id = await sug(await run('done'), 'Rival One');
      expect((await fails(get(ownerA1))).code).toBe('not_found');
      expect((await fails(pick(ownerA1, [id]))).code).toBe('not_found');
      expect((await fails(pick(ownerA1, [], [id]))).code).toBe('not_found');
      expect((await fails(advance(ownerA1, 'confirm_competitors'))).code).toBe('not_found');
      expect(await statuses()).toEqual({ [id]: 'suggested' });
    });

    it('a dismissed or completed setup keeps the owner window while asked; staff are never refused', async () => {
      await setupRow({ ...ASKED, completedAt: new Date(), dismissedAt: new Date() });
      await expect(get(ownerA1)).resolves.toMatchObject({ state: { open: false, competitors: 'waiting_owner' } });
      await expect(save(admin, { keywords: ['heat pump'] })).resolves.toMatchObject({ state: { open: false } });
    });

    it('the in-transaction re-check refuses a client owner once competitors are done (a concurrent confirm wins)', async () => {
      await setupRow(ASKED);
      const ownerCheck = (ctx: AccessContext) => withTenant(dbs.app, ctx, (tx) => closedSetupRecheck(ctx, IDS.clientA1)(tx));
      await expect(ownerCheck(ownerA1)).resolves.toBeUndefined();
      await dbs.owner.update(clientSetup).set({ competitorsDoneAt: new Date() }).where(eq(clientSetup.clientId, IDS.clientA1));
      await expect(ownerCheck(ownerA1)).rejects.toMatchObject({ code: 'not_found' });
      await expect(ownerCheck(admin)).resolves.toBeUndefined();
      await expect(dbs.service.transaction((tx) => closedSetupRecheck(ownerA1, IDS.clientA1)(tx))).rejects.toMatchObject({ code: 'not_found' });
    });

    it('the in-transaction re-check refuses a client owner who was never asked', async () => {
      await setupRow();
      await expect(withTenant(dbs.app, ownerA1, (tx) => closedSetupRecheck(ownerA1, IDS.clientA1)(tx))).rejects.toMatchObject({ code: 'not_found' });
      await expect(withTenant(dbs.app, admin, (tx) => closedSetupRecheck(admin, IDS.clientA1)(tx))).resolves.toBeUndefined();
    });

    it('client_viewer refused', async () => {
      await setupRow(ASKED);
      const id = await sug(await run('done'), 'Rival One');
      // The registry hides `manage` tools from viewers (not_found, like an unknown tool).
      expect((await fails(save(viewerA1, { keywords: ['x'] }))).code).toBe('not_found');
      expect((await fails(advance(viewerA1, 'confirm_competitors'))).code).toBe('not_found');
      expect((await fails(pick(viewerA1, [id]))).code).toBe('not_found');
      expect((await fails(get(viewerA1))).code).toBe('not_found');
      expect((await setupOf()).competitorsDoneAt).toBeNull();
      expect(await statuses()).toEqual({ [id]: 'suggested' });
    });

    it('other agency → not_found', async () => {
      await setupRow();
      const id = await sug(await run('done'), 'Rival One');
      expect((await fails(get(adminB))).code).toBe('not_found');
      expect((await fails(save(adminB, { keywords: ['x'] }))).code).toBe('not_found');
      expect((await fails(pick(adminB, [id]))).code).toBe('not_found');
      expect((await fails(pick(adminB, [], [id]))).code).toBe('not_found');
      expect((await fails(advance(adminB, 'skip_search'))).code).toBe('not_found');
      expect((await fails(advance(adminB, 'ask_owner'))).code).toBe('not_found');
      expect(await setupOf()).toMatchObject({ skipped: [], ownerPickRequestedAt: null });
      expect(await statuses()).toEqual({ [id]: 'suggested' });
    });

    it('another agency’s client owner never passes the owner window (cross-agency)', async () => {
      await setupRow(ASKED);
      const id = await sug(await run('done'), 'Rival One');
      // A client_owner of agency B naming A1 (even with A1 in a forged scope) is refused before any write.
      const ownerB = createAccessContext({ agencyId: IDS.agencyB, userId: 'u-owner-b', role: 'client_owner', clientScope: [IDS.clientA1], features: [] });
      expect((await fails(get(ownerB))).code).toBe('not_found');
      expect((await fails(pick(ownerB, [id]))).code).toBe('not_found');
      expect((await fails(advance(ownerB, 'confirm_competitors'))).code).toBe('not_found');
      expect((await setupOf()).competitorsDoneAt).toBeNull();
      expect(await statuses()).toEqual({ [id]: 'suggested' });
    });

    it('a client owner of another client → not_found', async () => {
      await setupRow(ASKED);
      const other = mk('client_owner', [IDS.clientA2]);
      expect((await fails(get(other))).code).toBe('not_found');
      expect((await fails(advance(other, 'confirm_competitors'))).code).toBe('not_found');
      expect((await setupOf()).competitorsDoneAt).toBeNull();
    });
  });

  describe('get_client_setup', () => {
    it('get_client_setup payload has none of overlap_score/signals/ad_matches/appearances/best_rank/upsell_tag', async () => {
      await setupRow({ ownerPickRequestedAt: new Date(), suggestions: { status: 'ready', services: [{ value: 'ac_repair', quote: 'we fix ACs' }], keywords: [], newAreas: [], sources: ['gbp'], generatedAt: new Date().toISOString() } });
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
      await setupRow({ ownerPickRequestedAt: new Date() });
      const r = await run('checking');
      await dbs.owner.update(discoveryRun).set({ progress: { searchesDone: 9, searchesTotal: 9, checksDone: 2 } }).where(eq(discoveryRun.id, r));
      for (const ctx of [admin, ownerA1]) {
        const out = await get(ctx);
        expect(out.search).toEqual({ status: 'checking', progress: { searchesDone: 9, searchesTotal: 9, checksDone: 2, checksTotal: 0 }, kept: null, finishedAt: null });
        expect(out.state.competitors).toBe('waiting_owner'); // asked: the pick waits on the owner, search running or not
      }
    });

    it('search is null without a run', async () => {
      await setupRow({ ownerPickRequestedAt: new Date() });
      expect((await get(ownerA1)).search).toBeNull();
    });

    it('returns state, lookup, suggestions and the vertical services + seed keywords', async () => {
      await setupRow();
      const out = await get(admin);
      expect(out.state).toMatchObject({ open: true, exists: true, totalSteps: 6, needsLocation: true });
      expect(out.state).not.toHaveProperty('clientOpen');
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

    it('get_client_setup not_found for the owner unless asked to pick; staff still read a closed setup', async () => {
      await setupRow({ completedAt: new Date() });
      expect((await fails(get(ownerA1))).code).toBe('not_found');
      await expect(get(admin)).resolves.toMatchObject({ state: { open: false } });
      await dbs.owner.update(clientSetup).set({ completedAt: null });
      expect((await fails(get(ownerA1))).code).toBe('not_found'); // open for staff, never asked
    });

    it('get_client_setup reports the invited owner: name and email for staff only', async () => {
      await setupRow({ ownerPickRequestedAt: new Date() });
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
      const ready = { status: 'ready' as const, services: [], keywords: [], newAreas: [], sources: [], generatedAt: now.toISOString() };
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
    it('profile save during running search does not enqueue', async () => {
      await setupRow();
      await run('searching');
      const out = await save(admin, PROFILE);
      expect(out.searchRefusal).toBeNull();
      expect(await runs()).toHaveLength(1);
      expect(wizEnqueue.mock.calls.filter((c) => c[0] === 'rival-search')).toHaveLength(0);
      expect(out.state.steps).toMatchObject({ profile: 'done', competitors: 'searching' });
      expect(out.state.competitors).toBe('searching');
    });

    it('completing the profile starts the first auto search', async () => {
      await setupRow();
      const out = await save(admin, PROFILE);
      expect(out.searchRefusal).toBeNull();
      expect((await runs()).map((x) => x.trigger)).toEqual(['auto']);
      expect(out.state.competitors).toBe('searching');
    });

    it('save_setup_profile returns searchRefusal when the auto start is refused', async () => {
      await setupRow();
      await dbs.owner.update(client).set({ pausedAt: new Date() }).where(eq(client.id, IDS.clientA1));
      const out = await save(admin, PROFILE);
      expect(out.searchRefusal).toBe('This client is paused. Resume it to search for competitors.');
      expect(out.state.steps).toMatchObject({ profile: 'done', competitors: 'todo' });
    });

    describe('newAreas (14a)', () => {
      const areasOf = () => dbs.owner.select().from(businessArea).where(eq(businessArea.verticalId, 'hvac_plumbing'));
      const servicesOf = async () => (await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1)))[0]!.services;
      const offered = (...names: string[]) => setupRow({ suggestions: { status: 'ready', services: [], keywords: [], newAreas: names.map((name) => ({ name, quote: name })), sources: ['gbp'], generatedAt: new Date().toISOString() } });
      beforeEach(() => catalogOf({ app: dbs.app, service: dbs.service }).invalidate());

      it('creates each ticked new area (unreviewed, the client agency) and adds its id to the client services', async () => {
        await offered('Duct Sealing Specials');
        await save(admin, { services: ['ac_repair'], newAreas: [{ name: 'Duct Sealing Specials' }] });
        const made = (await areasOf()).find((a) => a.name === 'Duct Sealing Specials');
        expect(made).toMatchObject({ status: 'unreviewed', createdByAgencyId: IDS.agencyA });
        expect(await servicesOf()).toEqual(['ac_repair', made!.id]);
      });

      it('takes the catalogue lock before the client row lock (lock order: catalogue -> vertical -> client)', async () => {
        await offered('Duct Sealing Specials');
        let saving: Promise<unknown> = Promise.resolve();
        await dbs.owner.transaction(async (tx) => {
          await tx.execute(sql`select pg_advisory_xact_lock(1401400001)`);
          saving = save(admin, { newAreas: [{ name: 'Duct Sealing Specials' }] });
          await new Promise((r) => setTimeout(r, 600));
          // While a merge-like transaction holds the catalogue lock, the save must not yet hold the client row.
          await expect(dbs.owner.transaction((t2) => t2.execute(sql`select 1 from client where id = ${IDS.clientA1} for update nowait`))).resolves.toBeDefined();
        });
        await saving;
        expect((await areasOf()).some((a) => a.name === 'Duct Sealing Specials')).toBe(true);
      });

      it('is idempotent: saving the same new area twice creates one area and one service entry', async () => {
        await offered('Duct Sealing Specials');
        await save(admin, { newAreas: [{ name: 'Duct Sealing Specials' }] });
        await save(admin, { newAreas: [{ name: 'duct sealing specials' }] });
        expect((await areasOf()).filter((a) => a.name.toLowerCase() === 'duct sealing specials')).toHaveLength(1);
        expect(await servicesOf()).toHaveLength(1);
      });

      it('a client owner cannot tick a suggested chip (owners never edit the profile in setup)', async () => {
        await offered('Duct Sealing Specials');
        await dbs.owner.update(clientSetup).set({ ownerPickRequestedAt: new Date() });
        expect((await fails(save(ownerA1, { newAreas: [{ name: 'Duct Sealing Specials' }] }))).code).toBe('not_found');
        expect((await areasOf()).some((a) => a.name === 'Duct Sealing Specials')).toBe(false);
      });

      it('refuses a name that is not in the stored suggestions (no free text), creating nothing', async () => {
        await offered('Duct Sealing Specials');
        const before = (await areasOf()).length;
        const e = await fails(save(admin, { newAreas: [{ name: 'Something I typed' }] }));
        expect(e).toMatchObject({ code: 'invalid_input', message: 'Pick new services from the suggestions.', userFacing: true });
        expect((await areasOf()).length).toBe(before);
      });

      it('refuses when there are no ready suggestions at all', async () => {
        await setupRow();
        expect((await fails(save(admin, { newAreas: [{ name: 'Duct Sealing Specials' }] }))).code).toBe('invalid_input');
      });

      it.each(['Call 817-555-0100', 'Visit acme-plumbing.com', 'A1 HVAC Specials'])('refuses an offered name carrying client data: %s', async (name) => {
        await offered(name);
        const e = await fails(save(admin, { newAreas: [{ name }] }));
        expect(e).toMatchObject({ code: 'invalid_input', userFacing: true });
        expect(e.message).toMatch(/cannot include/);
      });

      it('rejects more than 5 new areas', async () => {
        await setupRow();
        const e = await fails(save(admin, { newAreas: Array.from({ length: 6 }, (_, i) => ({ name: `Extra area ${i}` })) }));
        expect(e.code).toBe('invalid_input');
      });
    });

    it('never changes name or features (not part of the input)', async () => {
      await setupRow();
      await save(admin, { name: 'Hijacked', features: ['dashboard'], keywords: ['ok'] });
      const [c] = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1));
      expect(c!.name).toBe('A1 HVAC');
      expect(c!.features).toEqual([]);
      expect(c!.keywords).toEqual(['ok']);
    });

    it('a service-area centre/radius change enqueues rank-map-refresh; a keyword-only save does not', async () => {
      await setupRow();
      await save(admin, { keywords: ['furnace repair'] });
      expect(wizEnqueue).not.toHaveBeenCalledWith('rank-map-refresh', expect.anything(), expect.anything());
      await save(admin, { serviceArea: AREA });
      expect(wizEnqueue).toHaveBeenCalledWith('rank-map-refresh', { clientId: IDS.clientA1 }, `rank-map:${IDS.clientA1}`);
    });

    it('rejects a radius outside 2-40 km (ServiceAreaWrite)', async () => {
      await setupRow();
      expect((await fails(save(admin, { serviceArea: { ...AREA, radiusKm: 41 } }))).code).toBe('invalid_input');
      expect((await fails(save(admin, { serviceArea: { ...AREA, radiusKm: 1 } }))).code).toBe('invalid_input');
    });

    it('a profile save that completes the last open step sets completed_at', async () => {
      await fillDetails();
      await setupRow({ skipped: ['search', 'competitors', 'invite'] });
      const out = await save(admin, PROFILE);
      expect(out.state.open).toBe(false);
      expect((await setupOf()).completedAt).toBeInstanceOf(Date);
    });
  });

  describe('pick_setup_competitors', () => {
    it('client owner can pick competitors without manage_competitors while waiting_owner', async () => {
      await setupRow({ ownerPickRequestedAt: new Date() });
      const r = await run('done');
      const a = await sug(r, 'Pick Me');
      const d = await sug(r, 'Not Me');
      const out = await pick(ownerA1, [a], [d]);
      expect(out.state).toMatchObject({ open: true, competitors: 'waiting_owner' });
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
      await setupRow({ ownerPickRequestedAt: new Date() });
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
      await setupRow({ ownerPickRequestedAt: new Date() });
      expect((await fails(advance(ownerA1, 'dismiss'))).code).toBe('not_found');
      expect((await setupOf()).dismissedAt).toBeNull();
      const out = await advance(admin, 'dismiss');
      expect(out.state.open).toBe(false);
      expect((await setupOf()).dismissedAt).toBeInstanceOf(Date);
    });

    it('skip_invite/skip_billing refused for client roles', async () => {
      await setupRow();
      for (const action of ['skip_invite', 'skip_billing']) expect((await fails(advance(ownerA1, action))).code).toBe('not_found');
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
      expect(out.state).toMatchObject({ totalSteps: 5, steps: { invite: 'skipped' } });
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

    it('enqueues runbook-tailor once, after the first competitors close; an enqueue failure does not fail the step', async () => {
      await setupRow();
      wizEnqueue.mockClear();
      await advance(admin, 'confirm_competitors');
      await advance(admin, 'confirm_competitors');
      await advance(admin, 'skip_competitors');
      const tailor = wizEnqueue.mock.calls.filter((c) => c[0] === 'runbook-tailor');
      expect(tailor).toEqual([['runbook-tailor', { clientId: IDS.clientA1 }, `runbook-tailor:${IDS.clientA1}`]]);

      await dbs.owner.update(clientSetup).set({ competitorsDoneAt: null, skipped: [] }).where(eq(clientSetup.clientId, IDS.clientA1));
      wizEnqueue.mockRejectedValueOnce(new Error('queue down'));
      const out = await advance(admin, 'confirm_competitors');
      expect(out.state.steps.competitors).toBe('done');
      expect((await setupOf()).competitorsDoneAt).toBeInstanceOf(Date);
    });

    it('staff and owner confirming at once set competitors_done_at and completed_at once', async () => {
      await fillProfile();
      await fillDetails();
      await setupRow({ skipped: ['search', 'invite'], ownerPickRequestedAt: new Date() });
      const results = await Promise.allSettled([advance(admin, 'confirm_competitors'), advance(ownerA1, 'confirm_competitors')]);
      expect(results[0]!.status).toBe('fulfilled');
      // The owner either confirmed first or lost the window to the staff confirm (not_found), never anything else.
      if (results[1]!.status === 'rejected') expect((results[1] as PromiseRejectedResult).reason).toMatchObject({ code: 'not_found' });
      const row = await setupOf();
      expect(row.completedAt).toBeInstanceOf(Date);
      expect(row.competitorsDoneAt!.getTime()).toBeLessThanOrEqual(row.completedAt!.getTime());
    });

    it('completed_at set once all steps done/skipped', async () => {
      await fillProfile();
      await fillDetails();
      await setupRow();
      await advance(admin, 'skip_search');
      expect((await setupOf()).completedAt).toBeNull();
      // Done picking no longer closes the setup: the invite step is next (billing reads skipped without Connect).
      const picked = await advance(admin, 'skip_competitors');
      expect(picked.state).toMatchObject({ open: true, steps: { details: 'done', lookup: 'done', profile: 'done', competitors: 'skipped', invite: 'todo', billing: 'skipped' } });
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
      const out = await advance(admin, 'start_search');
      expect(out.searchRefusal).toBeNull();
      expect((await runs()).map((x) => x.trigger)).toEqual(['auto']);
      expect(wizEnqueue).toHaveBeenCalledWith('rival-search', expect.anything(), `rival:${IDS.clientA1}`);
      expect(out.state.competitors).toBe('searching');
      expect(await setupOf()).toMatchObject({ lastChangedRole: 'agency_admin' });
    });

    it('start_search returns searchRefusal (cooldown) without throwing', async () => {
      await fillProfile();
      await setupRow();
      await run('failed', { finishedAt: new Date(Date.now() - 60_000) });
      const out = await advance(admin, 'start_search');
      expect(out.searchRefusal).toBe('A search just finished — its suggestions are below. You can search again in a few minutes.');
      expect(await runs()).toHaveLength(1);
      expect(out.state.competitors).toBe('blocked');
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
      expect(out.searchRefusal).toBe('Add keywords and a service area (a location) to the client profile first');
      expect(await runs()).toHaveLength(0);
    });

    it('ask_owner sets waiting_owner and completes setup for staff', async () => {
      await fillProfile();
      await fillDetails();
      await setupRow({ skipped: ['invite'] });
      await sug(await run('done'), 'Rival One');
      wizEnqueue.mockClear();
      const out = await advance(admin, 'ask_owner');
      // Every staff step is settled (invite skipped, billing skipped without Connect): the setup completes, the pick waits.
      expect(out.state).toMatchObject({ open: false, competitors: 'waiting_owner', steps: { competitors: 'waiting_owner' } });
      const row = await setupOf();
      expect(row.ownerPickRequestedAt).toBeInstanceOf(Date);
      expect(row.competitorsDoneAt).toBeNull();
      expect(row.completedAt).toBeInstanceOf(Date);
      expect(wizEnqueue.mock.calls.filter((c) => c[0] === 'runbook-tailor')).toHaveLength(0); // competitors are not closed yet
      // A second ask keeps the first request time; the owner's confirm then closes the step (and tailors the runbook once).
      const first = row.ownerPickRequestedAt;
      await advance(admin, 'ask_owner');
      expect((await setupOf()).ownerPickRequestedAt).toEqual(first);
      await advance(ownerA1, 'confirm_competitors');
      const after = await setupOf();
      expect(after.competitorsDoneAt).toBeInstanceOf(Date);
      expect(after.completedAt).toEqual(row.completedAt);
      expect(wizEnqueue.mock.calls.filter((c) => c[0] === 'runbook-tailor')).toHaveLength(1);
    });

    it('ask_owner is refused once competitors are done or skipped, and before the profile is complete', async () => {
      await setupRow();
      expect((await fails(advance(admin, 'ask_owner'))).code).toBe('invalid_input'); // no keywords / centre yet
      await fillProfile();
      await dbs.owner.update(clientSetup).set({ competitorsDoneAt: new Date() });
      expect((await fails(advance(admin, 'ask_owner'))).code).toBe('invalid_input');
      await dbs.owner.update(clientSetup).set({ competitorsDoneAt: null, skipped: ['competitors'] });
      expect((await fails(advance(admin, 'ask_owner'))).code).toBe('invalid_input');
      expect((await setupOf()).ownerPickRequestedAt).toBeNull();
    });

    it('invite cannot be skipped while waiting_owner', async () => {
      await fillProfile();
      await setupRow({ ownerPickRequestedAt: new Date() });
      const e = await fails(advance(admin, 'skip_invite'));
      expect(e).toMatchObject({ code: 'invalid_input', userFacing: true });
      expect((await setupOf()).skipped).toEqual([]);
      // Once the owner picked, the invite step may be skipped again.
      await dbs.owner.update(clientSetup).set({ competitorsDoneAt: new Date() });
      await advance(admin, 'skip_invite');
      expect((await setupOf()).skipped).toEqual(['invite']);
    });

    it('refuses a client without a setup row (not_found)', async () => {
      expect((await fails(advance(admin, 'skip_search'))).code).toBe('not_found');
    });
  });
});

describe('owner pick emails (P12)', () => {
  const D = 86_400_000;
  const reg = () =>
    createToolRegistry(
      { app: dbs.app, service: dbs.service, enqueue: wizEnqueue, delivery: { appUrl: 'https://app.test', linkSecrets: ['s'.repeat(40)], fromAddress: 'b@app.test' } },
      { audit: { record: async () => {} } },
    );
  const reviews = () => dbs.owner.select().from(notification).where(eq(notification.kind, 'competitor_review'));
  async function rivals() {
    const [r] = await dbs.owner.insert(discoveryRun).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done', trigger: 'auto', finishedAt: new Date() }).returning();
    await dbs.owner.insert(competitorSuggestion).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, name: 'Rival', placeId: 'rp', appearances: 1, overlapScore: 1, runId: r!.id, tier: 'top' });
  }

  it('ask_owner sends no email', async () => {
    await dbs.owner.update(client).set(PROFILE).where(eq(client.id, IDS.clientA1));
    await dbs.owner.insert(clientSetup).values({ clientId: IDS.clientA1, agencyId: IDS.agencyA });
    // Even with an invited owner and rivals to review, asking does not email (the invite step does).
    const [c] = await dbs.owner.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'o@x.co', active: false }).returning();
    await dbs.owner.update(clientSetup).set({ invitedContactId: c!.id });
    await dbs.owner.insert(invitation).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, email: 'o@x.co', role: 'client_owner', invitedBy: 'x', expiresAt: new Date(Date.now() + 5 * D) });
    await rivals();
    const before = (await dbs.owner.select().from(notification)).length;
    await reg().invoke(admin, 'advance_client_setup', { clientId: IDS.clientA1, action: 'ask_owner' });
    expect(await reviews()).toHaveLength(0);
    expect((await dbs.owner.select().from(notification)).length).toBe(before);
  });

  it('invite while waiting_owner queues the review email', async () => {
    await dbs.owner.update(client).set(PROFILE).where(eq(client.id, IDS.clientA1));
    await dbs.owner.insert(clientSetup).values({ clientId: IDS.clientA1, agencyId: IDS.agencyA, ownerPickRequestedAt: new Date() });
    await rivals();
    await reg().invoke(admin, 'invite_client_owner', { clientId: IDS.clientA1, name: 'Maria Lopez', email: 'maria@x.co' });
    const rows = await reviews();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ address: 'maria@x.co', dedupeKey: expect.stringMatching(new RegExp(`^competitor-review:${IDS.clientA1}:`)) });
    expect((rows[0]!.payload as { props: { reviewUrl: string } }).props.reviewUrl).toContain(encodeURIComponent(`/c/${IDS.clientA1}`));
    // The daily reminder uses the same dedupe: no second email.
    await reg().invoke(admin, 'invite_client_owner', { clientId: IDS.clientA1, name: 'Maria Lopez', email: 'maria@x.co' });
    expect(await reviews()).toHaveLength(1);
  });

  it('an invite after competitors are done sends no review email', async () => {
    await dbs.owner.update(client).set(PROFILE).where(eq(client.id, IDS.clientA1));
    await dbs.owner.insert(clientSetup).values({ clientId: IDS.clientA1, agencyId: IDS.agencyA, competitorsDoneAt: new Date() });
    await rivals();
    await reg().invoke(admin, 'invite_client_owner', { clientId: IDS.clientA1, name: 'Maria Lopez', email: 'maria@x.co' });
    expect(await reviews()).toHaveLength(0);
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
