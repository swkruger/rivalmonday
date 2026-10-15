import { type AccessContext, createAccessContext, type Feature } from '@cs/core';
import { ad, alert, changeEvent, client, clientCompetitor, competitor, competitorSignal, competitorSuggestion, createDb, discoveryRun, trackedPage } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, testUrls, truncateAll } from '@cs/db/test-helpers';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnqueueJob, JobStatusLookup } from '../deps';
import { ensureSelfCompetitor } from '@cs/collectors';
import { createToolRegistry } from '../registry';
import { normalizeDomain } from './competitors';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const enqueue = vi.fn<EnqueueJob>(async () => {});
const jobStatus = vi.fn<JobStatusLookup>(async () => null);
const reg = (webMonitoring: boolean) => createToolRegistry({ app: dbs.app, service: dbs.service, enqueue, jobStatus, webMonitoring }, { audit: { record: async () => {} } });
const registry = reg(false);
const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope'], features: Feature[] = [], agencyId: string = IDS.agencyA) =>
  createAccessContext({ agencyId, userId: `u-${role}`, role, clientScope: scope, features });
const admin = ctx('agency_admin', 'all');
const amA1 = ctx('account_manager', [IDS.clientA1]);
const owner = ctx('client_owner', [IDS.clientA1]);

async function suggest(clientId: string, agencyId: string, name: string, placeId: string, domain: string | null = null): Promise<string> {
  const [s] = await dbs.owner.insert(competitorSuggestion).values({ agencyId, clientId, name, placeId, domain, appearances: 3, overlapScore: 0.8 }).returning();
  return s!.id;
}

const AREA = { center: { lat: 32.44, lng: -97.79 }, radiusKm: 10, zips: [] };
const PROFILE = { keywords: ['ac repair'], serviceArea: AREA, placeId: 'ChIJa1hvacplace1' };
type AdMatchT = { platform: 'google' | 'meta'; accountId: string; name: string; strength: 'strong' | 'weak' };
type ListOut = { suggestions: { id: string; name: string; tier: string | null; preselected: boolean; signals: Record<string, unknown>; adMatches: AdMatchT[] }[]; hidden: Record<string, number>; hiddenList: unknown[] };
const FULL_SIGNALS = {
  rating: 4.8, votes: 120, reviews30d: null, reviews90d: null, replyRate: null, googleAdsActive: null, googleAdsNew30d: null, googleAccount: null,
  metaPage: null, metaAdsActive: null, claimed: true, chain: false, categoryMatch: 'main', distanceKm: 4.2, presence: { searches: 9, appeared: 6, bestRank: 2 },
};

async function doneRun(clientId: string, o: { finishedAt?: Date; startedAt?: Date; hidden?: Record<string, number>; hiddenList?: { name: string; reason: string }[] } = {}): Promise<string> {
  const finishedAt = o.finishedAt ?? new Date(Date.now() - 3_600_000);
  const [r] = await dbs.owner.insert(discoveryRun).values({
    agencyId: IDS.agencyA, clientId, trigger: 'manual', status: 'done', startedAt: o.startedAt ?? new Date(finishedAt.getTime() - 600_000), finishedAt, kept: 5,
    hidden: o.hidden ?? {}, progress: { searchesDone: 9, searchesTotal: 9, checksDone: 5, checksTotal: 5, hiddenList: o.hiddenList ?? [] },
  }).returning({ id: discoveryRun.id });
  return r!.id;
}

async function runSuggestion(runId: string, name: string, placeId: string, o: { tier: 'top' | 'watch' | 'minor'; overlap: number; status?: string; adMatches?: AdMatchT[]; clientId?: string }): Promise<string> {
  const [s] = await dbs.owner.insert(competitorSuggestion).values({
    agencyId: IDS.agencyA, clientId: o.clientId ?? IDS.clientA1, name, placeId, appearances: 6, overlapScore: o.overlap, status: o.status ?? 'suggested',
    runId, category: 'HVAC contractor', distanceKm: 4.2, overlap: o.overlap, activity: 0.5, tier: o.tier, signals: FULL_SIGNALS, adMatches: o.adMatches ?? [],
  }).returning({ id: competitorSuggestion.id });
  return s!.id;
}

