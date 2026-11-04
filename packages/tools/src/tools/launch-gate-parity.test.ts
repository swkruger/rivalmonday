/**
 * Launch-gate 6a: output parity for the tools whose reads now start together (and for `withTenant`'s pipelined
 * settings). The snapshot was recorded on the code *before* the change (sequential reads) and must stay byte-equal:
 * same output, same refusal (code + message) for every case. Ids and timestamps are normalised (seeded per run).
 */
import type { AccessContext } from '@cs/core';
import { askStarter, brief, briefItem, client, clientSetup, competitorSignal, competitorSuggestion, contact, discoveryRun, invitation, kbArticle, rankMapImage, rankScan, rankSnapshot } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ago, ctx, dbs, gridSnapshots, registry, resetWorkspace, rr, seedAds, seedCapture, seedEvent, seedGbpRating, seedMove, seedRankScan, seedReview, seedSelf, setPlace } from './workspace-fixtures';

const admin = ctx('agency_admin', 'all');
const owner = ctx('client_owner', [IDS.clientA1], ['dashboard', 'ask']);
const otherAgency = ctx('agency_admin', 'all', [], IDS.agencyB);
const UNKNOWN = '00000000-0000-4000-8000-00000000dead';

/** Seeded ids (and timestamps, hashes) differ per run: ids become `<id:N>` by first appearance, ISO timestamps `<ts>`. */
function normalise(v: unknown): unknown {
  const ids = new Map<string, string>();
  const text = JSON.stringify(v ?? null)
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, '<ts>')
    // Seeded evidence hashes are `<kind>-sha-<first 4 chars of the capture id>`: keep the kind (which hash was picked).
    .replace(/-sha-[0-9a-f]{4}/g, '-sha-<cap>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (id) => {
      if (!ids.has(id)) ids.set(id, `<id:${ids.size}>`);
      return ids.get(id)!;
    });
  return JSON.parse(text);
}

/** The output, or the refusal as `{ code, message }`. */
async function outcome(c: AccessContext, tool: string, input: Record<string, unknown>): Promise<unknown> {
  try {
    return normalise(await registry.invoke(c, tool, input));
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { refused: err.code ?? 'error', message: err.message };
  }
}

interface World { e1: string; e2: string; change1: string; change2: string; moveId: string; briefId: string }

async function seedWorld(): Promise<World> {
  await seedSelf();
  const before = await seedCapture({ at: ago(2), kinds: ['html', 'text', 'screenshot'] });
  const after = await seedCapture({ at: ago(1), kinds: ['text', 'html'] });
  const e1 = await seedEvent({ score: 86, route: 'alert', ageDays: 1, captures: { before: before.captureId, after: after.captureId }, summary: 'Smith HVAC cut its AC tune-up to $79' });
  const e2 = await seedEvent({ score: 55, route: 'brief', ageDays: 3, type: 'promotion', summary: 'Smith HVAC started a spring promo' });
  await seedEvent({ score: 90, route: 'alert', ageDays: 2, retracted: true });
  await seedEvent({ score: 70, route: 'alert', ageDays: 1, competitorId: IDS.competitorY, clientId: IDS.clientA2 });
  const moveId = await seedMove([e1.eventId, e2.eventId]);
  await seedAds({ firstCheckAt: ago(30), ads: [{ platform: 'google', externalId: 'g1', isActive: true, firstSeenAt: ago(20), lastSeenAt: ago(0) }] });
  await seedGbpRating(IDS.competitorX, 4.4, ago(1));
  await seedReview({ rating: 5, text: 'Great tune-up, fast and fair', postedAt: ago(4) });
  await seedReview({ rating: 2, text: 'Late again', postedAt: ago(10), ownerAnswer: 'Sorry about that' });

  const [b] = await dbs.owner.insert(brief).values({
    agencyId: IDS.agencyA, clientId: IDS.clientA1, periodStart: ago(8), periodEnd: ago(1), deliveryDate: ago(0).toISOString().slice(0, 10), status: 'sent', summary: 'Sent', sentAt: ago(0), generatedAt: ago(1),
  }).returning();
  const item = (ord: number, competitorId: string | null) => ({
    agencyId: IDS.agencyA, clientId: IDS.clientA1, briefId: b!.id, ord, competitorId, subject: (competitorId ? 'competitor' : 'self') as 'competitor' | 'self', headline: `h${ord}`, whatChanged: 'w', whyItMatters: 'y', recommendedAction: 'r',
    confidence: 0.9, effort: 'L', impact: 'H', upsellTag: 'ppc_audit',
  });
  await dbs.owner.insert(briefItem).values([item(2, IDS.competitorX), item(1, null), item(3, IDS.competitorX)]);

  await dbs.owner.insert(askStarter).values({ clientId: IDS.clientA1, agencyId: IDS.agencyA, questions: ['Who cut prices?', 'What changed?'] });

  const guide = (helpKey: string, level: 'platform' | 'agency', audience: 'all' | 'agency' | 'client', title: string) => ({
    level, agencyId: level === 'platform' ? null : IDS.agencyA, clientId: null, kind: 'help', title, bodyMd: `## What this page tells you\n\n${title} for {{client}} on {{product}}.`,
    status: 'published', clientVisible: audience !== 'agency', source: 'manual', createdBy: 't', updatedBy: 't', helpKey, audience,
  }) as typeof kbArticle.$inferInsert;
  await dbs.owner.insert(kbArticle).values([
    guide('page:client.overview', 'platform', 'all', 'Overview guide'),
    guide('page:client.overview', 'agency', 'agency', 'Agency overview guide'),
    guide('page:client.changes', 'platform', 'client', 'Changes guide'),
    guide('page:account.profile', 'platform', 'all', 'Profile guide'),
    guide('page:agency.home', 'platform', 'agency', 'Agency home guide'),
  ]);

  // Setup: an older done run, a newer one still searching, suggestions of both and of an older run (hidden), an invite.
  const run = async (status: 'done' | 'searching', hoursAgo: number) => (await dbs.owner.insert(discoveryRun).values({
    agencyId: IDS.agencyA, clientId: IDS.clientA1, trigger: 'auto', status, startedAt: new Date(Date.now() - hoursAgo * 3_600_000), finishedAt: status === 'done' ? new Date(Date.now() - (hoursAgo - 1) * 3_600_000) : null,
  }).returning({ id: discoveryRun.id }))[0]!.id;
  const oldRun = await run('done', 72);
  const doneRun = await run('done', 10);
  const newerRun = await run('searching', 2);
  const sug = (runId: string, name: string, tier: 'top' | 'watch' | 'minor', status: 'suggested' | 'accepted' = 'suggested') => ({
    agencyId: IDS.agencyA, clientId: IDS.clientA1, runId, name, placeId: `pl-${name}`, appearances: 3, overlapScore: 0.6, overlap: 0.6, status, tier, rating: 4.5, votes: 40, distanceKm: 3,
  });
  await dbs.owner.insert(competitorSuggestion).values([sug(oldRun, 'old', 'top'), sug(doneRun, 'alpha', 'top'), sug(doneRun, 'beta', 'watch', 'accepted'), sug(newerRun, 'gamma', 'minor')]);
  const [ct] = await dbs.owner.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'pat@x.co', name: 'Pat Owner', active: false }).returning();
  await dbs.owner.insert(clientSetup).values({ clientId: IDS.clientA1, agencyId: IDS.agencyA, invitedContactId: ct!.id, ownerPickRequestedAt: ago(1) });
  await dbs.owner.insert(invitation).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, email: 'Pat@x.co', role: 'client_owner', invitedBy: 'x', expiresAt: new Date(Date.now() + 5 * 86_400_000) });

  return { e1: e1.eventId, e2: e2.eventId, change1: e1.changeId, change2: e2.changeId, moveId, briefId: b!.id };
}

let w: World;
beforeEach(async () => {
  await resetWorkspace();
  w = await seedWorld();
});

const A1 = IDS.clientA1;
const B1 = IDS.clientB1;