beforeEach(async () => {
  enqueue.mockClear();
  jobStatus.mockReset();
  jobStatus.mockResolvedValue(null);
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('client owner self-service', () => {
  it('lets a flagged owner add a competitor and denies an unflagged one', async () => {
    const flagged = ctx('client_owner', [IDS.clientA1], ['dashboard', 'manage_competitors']);
    await expect(registry.invoke(flagged, 'add_competitor', { clientId: IDS.clientA1, name: 'Owner Added HVAC', domain: 'owneradded.com' })).resolves.toMatchObject({ competitorId: expect.any(String) });
    await expect(registry.invoke(ctx('client_owner', [IDS.clientA1], ['dashboard']), 'add_competitor', { clientId: IDS.clientA1, name: 'Nope', domain: 'nope.com' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(flagged, 'request_competitor_suggestions', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('mutating manage tools', () => {
  const U = '00000000-0000-4000-8000-0000000000f1';
  const calls: [string, Record<string, unknown>][] = [
    ['accept_competitor_suggestion', { suggestionId: U }],
    ['dismiss_competitor_suggestion', { suggestionId: U }],
    ['add_competitor', { clientId: IDS.clientA1, name: 'X', domain: 'x.com' }],
    ['remove_competitor', { clientId: IDS.clientA1, competitorId: U }],
    ['accept_competitor_suggestions', { clientId: IDS.clientA1, ids: [U] }],
    ['confirm_ad_match', { clientId: IDS.clientA1, competitorId: U, platform: 'google', accountId: 'AR1' }],
    ['remove_ad_match', { clientId: IDS.clientA1, competitorId: U, platform: 'google', accountId: 'AR1' }],
  ];
  it.each(calls)('%s denies an owner without manage_competitors and a viewer with it', async (tool, input) => {
    await expect(registry.invoke(ctx('client_owner', [IDS.clientA1], ['dashboard']), tool, input)).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ctx('client_viewer', [IDS.clientA1], ['dashboard', 'manage_competitors']), tool, input)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('request_competitor_suggestions', () => {
  it('needs keywords, a service area and a place id, then starts one manual run', async () => {
    await expect(registry.invoke(admin, 'request_competitor_suggestions', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringMatching(/place id/) });
    await dbs.owner.update(client).set(PROFILE).where(eq(client.id, IDS.clientA1));
    const r = (await registry.invoke(admin, 'request_competitor_suggestions', { clientId: IDS.clientA1 })) as { queued: true; runId: string };
    expect(enqueue).toHaveBeenCalledWith('rival-search', { runId: r.runId }, `rival:${IDS.clientA1}`);
    await expect(registry.invoke(admin, 'request_competitor_suggestions', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringMatching(/already running/) });
  });

  it('is agency-only and scoped', async () => {
    await expect(registry.invoke(ctx('client_owner', [IDS.clientA1], ['manage_competitors']), 'request_competitor_suggestions', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(amA1, 'request_competitor_suggestions', { clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('get_competitor_search_status', () => {
  const status = (c: AccessContext = admin) => registry.invoke(c, 'get_competitor_search_status', { clientId: IDS.clientA1 });

  it('is none when this client has never searched', async () => {
    await expect(status()).resolves.toEqual({ status: 'none' });
  });

  it('reports the latest run: stage, progress counters, kept and hidden counts', async () => {
    await doneRun(IDS.clientA1, { finishedAt: new Date('2026-10-01T10:00:00Z'), startedAt: new Date('2026-10-01T09:00:00Z') });
    await dbs.owner.insert(discoveryRun).values({
      agencyId: IDS.agencyA, clientId: IDS.clientA1, trigger: 'manual', status: 'searching',
      progress: { searchesDone: 140, searchesTotal: 245, checksDone: 0, checksTotal: 0, hiddenList: [{ name: 'Dollar General', reason: 'wrong_category' }], shortlistIds: [] },
    });
    await expect(status()).resolves.toEqual({
      status: 'searching', progress: { searchesDone: 140, searchesTotal: 245, checksDone: 0, checksTotal: 0 }, kept: null,
      hidden: { wrong_category: 0, outside_area: 0, self: 0, closed: 0, thin: 0 }, finishedAt: null,
    });
  });

  it('is agency-only and scoped', async () => {
    await expect(status(ctx('client_owner', [IDS.clientA1], ['manage_competitors']))).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(amA1, 'get_competitor_search_status', { clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('suggestions', () => {
  it('lists only the latest done run: tier groups, overlap order, Top rivals pre-ticked up to the room left, hidden counts and list', async () => {
    const old = await doneRun(IDS.clientA1, { finishedAt: new Date(Date.now() - 2 * 86_400_000) });
    await runSuggestion(old, 'Stale Rival', 'ChIJstalestale1', { tier: 'top', overlap: 0.99 });
    await suggest(IDS.clientA1, IDS.agencyA, 'Pre-12a Row', 'ChIJlegacylegac'); // run_id NULL
    await dbs.owner.update(client).set({ competitorLimit: 3 }).where(eq(client.id, IDS.clientA1)); // tracks X already: room 2
    const run = await doneRun(IDS.clientA1, { hidden: { wrong_category: 2, self: 1 }, hiddenList: [{ name: 'Dollar General', reason: 'wrong_category' }, { name: 'A1 HVAC', reason: 'self' }] });
    await runSuggestion(run, 'Minor Co', 'ChIJminorminor1', { tier: 'minor', overlap: 0.9 });
    await runSuggestion(run, 'Top Low', 'ChIJtoplowtopl1', { tier: 'top', overlap: 0.6 });
    await runSuggestion(run, 'Watch Co', 'ChIJwatchwatch1', { tier: 'watch', overlap: 0.95 });
    await runSuggestion(run, 'Top High', 'ChIJtophightop1', { tier: 'top', overlap: 0.8 });
    await runSuggestion(run, 'Top Mid', 'ChIJtopmidtopm1', { tier: 'top', overlap: 0.7 });
    await runSuggestion(run, 'Dismissed', 'ChIJdismissed01', { tier: 'top', overlap: 0.99, status: 'dismissed' });
    const r = (await registry.invoke(amA1, 'list_competitor_suggestions', { clientId: IDS.clientA1 })) as ListOut;
    expect(r.suggestions.map((s) => [s.name, s.tier, s.preselected])).toEqual([
      ['Top High', 'top', true], ['Top Mid', 'top', true], ['Top Low', 'top', false], ['Watch Co', 'watch', false], ['Minor Co', 'minor', false],
    ]);
    expect(r.suggestions[0]).toMatchObject({ category: 'HVAC contractor', distanceKm: 4.2, adMatches: [], signals: expect.objectContaining({ rating: 4.8, reviews30d: null, googleAdsActive: null }) });
    expect(r.hidden).toEqual({ wrong_category: 2, outside_area: 0, self: 1, closed: 0, thin: 0 });
    expect(r.hiddenList).toEqual([{ name: 'Dollar General', reason: 'wrong_category' }, { name: 'A1 HVAC', reason: 'self' }]);
  });

  it('a newer run that is live or failed after writing suggestions still shows them next to the latest done run (Ruling 11)', async () => {
    const r1 = await doneRun(IDS.clientA1, { hidden: { self: 1 }, hiddenList: [{ name: 'A1 HVAC', reason: 'self' }] });
    await runSuggestion(r1, 'Kept Rival', 'ChIJkeptkeptke1', { tier: 'top', overlap: 0.8 });
    const moved = await runSuggestion(r1, 'Moved Rival', 'ChIJmovedmoved1', { tier: 'watch', overlap: 0.7 });
    const [r2] = await dbs.owner.insert(discoveryRun).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, trigger: 'manual', status: 'checking', startedAt: new Date(), hidden: { wrong_category: 4 } }).returning({ id: discoveryRun.id });
    // R2 re-upserted one of R1's businesses (run_id moved on) and found a new one.
    await dbs.owner.update(competitorSuggestion).set({ runId: r2!.id }).where(eq(competitorSuggestion.id, moved));
    await runSuggestion(r2!.id, 'New In Run 2', 'ChIJnewinrun201', { tier: 'minor', overlap: 0.4 });
    const names = async () => ((await registry.invoke(amA1, 'list_competitor_suggestions', { clientId: IDS.clientA1 })) as ListOut).suggestions.map((s) => s.name);
    expect(await names()).toEqual(['Kept Rival', 'Moved Rival', 'New In Run 2']); // while R2 is live
    await dbs.owner.update(discoveryRun).set({ status: 'failed', error: 'internal_error', finishedAt: new Date() }).where(eq(discoveryRun.id, r2!.id));
    const r = (await registry.invoke(amA1, 'list_competitor_suggestions', { clientId: IDS.clientA1 })) as ListOut;
    expect(r.suggestions.map((s) => s.name)).toEqual(['Kept Rival', 'Moved Rival', 'New In Run 2']);
    // Hidden counts and list stay the latest done run's.
    expect(r.hidden).toMatchObject({ self: 1, wrong_category: 0 });
    expect(r.hiddenList).toEqual([{ name: 'A1 HVAC', reason: 'self' }]);
    // A run older than the latest done one never contributes.
    const [older] = await dbs.owner.insert(discoveryRun).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, trigger: 'manual', status: 'failed', startedAt: new Date(Date.now() - 5 * 86_400_000) }).returning({ id: discoveryRun.id });
    await runSuggestion(older!.id, 'Ancient', 'ChIJancientanc1', { tier: 'top', overlap: 0.99 });
    expect(await names()).not.toContain('Ancient');
  });

  it('is empty before any run finished, and agency-only (client roles never see suggestions)', async () => {
    await suggest(IDS.clientA1, IDS.agencyA, 'Pre-12a Row', 'ChIJlegacylegac');
    await expect(registry.invoke(amA1, 'list_competitor_suggestions', { clientId: IDS.clientA1 })).resolves.toEqual({
      suggestions: [], hidden: { wrong_category: 0, outside_area: 0, self: 0, closed: 0, thin: 0 }, hiddenList: [],
    });
    await expect(registry.invoke(owner, 'list_competitor_suggestions', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ctx('client_owner', [IDS.clientA1], ['dashboard', 'manage_competitors']), 'list_competitor_suggestions', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(amA1, 'list_competitor_suggestions', { clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('accepts: links the competitor, starts vendor sources, and enqueues discovery only when monitoring is on', async () => {
    const off = await suggest(IDS.clientA1, IDS.agencyA, 'Peachtree Air', 'ChIJpeachtree1', 'peachtreeair.com');
    const r1 = (await registry.invoke(amA1, 'accept_competitor_suggestion', { suggestionId: off })) as { competitorId: string; discovery: string };
    expect(r1.discovery).toBe('disabled');
    expect(enqueue).not.toHaveBeenCalled();
    const links = await dbs.owner.select().from(clientCompetitor).where(and(eq(clientCompetitor.clientId, IDS.clientA1), eq(clientCompetitor.competitorId, r1.competitorId)));
    expect(links).toHaveLength(1);

    const on = await suggest(IDS.clientA1, IDS.agencyA, 'Metro Comfort', 'ChIJmetrocomf1', 'metrocomfort.com');
    const r2 = (await reg(true).invoke(amA1, 'accept_competitor_suggestion', { suggestionId: on })) as { competitorId: string; discovery: string };
    expect(r2.discovery).toBe('queued');
    expect(enqueue).toHaveBeenCalledWith('discover-pages', { competitorId: r2.competitorId }, `discover:${r2.competitorId}`);

    // A competitor that already has tracked pages is not re-discovered.
    await dbs.owner.insert(trackedPage).values({ competitorId: r2.competitorId, url: 'https://metrocomfort.com/', pageType: 'home', source: 'nav', cadence: 'daily' });
    const again = await suggest(IDS.clientA2, IDS.agencyA, 'Metro Comfort', 'ChIJmetrocomf1', 'metrocomfort.com');
    const r3 = (await reg(true).invoke(admin, 'accept_competitor_suggestion', { suggestionId: again })) as { discovery: string };
    expect(r3.discovery).toBe('not_needed');
  });

  it('enforces the competitor limit', async () => {
    for (let i = 0; i < 4; i++) {
      const [c] = await dbs.owner.insert(competitor).values({ name: `C${i}` }).returning();
      await dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: c!.id });
    }
    const sixth = await suggest(IDS.clientA1, IDS.agencyA, 'Sixth', 'ChIJsixthsixth');
    await expect(registry.invoke(amA1, 'accept_competitor_suggestion', { suggestionId: sixth })).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringContaining('5 competitors') });
  });

  it('dismisses, and refuses other scopes (Review Focus 1)', async () => {
    const id = await suggest(IDS.clientA1, IDS.agencyA, 'Nope', 'ChIJnopenopeno');
    await registry.invoke(amA1, 'dismiss_competitor_suggestion', { suggestionId: id });
    const [s] = await dbs.owner.select().from(competitorSuggestion).where(eq(competitorSuggestion.id, id));
    expect(s!.status).toBe('dismissed');
    await expect(registry.invoke(amA1, 'dismiss_competitor_suggestion', { suggestionId: id })).rejects.toMatchObject({ code: 'not_found' });
    const other = await suggest(IDS.clientA2, IDS.agencyA, 'A2 only', 'ChIJa2onlya2on');
    await expect(registry.invoke(amA1, 'accept_competitor_suggestion', { suggestionId: other })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(amA1, 'dismiss_competitor_suggestion', { suggestionId: other })).rejects.toMatchObject({ code: 'not_found' });
    const foreign = await suggest(IDS.clientB1, IDS.agencyB, 'B1 only', 'ChIJb1onlyb1on');
    await expect(registry.invoke(admin, 'accept_competitor_suggestion', { suggestionId: foreign })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('manual competitors', () => {
  it('normalises websites to a bare host', () => {
    expect(normalizeDomain('https://www.SmithHVAC.com/about?x=1')).toBe('smithhvac.com');
    expect(normalizeDomain('smithhvac.com')).toBe('smithhvac.com');
    expect(normalizeDomain('not a domain')).toBeNull();
  });

  it('adds by website, reusing an existing global row, and lists tracked competitors', async () => {
    await dbs.owner.update(competitor).set({ domain: 'smithhvac.com' }).where(eq(competitor.id, IDS.competitorX));
    const r = (await registry.invoke(amA1, 'add_competitor', { clientId: IDS.clientA1, name: 'Ignored Name', domain: 'https://smithhvac.com' })) as { competitorId: string };
    expect(r.competitorId).toBe(IDS.competitorX);
    // Not anyone's self business: the reused row keeps its own name.
    expect((await dbs.owner.select({ n: competitor.name }).from(competitor).where(eq(competitor.id, IDS.competitorX)))[0]?.n).not.toBe('Ignored Name');
    const n = (await registry.invoke(admin, 'add_competitor', { clientId: IDS.clientA2, name: 'Fresh Plumbing', domain: 'freshplumbing.com' })) as { competitorId: string; discovery: string };
    expect(n.discovery).toBe('disabled');
    const { items } = (await registry.invoke(admin, 'list_client_competitors', { clientId: IDS.clientA2 })) as { items: { name: string }[] };
    expect(items.map((i) => i.name).sort()).toEqual(['Bright Smiles', 'Fresh Plumbing']);
    await expect(registry.invoke(amA1, 'add_competitor', { clientId: IDS.clientA1, name: 'X' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(amA1, 'add_competitor', { clientId: IDS.clientA2, name: 'X', domain: 'x.com' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('removes a competitor; its alerts still list with a fallback name (Review Focus 3)', async () => {
    const [e] = await dbs.owner.insert(changeEvent).values({ competitorId: IDS.competitorX, changeType: 'price_change', summary: 's', confidence: 0.9, occurredAt: new Date() }).returning();
    await dbs.owner.insert(alert).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, eventId: e!.id, score: 80, headline: 'Price cut', status: 'delivered', mode: 'direct' });
    // Cross-scope (Review Focus 1): neither an AM outside the client's scope nor another agency's admin may remove this link.
    await expect(registry.invoke(amA1, 'remove_competitor', { clientId: IDS.clientA2, competitorId: IDS.competitorX })).rejects.toMatchObject({ code: 'not_found' });
    const otherAgencyAdmin = ctx('agency_admin', 'all', [], IDS.agencyB);
    await expect(registry.invoke(otherAgencyAdmin, 'remove_competitor', { clientId: IDS.clientA1, competitorId: IDS.competitorX })).rejects.toMatchObject({ code: 'not_found' });
    const stillLinked = await dbs.owner.select().from(clientCompetitor).where(and(eq(clientCompetitor.clientId, IDS.clientA1), eq(clientCompetitor.competitorId, IDS.competitorX)));
    expect(stillLinked).toHaveLength(1);

    await registry.invoke(amA1, 'remove_competitor', { clientId: IDS.clientA1, competitorId: IDS.competitorX });
    const { items } = (await registry.invoke(amA1, 'list_alerts', { clientId: IDS.clientA1 })) as { items: { competitorName: string }[] };
    expect(items).toEqual([expect.objectContaining({ competitorName: 'Competitor' })]);
    await expect(registry.invoke(amA1, 'remove_competitor', { clientId: IDS.clientA1, competitorId: IDS.competitorX })).rejects.toMatchObject({ code: 'not_found' });
    // Re-adding works.
    await registry.invoke(amA1, 'add_competitor', { clientId: IDS.clientA1, name: 'Smith HVAC', placeId: 'ChIJsmithsmith1' });
  });

  it("renames a reused row that is another agency's self business, so its private client name never leaks (final review)", async () => {
    await dbs.owner.update(client).set({ placeId: 'ChIJa1hvacplace1' }).where(eq(client.id, IDS.clientA1));
    const { competitorId: selfId } = (await ensureSelfCompetitor(dbs.service, IDS.clientA1)) as { competitorId: string };
    const [a1] = await dbs.owner.select({ name: client.name }).from(client).where(eq(client.id, IDS.clientA1));
    expect((await dbs.owner.select({ n: competitor.name }).from(competitor).where(eq(competitor.id, selfId)))[0]?.n).toBe(a1!.name);

    const adminB = ctx('agency_admin', 'all', [], IDS.agencyB);
    const r = (await registry.invoke(adminB, 'add_competitor', { clientId: IDS.clientB1, name: 'Cool Breeze Air', placeId: 'ChIJa1hvacplace1', domain: 'typed-domain.com' })) as { competitorId: string };
    expect(r.competitorId).toBe(selfId);
    const { items } = (await registry.invoke(adminB, 'list_client_competitors', { clientId: IDS.clientB1 })) as { items: { id: string; name: string }[] };
    const reused = items.find((i) => i.id === selfId);
    expect(reused?.name).toBe('Cool Breeze Air');
    expect(items.map((i) => i.name)).not.toContain(a1!.name);
    // Only the rename: the typed website is not written onto the shared self row.
    expect((await dbs.owner.select({ d: competitor.domain }).from(competitor).where(eq(competitor.id, selfId)))[0]?.d).toBeNull();
  });

  it('never writes typed identifiers onto a reused shared row (re-review of the final fix)', async () => {
    await dbs.owner.update(competitor).set({ domain: 'smithhvac.com', placeId: null }).where(eq(competitor.id, IDS.competitorX));
    const adminB = ctx('agency_admin', 'all', [], IDS.agencyB);
    const r = (await registry.invoke(adminB, 'add_competitor', { clientId: IDS.clientB1, name: 'Smith HVAC', domain: 'smithhvac.com', placeId: 'ChIJmistyped00001' })) as { competitorId: string };
    expect(r.competitorId).toBe(IDS.competitorX);
    const [x] = await dbs.owner.select().from(competitor).where(eq(competitor.id, IDS.competitorX));
    expect(x).toMatchObject({ placeId: null, domain: 'smithhvac.com', cid: null });
  });
});

describe('bulk accept and the atomic limit (12a)', () => {
  it('accepting rates each newly tracked competitor at once from its suggestion (M2), single and bulk', async () => {
    const run = await doneRun(IDS.clientA1);
    const one = await runSuggestion(run, 'Rated One', 'ChIJratedone001', { tier: 'top', overlap: 0.8 });
    const two = await runSuggestion(run, 'Rated Two', 'ChIJratedtwo002', { tier: 'watch', overlap: 0.5 });
    const unrated = await suggest(IDS.clientA1, IDS.agencyA, 'Pre-12a', 'ChIJunrated0003'); // no tier: stays "Not rated yet"
    const a = (await registry.invoke(amA1, 'accept_competitor_suggestion', { suggestionId: one })) as { competitorId: string };
    const { items } = (await registry.invoke(amA1, 'accept_competitor_suggestions', { clientId: IDS.clientA1, ids: [two, unrated] })) as { items: { suggestionId: string; competitorId: string }[] };
    const sig = (await registry.invoke(amA1, 'get_competitor_signals', { clientId: IDS.clientA1 })) as { competitors: { competitorId: string; tier: string; signals: Record<string, unknown> }[] };
    const byId = new Map(sig.competitors.map((c) => [c.competitorId, c]));
    expect(byId.get(a.competitorId)).toMatchObject({ tier: 'top', signals: expect.objectContaining({ rating: 4.8, claimed: true, reviews30d: null, googleAdsActive: null }) });
    expect(byId.get(items.find((i) => i.suggestionId === two)!.competitorId)).toMatchObject({ tier: 'watch' });
    expect(byId.has(items.find((i) => i.suggestionId === unrated)!.competitorId)).toBe(false);
    const [row] = await dbs.owner.select().from(competitorSignal).where(and(eq(competitorSignal.clientId, IDS.clientA1), eq(competitorSignal.competitorId, a.competitorId)));
    expect(row).toMatchObject({ agencyId: IDS.agencyA, overlap: 0.8, activity: 0.5 });
  });

  it('accept never overwrites an existing weekly rating of an already-tracked competitor', async () => {
    await dbs.owner.insert(competitorSignal).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, tier: 'minor', overlap: 0.1, activity: 0.1, signals: {} });
    await dbs.owner.update(competitor).set({ placeId: 'ChIJalreadyx001' }).where(eq(competitor.id, IDS.competitorX));
    const run = await doneRun(IDS.clientA1);
    const id = await runSuggestion(run, 'X Again', 'ChIJalreadyx001', { tier: 'top', overlap: 0.9 });
    await registry.invoke(amA1, 'accept_competitor_suggestion', { suggestionId: id });
    const [row] = await dbs.owner.select().from(competitorSignal).where(and(eq(competitorSignal.clientId, IDS.clientA1), eq(competitorSignal.competitorId, IDS.competitorX)));
    expect(row).toMatchObject({ tier: 'minor', overlap: 0.1 });
  });

  it('two concurrent bulk accepts at limit → one refused', async () => {
    // A1 tracks X (1 of 3): each bulk accept of two would fit alone, both together would not.
    await dbs.owner.update(client).set({ competitorLimit: 3 }).where(eq(client.id, IDS.clientA1));
    const run = await doneRun(IDS.clientA1);
    const ids = await Promise.all(['ChIJbulkone0001', 'ChIJbulktwo0002', 'ChIJbulkthree03', 'ChIJbulkfour004'].map((p, i) => runSuggestion(run, `Bulk ${i}`, p, { tier: 'top', overlap: 0.9 - i / 10 })));
    // Two real connections (separate service pools), so the two transactions genuinely overlap.
    const second = createDb(testUrls.service);
    try {
      const other = createToolRegistry({ app: dbs.app, service: second.db, enqueue, jobStatus, webMonitoring: false }, { audit: { record: async () => {} } });
      const results = await Promise.allSettled([
        registry.invoke(amA1, 'accept_competitor_suggestions', { clientId: IDS.clientA1, ids: ids.slice(0, 2) }),
        other.invoke(amA1, 'accept_competitor_suggestions', { clientId: IDS.clientA1, ids: ids.slice(2) }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const refused = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(refused.reason).toMatchObject({ code: 'invalid_input', message: expect.stringContaining('at most 3 competitors') });
    } finally {
      await second.close();
    }
    expect(await dbs.owner.select().from(clientCompetitor).where(eq(clientCompetitor.clientId, IDS.clientA1))).toHaveLength(3);
    // All or none: the refused batch left its suggestions open.
    const open = await dbs.owner.select().from(competitorSuggestion).where(and(eq(competitorSuggestion.clientId, IDS.clientA1), eq(competitorSuggestion.status, 'suggested')));
    expect(open).toHaveLength(2);
  });

  it('a competitor already tracked does not count twice; other clients’ suggestions are not found', async () => {
    await dbs.owner.update(competitor).set({ placeId: 'ChIJsmithsmith1' }).where(eq(competitor.id, IDS.competitorX));
    await dbs.owner.update(client).set({ competitorLimit: 1 }).where(eq(client.id, IDS.clientA1));
    const run = await doneRun(IDS.clientA1);
    const same = await runSuggestion(run, 'Smith HVAC', 'ChIJsmithsmith1', { tier: 'top', overlap: 0.9 });
    await expect(registry.invoke(amA1, 'accept_competitor_suggestions', { clientId: IDS.clientA1, ids: [same] })).resolves.toEqual({ items: [{ suggestionId: same, competitorId: IDS.competitorX, discovery: 'disabled' }] });
    const a2 = await runSuggestion(await doneRun(IDS.clientA2), 'A2 Rival', 'ChIJa2rivala2ri', { tier: 'top', overlap: 0.9, clientId: IDS.clientA2 });
    await expect(registry.invoke(admin, 'accept_competitor_suggestions', { clientId: IDS.clientA1, ids: [a2] })).rejects.toMatchObject({ code: 'not_found' });
    // Only open suggestions: accepted (above) or dismissed ones are not found.
    await expect(registry.invoke(amA1, 'accept_competitor_suggestions', { clientId: IDS.clientA1, ids: [same] })).rejects.toMatchObject({ code: 'not_found' });
    const dismissed = await runSuggestion(run, 'Gone', 'ChIJdismissedx1', { tier: 'minor', overlap: 0.1, status: 'dismissed' });
    await expect(registry.invoke(amA1, 'accept_competitor_suggestion', { suggestionId: dismissed })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('ad-account matches (D6)', () => {
  const STRONG_G: AdMatchT = { platform: 'google', accountId: 'AR111', name: 'Peach Air LLC', strength: 'strong' };
  const WEAK_M: AdMatchT = { platform: 'meta', accountId: '9001', name: 'Peach Air Atlanta', strength: 'weak' };
  const WEAK_G: AdMatchT = { platform: 'google', accountId: 'AR222', name: 'Peach Heating', strength: 'weak' };

  async function acceptWithMatches(): Promise<string> {
    const run = await doneRun(IDS.clientA1);
    const id = await runSuggestion(run, 'Peach Air', 'ChIJpeachairpe1', { tier: 'top', overlap: 0.9, adMatches: [STRONG_G, WEAK_M, WEAK_G] });
    const { competitorId } = (await registry.invoke(amA1, 'accept_competitor_suggestion', { suggestionId: id })) as { competitorId: string };
    return competitorId;
  }
  const accounts = async (id: string) => (await dbs.owner.select({ g: competitor.googleAdvertiserIds, m: competitor.metaPageIds }).from(competitor).where(eq(competitor.id, id)))[0]!;
  const pending = async (id: string) => (await dbs.owner.select({ p: clientCompetitor.pendingAdMatches }).from(clientCompetitor).where(and(eq(clientCompetitor.clientId, IDS.clientA1), eq(clientCompetitor.competitorId, id))))[0]!.p;

  it('strong match attached, weak pending', async () => {
    const id = await acceptWithMatches();
    expect(await accounts(id)).toEqual({ g: ['AR111'], m: [] });
    expect(await pending(id)).toEqual([WEAK_M, WEAK_G]);
  });

  it('confirm moves one pending match onto the competitor, without duplicates', async () => {
    const id = await acceptWithMatches();
    await registry.invoke(amA1, 'confirm_ad_match', { clientId: IDS.clientA1, competitorId: id, platform: 'meta', accountId: '9001' });
    expect(await accounts(id)).toEqual({ g: ['AR111'], m: ['9001'] });
    expect(await pending(id)).toEqual([WEAK_G]);
    await expect(registry.invoke(amA1, 'confirm_ad_match', { clientId: IDS.clientA1, competitorId: id, platform: 'meta', accountId: '9001' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('remove Google id retires its ads silently', async () => {
    const id = await acceptWithMatches();
    const seen = new Date('2026-10-10T12:00:00Z');
    await dbs.owner.insert(ad).values([
      { competitorId: id, platform: 'google', externalId: 'CR-1', advertiserId: 'AR111', isActive: true, lastSeenAt: seen },
      { competitorId: id, platform: 'google', externalId: 'CR-2', advertiserId: 'AR999', isActive: true, lastSeenAt: seen },
    ]);
    await registry.invoke(amA1, 'remove_ad_match', { clientId: IDS.clientA1, competitorId: id, platform: 'google', accountId: 'AR111' });
    expect(await accounts(id)).toEqual({ g: [], m: [] });
    const ads = await dbs.owner.select().from(ad).where(eq(ad.competitorId, id));
    expect(ads.find((a) => a.externalId === 'CR-1')).toMatchObject({ isActive: false, endedAt: seen, endedCaptureId: null });
    expect(ads.find((a) => a.externalId === 'CR-2')).toMatchObject({ isActive: true, endedAt: null });
    // A pending match can be removed too; an unknown one is not found.
    await registry.invoke(amA1, 'remove_ad_match', { clientId: IDS.clientA1, competitorId: id, platform: 'google', accountId: 'AR222' });
    expect(await pending(id)).toEqual([WEAK_M]);
    await expect(registry.invoke(amA1, 'remove_ad_match', { clientId: IDS.clientA1, competitorId: id, platform: 'google', accountId: 'AR222' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('remove is refused when another client also tracks the competitor (shared row and ads unchanged)', async () => {
    const id = await acceptWithMatches();
    await dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA2, competitorId: id });
    await dbs.owner.insert(ad).values({ competitorId: id, platform: 'google', externalId: 'CR-1', advertiserId: 'AR111', isActive: true });
    await expect(registry.invoke(amA1, 'remove_ad_match', { clientId: IDS.clientA1, competitorId: id, platform: 'google', accountId: 'AR111' }))
      .rejects.toMatchObject({ code: 'invalid_input', message: "Other clients also track this competitor, so this account can't be removed here. Contact support." });
    expect(await accounts(id)).toEqual({ g: ['AR111'], m: [] });
    expect((await dbs.owner.select().from(ad).where(eq(ad.competitorId, id)))[0]).toMatchObject({ isActive: true, endedAt: null });
    // This client's own pending entry can still go.
    await registry.invoke(amA1, 'remove_ad_match', { clientId: IDS.clientA1, competitorId: id, platform: 'meta', accountId: '9001' });
    expect(await pending(id)).toEqual([WEAK_G]);
  });

  it('confirm and remove are agency-only: a client owner with manage_competitors is refused', async () => {
    const id = await acceptWithMatches();
    const flagged = ctx('client_owner', [IDS.clientA1], ['dashboard', 'manage_competitors']);
    // The registry hides tools a role may not call (404-not-403): the refusal reads as not_found.
    await expect(registry.invoke(flagged, 'confirm_ad_match', { clientId: IDS.clientA1, competitorId: id, platform: 'meta', accountId: '9001' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(flagged, 'remove_ad_match', { clientId: IDS.clientA1, competitorId: id, platform: 'google', accountId: 'AR111' })).rejects.toMatchObject({ code: 'not_found' });
    expect(await accounts(id)).toEqual({ g: ['AR111'], m: [] });
    expect(await pending(id)).toEqual([WEAK_M, WEAK_G]);
  });

  it('refuses a competitor the client does not track, and other agencies', async () => {
    const id = await acceptWithMatches();
    await expect(registry.invoke(admin, 'confirm_ad_match', { clientId: IDS.clientA2, competitorId: id, platform: 'meta', accountId: '9001' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ctx('agency_admin', 'all', [], IDS.agencyB), 'remove_ad_match', { clientId: IDS.clientA1, competitorId: id, platform: 'google', accountId: 'AR111' })).rejects.toMatchObject({ code: 'not_found' });
    expect(await accounts(id)).toEqual({ g: ['AR111'], m: [] });
  });
});

describe('get_competitor_ad_matches', () => {
  const WEAK_M: AdMatchT = { platform: 'meta', accountId: '9001', name: 'Peach Air Atlanta', strength: 'weak' };
  type Out = { matched: { platform: string; accountId: string; name: string | null }[]; pending: AdMatchT[] };

  it('lists matched accounts (name unknown) and pending weak matches for managers only', async () => {
    const run = await doneRun(IDS.clientA1);
    const id = await runSuggestion(run, 'Peach Air', 'ChIJpeachairpe1', { tier: 'top', overlap: 0.9, adMatches: [{ platform: 'google', accountId: 'AR111', name: 'Peach Air LLC', strength: 'strong' }, WEAK_M] });
    const { competitorId } = (await registry.invoke(amA1, 'accept_competitor_suggestion', { suggestionId: id })) as { competitorId: string };
    const r = (await registry.invoke(amA1, 'get_competitor_ad_matches', { clientId: IDS.clientA1, competitorId })) as Out;
    expect(r).toEqual({ matched: [{ platform: 'google', accountId: 'AR111', name: null }], pending: [WEAK_M] });
    await expect(registry.invoke(ctx('client_owner', [IDS.clientA1], ['dashboard', 'manage_competitors']), 'get_competitor_ad_matches', { clientId: IDS.clientA1, competitorId })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ctx('client_viewer', [IDS.clientA1], ['dashboard']), 'get_competitor_ad_matches', { clientId: IDS.clientA1, competitorId })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(admin, 'get_competitor_ad_matches', { clientId: IDS.clientA2, competitorId })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ctx('agency_admin', 'all', [], IDS.agencyB), 'get_competitor_ad_matches', { clientId: IDS.clientA1, competitorId })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('get_competitor_signals', () => {
  beforeEach(async () => {
    await dbs.owner.insert(competitorSignal).values([
      { agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, tier: 'watch', overlap: 0.6, activity: 0.4, signals: { rating: 4.1, votes: 33, googleAdsActive: 0 }, computedAt: new Date('2026-10-13T09:00:00Z') },
      // Y is not tracked by A1: never returned.
      { agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorY, tier: 'top', signals: {} },
    ]);
  });

  it('client role sees get_competitor_signals but not suggestions', async () => {
    const viewer = ctx('client_viewer', [IDS.clientA1], ['dashboard']);
    const r = (await registry.invoke(viewer, 'get_competitor_signals', { clientId: IDS.clientA1 })) as { competitors: { competitorId: string; tier: string; signals: Record<string, unknown>; computedAt: string }[] };
    expect(r.competitors).toEqual([{ competitorId: IDS.competitorX, tier: 'watch', signals: expect.objectContaining({ rating: 4.1, votes: 33, googleAdsActive: 0, reviews30d: null, presence: null }), computedAt: '2026-10-13T09:00:00.000Z' }]);
    await expect(registry.invoke(viewer, 'list_competitor_suggestions', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(viewer, 'get_competitor_signals', { clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ctx('agency_admin', 'all', [], IDS.agencyB), 'get_competitor_signals', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('payload keys (no upsell_tag, no ad matches for clients)', () => {
  const keysOf = (v: unknown, prefix = ''): string[] => {
    if (Array.isArray(v)) return v.length ? keysOf(v[0], `${prefix.replace(/\.$/, '')}[].`) : [];
    if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => [`${prefix}${k}`, ...keysOf(x, `${prefix}${k}.`)]);
    return [];
  };

  it('no upsell_tag in any payload', async () => {
    const run = await doneRun(IDS.clientA1, { hiddenList: [{ name: 'Dollar General', reason: 'wrong_category' }] });
    const id = await runSuggestion(run, 'Peach Air', 'ChIJpeachairpe1', { tier: 'top', overlap: 0.9, adMatches: [{ platform: 'meta', accountId: '1', name: 'P', strength: 'weak' }] });
    await dbs.owner.insert(competitorSignal).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, tier: 'top', signals: FULL_SIGNALS });
    const list = await registry.invoke(amA1, 'list_competitor_suggestions', { clientId: IDS.clientA1 });
    const status = await registry.invoke(amA1, 'get_competitor_search_status', { clientId: IDS.clientA1 });
    const signals = await registry.invoke(ctx('client_viewer', [IDS.clientA1], ['dashboard']), 'get_competitor_signals', { clientId: IDS.clientA1 });
    const accepted = await registry.invoke(amA1, 'accept_competitor_suggestions', { clientId: IDS.clientA1, ids: [id] });
    expect([list, status, signals, accepted].flatMap((p) => keysOf(p)).filter((k) => /upsell/i.test(k))).toEqual([]);
    const signalKeys = [...Object.keys(FULL_SIGNALS), 'presence.searches', 'presence.appeared', 'presence.bestRank'];
    expect(keysOf(signals).sort()).toEqual(['competitors', ...['competitorId', 'tier', 'signals', 'computedAt', ...signalKeys.map((k) => `signals.${k}`)].map((k) => `competitors[].${k}`)].sort());
    expect(keysOf(list).filter((k) => !k.startsWith('suggestions[].signals.')).sort()).toEqual([
      'hidden', 'hidden.closed', 'hidden.outside_area', 'hidden.self', 'hidden.thin', 'hidden.wrong_category', 'hiddenList', 'hiddenList[].name', 'hiddenList[].reason', 'suggestions',
      ...['adMatches', 'adMatches[].accountId', 'adMatches[].name', 'adMatches[].platform', 'adMatches[].strength', 'appearances', 'bestRank', 'category', 'distanceKm', 'domain', 'id', 'name',
        'overlapScore', 'placeId', 'preselected', 'rating', 'signals', 'tier', 'votes'].map((k) => `suggestions[].${k}`),
    ].sort());
    expect(keysOf(status).sort()).toEqual(['finishedAt', 'hidden', 'hidden.closed', 'hidden.outside_area', 'hidden.self', 'hidden.thin', 'hidden.wrong_category', 'kept', 'progress',
      'progress.checksDone', 'progress.checksTotal', 'progress.searchesDone', 'progress.searchesTotal', 'status']);
  });
});