describe('launch-gate 6a output parity (snapshot recorded before the change)', () => {
  it('get_event', async () => {
    expect({
      admin: await outcome(admin, 'get_event', { clientId: A1, eventId: w.e1 }),
      owner: await outcome(owner, 'get_event', { clientId: A1, eventId: w.e2 }),
      unknownEvent: await outcome(admin, 'get_event', { clientId: A1, eventId: UNKNOWN }),
      otherClient: await outcome(admin, 'get_event', { clientId: B1, eventId: w.e1 }),
      otherAgency: await outcome(otherAgency, 'get_event', { clientId: A1, eventId: w.e1 }),
    }).toMatchSnapshot();
  });

  it('compare_snapshots', async () => {
    expect({
      withEvidence: await outcome(admin, 'compare_snapshots', { clientId: A1, changeId: w.change1 }),
      noEvidence: await outcome(owner, 'compare_snapshots', { clientId: A1, changeId: w.change2 }),
      unknownChange: await outcome(admin, 'compare_snapshots', { clientId: A1, changeId: UNKNOWN }),
      wrongClient: await outcome(admin, 'compare_snapshots', { clientId: IDS.clientA2, changeId: w.change1 }),
      otherAgency: await outcome(otherAgency, 'compare_snapshots', { clientId: A1, changeId: w.change1 }),
    }).toMatchSnapshot();
  });

  it('search_events', async () => {
    expect({
      flagged: await outcome(admin, 'search_events', { clientId: A1 }),
      service: await outcome(admin, 'search_events', { clientId: A1, serviceId: 'ac_tune_up', route: 'all' }),
      query: await outcome(owner, 'search_events', { clientId: A1, query: 'promo', route: 'all' }),
      otherAgency: await outcome(otherAgency, 'search_events', { clientId: A1 }),
    }).toMatchSnapshot();
  });

  it('get_move', async () => {
    expect({
      admin: await outcome(admin, 'get_move', { clientId: A1, moveId: w.moveId }),
      unknown: await outcome(admin, 'get_move', { clientId: A1, moveId: UNKNOWN }),
      wrongClient: await outcome(admin, 'get_move', { clientId: IDS.clientA2, moveId: w.moveId }),
      otherAgency: await outcome(otherAgency, 'get_move', { clientId: A1, moveId: w.moveId }),
    }).toMatchSnapshot();
  });

  it('get_workspace_overview', async () => {
    expect({
      admin: await outcome(admin, 'get_workspace_overview', { clientId: A1 }),
      owner: await outcome(owner, 'get_workspace_overview', { clientId: A1 }),
      otherAgency: await outcome(otherAgency, 'get_workspace_overview', { clientId: A1 }),
    }).toMatchSnapshot();
  });

  it('get_brief', async () => {
    expect({
      admin: await outcome(admin, 'get_brief', { briefId: w.briefId }),
      owner: await outcome(owner, 'get_brief', { briefId: w.briefId }),
      unknown: await outcome(admin, 'get_brief', { briefId: UNKNOWN }),
      otherAgency: await outcome(otherAgency, 'get_brief', { briefId: w.briefId }),
    }).toMatchSnapshot();
  });

  it('get_ask_starters', async () => {
    expect({
      owner: await outcome(owner, 'get_ask_starters', { clientId: A1 }),
      genericA2: await outcome(ctx('agency_admin', 'all', ['ask']), 'get_ask_starters', { clientId: IDS.clientA2 }),
      otherAgency: await outcome(ctx('agency_admin', 'all', ['ask'], IDS.agencyB), 'get_ask_starters', { clientId: A1 }),
    }).toMatchSnapshot();
  });

  it('get_client_setup and list_competitor_suggestions', async () => {
    const out = {
      admin: await outcome(admin, 'get_client_setup', { clientId: A1 }),
      ownerPicking: await outcome(owner, 'get_client_setup', { clientId: A1 }),
      otherAgency: await outcome(otherAgency, 'get_client_setup', { clientId: A1 }),
      suggestions: await outcome(admin, 'list_competitor_suggestions', { clientId: A1 }),
    };
    await dbs.owner.update(clientSetup).set({ ownerPickRequestedAt: null }).where(eq(clientSetup.clientId, A1));
    expect({ ...out, ownerClosed: await outcome(owner, 'get_client_setup', { clientId: A1 }) }).toMatchSnapshot();
  });

  it('search_reviews', async () => {
    expect({
      all: await outcome(admin, 'search_reviews', { clientId: A1 }),
      self: await outcome(admin, 'search_reviews', { clientId: A1, business: 'self' }),
      badBusiness: await outcome(admin, 'search_reviews', { clientId: A1, business: UNKNOWN }),
      badTopic: await outcome(admin, 'search_reviews', { clientId: A1, topicId: 'no_such_topic' }),
      otherAgency: await outcome(otherAgency, 'search_reviews', { clientId: A1 }),
    }).toMatchSnapshot();
  });

  it('get_competitor_profile and get_competitor_timeline', async () => {
    expect({
      profile: await outcome(admin, 'get_competitor_profile', { clientId: A1, competitorId: IDS.competitorX }),
      profileUntracked: await outcome(admin, 'get_competitor_profile', { clientId: A1, competitorId: IDS.competitorY }),
      profileOtherAgency: await outcome(otherAgency, 'get_competitor_profile', { clientId: A1, competitorId: IDS.competitorX }),
      timeline: await outcome(owner, 'get_competitor_timeline', { clientId: A1, competitorId: IDS.competitorX, days: 30 }),
      timelineUntracked: await outcome(admin, 'get_competitor_timeline', { clientId: A1, competitorId: IDS.competitorY }),
      timelineOtherAgency: await outcome(otherAgency, 'get_competitor_timeline', { clientId: A1, competitorId: IDS.competitorX }),
    }).toMatchSnapshot();
  });

  it('list_help_guides and get_page_guide', async () => {
    expect({
      listAdmin: await outcome(admin, 'list_help_guides', { context: 'client', clientId: A1 }),
      listOwner: await outcome(owner, 'list_help_guides', { context: 'client', clientId: A1 }),
      listAgency: await outcome(admin, 'list_help_guides', { context: 'agency' }),
      listNoClient: await outcome(admin, 'list_help_guides', { context: 'client' }),
      listOtherAgency: await outcome(otherAgency, 'list_help_guides', { context: 'client', clientId: A1 }),
      pageAdmin: await outcome(admin, 'get_page_guide', { helpKey: 'page:client.overview', context: 'client', clientId: A1 }),
      pageOwner: await outcome(owner, 'get_page_guide', { helpKey: 'page:client.overview', context: 'client', clientId: A1 }),
      pageMissing: await outcome(admin, 'get_page_guide', { helpKey: 'page:client.nothing', context: 'client', clientId: A1 }),
      pageOtherAgency: await outcome(otherAgency, 'get_page_guide', { helpKey: 'page:client.overview', context: 'client', clientId: A1 }),
    }).toMatchSnapshot();
  });
});

/**
 * Launch-gate 6b: the rank tools (geo-grid, trend, share of voice, settings). Seeded on top of the 6a world: two
 * keywords, three finished scans (the oldest on another grid), a failed one, a map image, a tier, centre evidence.
 */
interface RankWorld { newest: string; middle: string; oldest: string }
async function seedRanks(): Promise<RankWorld> {
  await dbs.owner.update(client).set({ keywords: ['plumber', 'ac repair'], serviceArea: { center: { lat: 32, lng: -97 }, radiusKm: 25, zips: ['76048'] } }).where(eq(client.id, IDS.clientA1));
  await setPlace(IDS.competitorX, 'px');
  const ac = (selfRank: number) => gridSnapshots('ac repair', 3, (r, c) => (r === 2 && c === 2 ? null : [rr(1, r === 0 ? 'self-place' : 'px'), rr(2, 'o1'), rr(selfRank, r === 0 ? 'px' : 'self-place')]));
  const plumber = () => gridSnapshots('plumber', 3, () => [rr(1, 'o1'), rr(3, 'px')]);
  const oldest = await seedRankScan({ finishedAt: ago(20), snapshots: gridSnapshots('ac repair', 1, () => [rr(9, 'self-place')]) });
  const middle = await seedRankScan({ finishedAt: ago(13), snapshots: [...ac(4), ...plumber()], gridSize: 3, radiusKm: 25, keywords: ['ac repair', 'plumber'] });
  await seedRankScan({ finishedAt: ago(9), snapshots: ac(2), status: 'failed' });
  const newest = await seedRankScan({ finishedAt: ago(6), snapshots: [...ac(3), ...plumber()], gridSize: 3, radiusKm: 25, keywords: ['ac repair', 'plumber'] });
  const [self] = await dbs.owner.select({ id: client.selfCompetitorId }).from(client).where(eq(client.id, IDS.clientA1));
  const centre = await seedCapture({ competitorId: self!.id!, source: 'google_maps_rank', kinds: ['vendor_json'] });
  await dbs.owner.update(rankSnapshot).set({ captureId: centre.captureId })
    .where(and(eq(rankSnapshot.scanId, newest), eq(rankSnapshot.keyword, 'ac repair'), eq(rankSnapshot.lat, 31.99), eq(rankSnapshot.lng, -96.99)));
  await dbs.owner.insert(rankMapImage).values({
    clientId: IDS.clientA1, agencyId: IDS.agencyA, settingsHash: 'abcdef0123456789ffff', objectKey: 'rank-map/a1.png', bounds: { west: -97.01, south: 31.97, east: -96.97, north: 32.01 }, width: 800, height: 800,
  });
  await dbs.owner.insert(competitorSignal).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, tier: 'top', overlap: 0.5, activity: 0.5, signals: {} });
  return { newest, middle, oldest };
}

const am = ctx('account_manager', 'all');
const dashOwner = ctx('client_owner', [IDS.clientA1], ['dashboard']);
const otherDash = ctx('agency_admin', 'all', ['dashboard'], IDS.agencyB);
/** The weekly-limit label names a weekday relative to now: keep only whether it is set. */
const settled = (o: unknown) => (o && typeof o === 'object' && 'scan' in o
  ? { ...o, scan: { ...(o as { scan: object }).scan, label: (o as { scan: { label: unknown } }).scan.label === null ? null : '<label>' } }
  : o);

describe('launch-gate 6b output parity (snapshot recorded before the change)', () => {
  it('get_geogrid', async () => {
    const r = await seedRanks();
    expect({
      owner: await outcome(dashOwner, 'get_geogrid', { clientId: A1 }),
      rival: await outcome(am, 'get_geogrid', { clientId: A1, business: IDS.competitorX, keyword: 'plumber' }),
      middle: await outcome(am, 'get_geogrid', { clientId: A1, scanId: r.middle, keyword: 'ac repair' }),
      oldest: await outcome(am, 'get_geogrid', { clientId: A1, scanId: r.oldest }),
      unknownScan: await outcome(am, 'get_geogrid', { clientId: A1, scanId: UNKNOWN }),
      badBusiness: await outcome(am, 'get_geogrid', { clientId: A1, business: IDS.competitorY }),
      noKeywords: await outcome(am, 'get_geogrid', { clientId: IDS.clientA2 }),
      otherAgency: await outcome(otherDash, 'get_geogrid', { clientId: A1 }),
    }).toMatchSnapshot();
    await dbs.owner.delete(rankScan).where(eq(rankScan.clientId, A1));
    expect(await outcome(am, 'get_geogrid', { clientId: A1 })).toMatchSnapshot('no scan');
  });

  it('get_rank_trend and get_share_of_voice', async () => {
    const r = await seedRanks();
    expect({
      trend: await outcome(dashOwner, 'get_rank_trend', { clientId: A1, keyword: 'ac repair' }),
      trendPage: await outcome(am, 'get_rank_trend', { clientId: A1, keyword: 'plumber', limit: 1 }),
      trendBefore: await outcome(am, 'get_rank_trend', { clientId: A1, keyword: 'ac repair', before: r.middle }),
      trendUnknownCursor: await outcome(am, 'get_rank_trend', { clientId: A1, keyword: 'ac repair', before: UNKNOWN }),
      trendOtherAgency: await outcome(otherDash, 'get_rank_trend', { clientId: A1, keyword: 'ac repair' }),
      sov: await outcome(dashOwner, 'get_share_of_voice', { clientId: A1 }),
      sovKeyword: await outcome(am, 'get_share_of_voice', { clientId: A1, keyword: 'plumber', scans: 2 }),
      sovUnknownKeyword: await outcome(am, 'get_share_of_voice', { clientId: A1, keyword: 'nope' }),
      sovNoScans: await outcome(am, 'get_share_of_voice', { clientId: IDS.clientA2 }),
      sovOtherAgency: await outcome(otherDash, 'get_share_of_voice', { clientId: A1 }),
    }).toMatchSnapshot();
  });

  it('get_rank_settings', async () => {
    await seedRanks();
    const settings = async (c: AccessContext, clientId: string = A1) => settled(await outcome(c, 'get_rank_settings', { clientId }));
    const out: Record<string, unknown> = {
      available: await settings(admin),
      noKeywords: await settings(admin, IDS.clientA2),
      clientRole: await settings(dashOwner),
      otherAgency: await settings(otherAgency),
      unknown: await settings(admin, UNKNOWN),
    };
    await dbs.owner.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: A1, status: 'running', trigger: 'manual', startedAt: ago(0) });
    out.running = await settings(am);
    await dbs.owner.update(rankScan).set({ status: 'done', finishedAt: ago(0) }).where(and(eq(rankScan.clientId, A1), eq(rankScan.status, 'running')));
    out.weeklyLimit = await settings(am);
    await dbs.owner.update(client).set({ spendPausedAt: ago(0) }).where(eq(client.id, A1));
    out.spendPaused = await settings(am);
    await dbs.owner.update(client).set({ pausedAt: ago(0) }).where(eq(client.id, A1));
    out.paused = await settings(am);
    expect(out).toMatchSnapshot();
  });
});
