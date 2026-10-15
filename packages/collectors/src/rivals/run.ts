import type { CallScope } from '@cs/core';
import { agencyServiceable, client, competitor, competitorSuggestion, type Db, discoveryRun, type DiscoveryRunProgress, type DiscoveryRunStatus, type DiscoveryRunRow, observation } from '@cs/db';
import type { DiscoveryConfig, VerticalPack } from '@cs/verticals';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { normalizeGoogleAd } from '../ads/google';
import { employerMatches } from '../jobs/collect';
import { gridPoints } from '../local/grid';
import { mapsSearch } from '../local/maps';
import { type DataForSeoClient, DFS_US, isDfsOk, isNoResults, isRetryableDfsCode, VendorError } from '../vendors/dataforseo';
import { searchGoogleAdvertisers } from '../vendors/dataforseo-advertisers';
import { type MetaPageHit, type MetaSearchDeps, metaSearchWorstCaseUsd, searchMetaPages } from '../vendors/meta-search';
import { detectChains } from './chain';
import { DISCOVERY_CALL_COST_USD as COST, estimateCostUsd } from './cost';
import { type Candidate, filterCandidates, type HiddenReason, type KeptCandidate } from './filters';
import { matchAdAccount } from './match';
import { normaliseName } from './names';
import { patchSuggestionSignals, postReviewSamples } from './review-sample';
import { activityScore, median, overlapScores, tierFor } from './score';
import { type AdMatch, Signals } from './signals';

/** Loads a vertical pack by id (`loadVerticalPack` in production). */
export type PackLoader = (verticalId: string) => Promise<VerticalPack>;
export type RivalSearchDeps = { db: Db; dfs: DataForSeoClient; meta: MetaSearchDeps; packs: PackLoader; now?: () => Date };
export { postReviewSamples };

type Progress = DiscoveryRunProgress & { searchesDone: number; searchesTotal: number; checksDone: number; checksTotal: number; hiddenList?: { name: string; reason: HiddenReason }[] };

const MAX_KEYWORDS = 5;
const MAPS_DEPTH = 20;
const ADS_DEPTH = 40;
const PROGRESS_EVERY = 10;
const HIDDEN_LIST_MAX = 50;
const DAY_MS = 86_400_000;
const NEW_AD_DAYS = 30;
const HIDDEN_REASONS: HiddenReason[] = ['wrong_category', 'outside_area', 'self', 'closed', 'thin'];
const LIVE = ['queued', 'searching', 'checking', 'finalising'] as const;
/** Sweep thresholds: a run still queued/searching/checking after 2 h is dead; one finalising for 1 h is force-finalised. */
const STALE_LIVE_MS = 2 * 60 * 60_000;
const STALE_FINALISING_MS = 60 * 60_000;
const NULL_REVIEWS = { reviews30d: null, reviews90d: null, replyRate: null };
/** Deterministic tie-break for the shortlist order (byte order, like SQL `COLLATE "C"`). */
const byteOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Client keywords first, then pack seeds; case-insensitive dedupe; at most 5. */
export function planKeywords(clientKeywords: string[], seeds: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of [...clientKeywords, ...seeds]) {
    const t = k.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out.slice(0, MAX_KEYWORDS);
}

/** Over the cap: the fallback grid first, then drop keywords from the end (at least one stays). */
export function planSearch(keywords: string[], cfg: DiscoveryConfig): { keywords: string[]; gridSize: number } {
  let gridSize = cfg.grid.size;
  const kws = [...keywords];
  const est = () => estimateCostUsd({ searches: kws.length * gridSize * gridSize, shortlist: cfg.shortlist });
  if (est() > cfg.cost_cap_usd) gridSize = cfg.grid.fallback_size;
  while (est() > cfg.cost_cap_usd && kws.length > 1) kws.pop();
  return { keywords: kws, gridSize };
}

async function agencyIsServiceable(db: Db, agencyId: string): Promise<boolean> {
  const [r] = (await db.execute(sql`SELECT ${agencyServiceable(sql`${agencyId}::uuid`)} AS ok`)) as unknown as { ok: boolean }[];
  return r?.ok === true;
}

/** Fails a run that is still live (a finished run is left alone). */
export async function finishFailed(db: Db, runId: string, error: string, extra: Partial<DiscoveryRunRow> = {}): Promise<void> {
  await db.update(discoveryRun).set({ ...extra, status: 'failed', error, finishedAt: sql`now()` })
    .where(and(eq(discoveryRun.id, runId), inArray(discoveryRun.status, [...LIVE])));
}

/** The client's own business, for the `self` filter: client place id plus the self competitor's cid/domain/phone. */
async function selfContext(db: Db, c: typeof client.$inferSelect) {
  const self = { placeId: c.placeId, cid: null as string | null, domain: null as string | null, phone: null as string | null };
  if (!c.selfCompetitorId) return self;
  const [comp] = await db.select().from(competitor).where(eq(competitor.id, c.selfCompetitorId)).limit(1);
  if (!comp) return self;
  const [obs] = await db.select({ data: observation.data }).from(observation)
    .where(and(eq(observation.competitorId, comp.id), eq(observation.kind, 'gbp_profile'))).orderBy(desc(observation.observedAt)).limit(1);
  const phone = obs?.data.phone;
  return { placeId: self.placeId ?? comp.placeId, cid: comp.cid, domain: comp.domain, phone: typeof phone === 'string' ? phone : null };
}

export async function runRivalSearch(deps: RivalSearchDeps, runId: string): Promise<{ status: 'done' | 'failed' | 'finalising' }> {
  const [run] = await deps.db.select().from(discoveryRun).where(eq(discoveryRun.id, runId)).limit(1);
  if (!run) throw new Error(`discovery run ${runId} not found`);
  if (run.status === 'done' || run.status === 'failed' || run.status === 'finalising') return { status: run.status };
  try {
    return await execute(deps, run);
  } catch (err) {
    // Never leave a run stuck live (it blocks the client's next run via discovery_run_one_live).
    await finishFailed(deps.db, run.id, 'internal_error');
    throw err;
  }
}

async function execute(deps: RivalSearchDeps, run: DiscoveryRunRow): Promise<{ status: 'done' | 'failed' | 'finalising' }> {
  const { db } = deps;
  const now = deps.now?.() ?? new Date();
  const [c] = await db.select().from(client).where(eq(client.id, run.clientId)).limit(1);
  const area = c?.serviceArea;
  if (!c || !area) {
    await finishFailed(db, run.id, 'missing_profile');
    return { status: 'failed' };
  }
  // 9a/9b: a run queued before its agency went read_only/suspended or its client was paused spends nothing.
  // Prospects may search (12a D4), so this checks the pause, not `status = 'active'`.
  if (c.pausedAt !== null || !(await agencyIsServiceable(db, run.agencyId))) {
    await finishFailed(db, run.id, 'service_paused');
    return { status: 'failed' };
  }
  const cfg = (await deps.packs(c.verticalId)).discovery;
  const { keywords, gridSize } = planSearch(planKeywords(c.keywords, cfg.seed_keywords), cfg);
  if (estimateCostUsd({ searches: keywords.length * gridSize * gridSize, shortlist: cfg.shortlist }) > cfg.cost_cap_usd) {
    // Even one keyword on the fallback grid would overspend: fail before any vendor call.
    await finishFailed(db, run.id, 'cost_cap', { keywords, gridSize });
    return { status: 'failed' };
  }
  const points = gridPoints(area.center, area.radiusKm, gridSize);
  const scope: CallScope = { agencyId: run.agencyId, clientId: run.clientId };
  const progress: Progress = { searchesDone: 0, searchesTotal: keywords.length * points.length, checksDone: 0, checksTotal: 0 };
  // Every write is conditional on the run still being in the stage we expect: the sweep (or anything else)
  // may have failed it meanwhile, and a stopped run must never be resurrected or spend more. 0 rows → stop.
  const advance = async (from: DiscoveryRunStatus[], patch: Partial<DiscoveryRunRow>) =>
    (await db.update(discoveryRun).set(patch).where(and(eq(discoveryRun.id, run.id), inArray(discoveryRun.status, from))).returning({ id: discoveryRun.id })).length > 0;
  const STOPPED = { status: 'failed' } as const;
  if (!(await advance(['queued', 'searching', 'checking'], { status: 'searching', keywords, gridSize, progress }))) return STOPPED;
  const self = await selfContext(db, c);

  // Stage 1: wide Maps search, keyword × grid point.
  let spent = 0;
  let succeeded = 0;
  const cands: Candidate[] = [];
  const cities = new Map<string, string | null>();
  for (const keyword of keywords) {
    for (const pt of points) {
      spent += COST.maps;
      try {
        const { places } = await mapsSearch(deps.dfs, { keyword, lat: pt.lat, lng: pt.lng, depth: MAPS_DEPTH }, scope);
        succeeded++;
        for (const p of places) {
          if (!p.placeId) continue; // suggestions are keyed by place id
          if (!cities.has(p.placeId)) cities.set(p.placeId, p.city ?? null);
          cands.push({
            placeId: p.placeId, cid: p.cid, name: p.title, category: p.category, additionalCategories: p.additionalCategories ?? [],
            lat: p.lat, lng: p.lng, rating: p.rating, votes: p.votes, domain: p.domain, phone: p.phone ?? null,
            isClaimed: p.isClaimed ?? null, closed: p.closed ?? false, ranks: [p.rank],
          });
        }
      } catch (err) {
        if (!(err instanceof VendorError)) throw err;
        console.warn(`[discovery] run ${run.id} "${keyword}" @ ${pt.lat},${pt.lng}: ${err.message} (code ${err.code ?? 'n/a'})`);
      }
      progress.searchesDone++;
      if (progress.searchesDone % PROGRESS_EVERY === 0 && !(await advance(['searching'], { progress }))) return STOPPED;
    }
  }
  if (progress.searchesTotal === 0 || succeeded * 2 < progress.searchesTotal) {
    await finishFailed(db, run.id, 'search_failed', { progress, costUsd: spent });
    return { status: 'failed' };
  }

  // Filters, Overlap, shortlist.
  const { kept, hidden } = filterCandidates(cands, { pack: cfg, area, self });
  const hiddenCounts = Object.fromEntries(HIDDEN_REASONS.map((r) => [r, hidden.filter((h) => h.reason === r).length]));
  progress.hiddenList = hidden.slice(0, HIDDEN_LIST_MAX).map((h) => ({ name: h.candidate.name, reason: h.reason }));
  const overlap = overlapScores(kept, succeeded, area.radiusKm);
  const chains = detectChains(cands.map((x) => ({ name: x.name, placeId: x.placeId })));
  const ranked = [...kept].sort((a, b) => (overlap.get(b.placeId) ?? 0) - (overlap.get(a.placeId) ?? 0) || byteOrder(a.placeId, b.placeId));
  // Dismissed suggestions are still refreshed below but never cost stage-2 checks.
  const dismissed = new Set((await db.select({ placeId: competitorSuggestion.placeId }).from(competitorSuggestion)
    .where(and(eq(competitorSuggestion.clientId, run.clientId), eq(competitorSuggestion.status, 'dismissed')))).map((r) => r.placeId));
  const eligible = ranked.filter((k) => !dismissed.has(k.placeId));
  let n = Math.min(cfg.shortlist, eligible.length);
  while (n > 0 && spent + estimateCostUsd({ searches: 0, shortlist: n }) > cfg.cost_cap_usd) n--;
  const shortlist = eligible.slice(0, n);
  progress.checksTotal = n;

  // Still live? (checked before any suggestion is written or stage 2 spends anything)
  if (!(await advance(['searching'], { status: 'checking', kept: kept.length, hidden: hiddenCounts, progress, costUsd: spent }))) return STOPPED;
  const ids = await upsertSuggestions(db, run, ranked, { overlap, chains, shortlisted: new Set(shortlist.map((s) => s.placeId)), searches: succeeded });
  progress.shortlistIds = shortlist.map((s) => ids.get(s.placeId)!);
  if (!(await advance(['checking'], { progress }))) return STOPPED;

  // Stage 2: signal checks on the shortlist.
  for (const [i, cand] of shortlist.entries()) {
    const ctx = { name: cand.name, city: cities.get(cand.placeId) ?? null, domain: cand.domain, chain: chains.has(normaliseName(cand.name)) };
    const at = { lat: cand.lat ?? area.center.lat, lng: cand.lng ?? area.center.lng };
    const google = await googleCheck(deps.dfs, ctx, at, scope, now);
    spent += google.cost;
    // Meta only when its worst case (ScrapeCreators fails, Apify answers) still leaves room for the later candidates'
    // Google checks and every shortlisted review sample; otherwise it stays unchecked (null), never zero.
    const reserved = (shortlist.length - i - 1) * (COST.advertisers + COST.ads) + shortlist.length * COST.reviews;
    const meta = spent + metaSearchWorstCaseUsd() + reserved <= cfg.cost_cap_usd ? await metaCheck(deps.meta, ctx, scope) : UNCHECKED_META;
    spent += meta.cost;
    const id = ids.get(cand.placeId)!;
    await patchSuggestionSignals(db, [id], { ...google.signals, ...meta.signals });
    await db.update(competitorSuggestion).set({ adMatches: [...google.matches, ...meta.matches] }).where(eq(competitorSuggestion.id, id));
    progress.checksDone++;
    if (!(await advance(['checking'], { progress, costUsd: spent }))) return STOPPED;
  }
  await postReviewSamples(deps, run.id, shortlist.map((s) => ({ id: ids.get(s.placeId)!, placeId: s.placeId })));
  spent += shortlist.length * COST.reviews;
  if (!(await advance(['checking'], { status: 'finalising', progress, costUsd: spent }))) return STOPPED;
  const fin = await finaliseRivalSearch(deps, run.id, { force: false });
  return { status: fin === 'done' ? 'done' : 'finalising' };
}

/**
 * Upsert on (client_id, place_id): every discovery column is refreshed and `run_id` points at this run;
 * `status` is never touched (dismissed stays dismissed). Shortlisted rows leave the review keys out of
 * `signals` until their sample lands; the rest have them null (not checked) and stay Minor.
 */
async function upsertSuggestions(
  db: Db, run: DiscoveryRunRow, ranked: KeptCandidate[],
  o: { overlap: Map<string, number>; chains: Set<string>; shortlisted: Set<string>; searches: number },
): Promise<Map<string, string>> {
  if (ranked.length === 0) return new Map();
  const rows = ranked.map((k) => {
    const ov = o.overlap.get(k.placeId) ?? 0;
    const signals: Record<string, unknown> = {
      rating: k.rating, votes: k.votes == null ? null : Math.round(k.votes),
      googleAdsActive: null, googleAdsNew30d: null, googleAccount: null, metaPage: null, metaAdsActive: null,
      claimed: k.isClaimed, chain: o.chains.has(normaliseName(k.name)), categoryMatch: k.categoryMatch, distanceKm: k.distanceKm,
      presence: { searches: o.searches, appeared: k.ranks.length, bestRank: k.ranks.length ? Math.min(...k.ranks) : null },
      ...(o.shortlisted.has(k.placeId) ? {} : NULL_REVIEWS),
    };
    return {
      agencyId: run.agencyId, clientId: run.clientId, name: k.name, domain: k.domain, placeId: k.placeId, cid: k.cid,
      rating: k.rating, votes: k.votes == null ? null : Math.round(k.votes), appearances: k.ranks.length,
      bestRank: k.ranks.length ? Math.min(...k.ranks) : null, overlapScore: ov,
      runId: run.id, category: k.category, distanceKm: k.distanceKm, overlap: ov, activity: null, tier: 'minor' as const,
      signals, adMatches: [], lastSeenAt: sql`now()`,
    };
  });
  const ex = (col: string) => sql.raw(`excluded.${col}`);
  const out = await db.insert(competitorSuggestion).values(rows).onConflictDoUpdate({
    target: [competitorSuggestion.clientId, competitorSuggestion.placeId],
    set: {
      name: ex('name'), domain: ex('domain'), cid: ex('cid'), rating: ex('rating'), votes: ex('votes'), appearances: ex('appearances'),
      bestRank: ex('best_rank'), overlapScore: ex('overlap_score'), runId: ex('run_id'), category: ex('category'), distanceKm: ex('distance_km'),
      overlap: ex('overlap'), activity: ex('activity'), tier: ex('tier'), signals: ex('signals'), adMatches: ex('ad_matches'), lastSeenAt: ex('last_seen_at'),
    },
  }).returning({ id: competitorSuggestion.id, placeId: competitorSuggestion.placeId });
  return new Map(out.map((r) => [r.placeId!, r.id]));
}

type MatchCtx = { name: string; city: string | null; domain: string | null; chain: boolean };

/** Active and new-in-30-days creatives from one `ads_search` call. 40102 → zero. */
async function countGoogleAds(
  dfs: DataForSeoClient, req: Record<string, unknown>, keep: (advertiserId: string | null, title: string | null) => boolean, scope: CallScope, now: Date,
): Promise<{ active: number; new30d: number }> {
  const [task] = await dfs.post('/serp/google/ads_search/live/advanced', [{ ...req, location_code: DFS_US.location_code, depth: ADS_DEPTH }], scope);
  if (!task) throw new VendorError('dataforseo', null, 'empty task', false);
  if (isNoResults(task)) return { active: 0, new30d: 0 };
  if (!isDfsOk(task.statusCode)) throw new VendorError('dataforseo', task.statusCode, task.statusMessage, isRetryableDfsCode(task.statusCode));
  let active = 0;
  let new30d = 0;
  for (const item of (task.result[0] as { items?: unknown[] } | undefined)?.items ?? []) {
    const a = normalizeGoogleAd(item, now);
    if (!a || !keep(a.advertiserId, a.title)) continue;
    if (a.isActive) active++;
    if (a.startedAt && now.getTime() - a.startedAt.getTime() <= NEW_AD_DAYS * DAY_MS) new30d++;
  }
  return { active, new30d };
}

/**
 * Google: advertiser lookup by name near the candidate → strong accounts' creatives by id; otherwise the
 * domain fallback filtered by name. Weak-only with no domain leaves the counts null (unconfirmed, not zero).
 */
async function googleCheck(dfs: DataForSeoClient, c: MatchCtx, at: { lat: number; lng: number }, scope: CallScope, now: Date) {
  let cost = COST.advertisers;
  let account: 'matched' | 'possible' | 'none' | null = null;
  const matches: AdMatch[] = [];
  try {
    for (const a of await searchGoogleAdvertisers(dfs, { name: c.name, lat: at.lat, lng: at.lng }, scope)) {
      const s = matchAdAccount(c, a);
      if (s !== 'none') matches.push({ platform: 'google', accountId: a.id, name: a.name, strength: s });
    }
    account = matches.some((m) => m.strength === 'strong') ? 'matched' : matches.length > 0 ? 'possible' : 'none';
  } catch (err) {
    console.warn(`[discovery] advertisers "${c.name}": ${err instanceof Error ? err.message : String(err)}`);
  }
  const strong = matches.filter((m) => m.strength === 'strong').map((m) => m.accountId).slice(0, 25);
  let counts: { active: number; new30d: number } | null = null;
  if (strong.length > 0 || c.domain) {
    cost += COST.ads;
    try {
      counts = strong.length > 0
        ? await countGoogleAds(dfs, { advertiser_ids: strong }, (id) => id !== null && strong.includes(id), scope, now)
        : await countGoogleAds(dfs, { target: c.domain }, (_id, title) => employerMatches(title, c.name), scope, now);
    } catch (err) {
      console.warn(`[discovery] ads_search "${c.name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  } else if (account === 'none') {
    counts = { active: 0, new30d: 0 }; // no account and no site to search: checked, nothing found
  }
  return { cost, matches, signals: { googleAccount: account, googleAdsActive: counts?.active ?? null, googleAdsNew30d: counts?.new30d ?? null } };
}

const UNCHECKED_META = { cost: 0, matches: [] as AdMatch[], signals: { metaPage: null, metaAdsActive: null } };

/**
 * Meta Ad Library search by name → pages matched like ad accounts. Strong pages' active ads count; weak-only stays null.
 * Cost is the estimate of the vendor calls actually made (ScrapeCreators per call, Apify per ad).
 */
async function metaCheck(meta: MetaSearchDeps, c: MatchCtx, scope: CallScope) {
  const matches: AdMatch[] = [];
  let pages: MetaPageHit[] | null = null;
  let cost = 0;
  try {
    ({ pages, costUsd: cost } = await searchMetaPages(meta, { name: c.name, country: 'US' }, scope));
  } catch (err) {
    console.warn(`[discovery] meta "${c.name}": ${err instanceof Error ? err.message : String(err)}`);
  }
  if (pages === null) return { cost, matches, signals: { metaPage: null, metaAdsActive: null } };
  let strongAds = 0;
  for (const p of pages) {
    const s = matchAdAccount(c, { name: p.pageName, domain: null });
    if (s === 'none') continue;
    matches.push({ platform: 'meta', accountId: p.pageId, name: p.pageName, strength: s });
    if (s === 'strong') strongAds += p.activeAds;
  }
  const page = matches.some((m) => m.strength === 'strong') ? 'matched' : matches.length > 0 ? 'possible' : 'none';
  return { cost, matches, signals: { metaPage: page, metaAdsActive: page === 'matched' ? strongAds : page === 'none' ? 0 : null } };
}

/**
 * Recomputes Activity and Tier for the run's shortlist (`progress.shortlistIds`, the suggestions stage 2
 * checked) and finishes the run. Waits while a review sample is still out, unless `force` (30 min passed),
 * which sets the missing review signals null. A failed run returns 'done' untouched; a `done` run is
 * recomputed, so a late same-run review sample still updates its suggestion's Activity/Tier. A forced
 * finalise that throws fails the run (`internal_error`) so it can't stay live.
 */
export async function finaliseRivalSearch(deps: RivalSearchDeps, runId: string, opts: { force: boolean }): Promise<'done' | 'waiting'> {
  const [run] = await deps.db.select().from(discoveryRun).where(eq(discoveryRun.id, runId)).limit(1);
  if (!run) throw new Error(`discovery run ${runId} not found`);
  if (run.status === 'failed') return 'done';
  if (run.status === 'done') {
    await recomputeShortlist(deps, run, { force: true });
    return 'done';
  }
  if (run.status !== 'finalising') return 'waiting';
  try {
    return await recomputeShortlist(deps, run, opts);
  } catch (err) {
    if (opts.force) await finishFailed(deps.db, run.id, 'internal_error');
    throw err;
  }
}

async function recomputeShortlist(deps: RivalSearchDeps, run: DiscoveryRunRow, opts: { force: boolean }): Promise<'done' | 'waiting'> {
  const { db } = deps;
  const ids = run.progress.shortlistIds ?? [];
  // A suggestion a newer run has since claimed (run_id moved on) belongs to that run, not this one.
  const short = ids.length === 0 ? [] : await db.select({ id: competitorSuggestion.id, overlap: competitorSuggestion.overlap, signals: competitorSuggestion.signals })
    .from(competitorSuggestion).where(and(inArray(competitorSuggestion.id, ids), eq(competitorSuggestion.runId, run.id)));
  if (!opts.force && short.some((r) => r.signals.reviews30d === undefined)) return 'waiting';
  const [c] = await db.select({ verticalId: client.verticalId }).from(client).where(eq(client.id, run.clientId)).limit(1);
  if (!c) throw new Error(`client ${run.clientId} not found`);
  const { tiers } = (await deps.packs(c.verticalId)).discovery;
  const filled = short.map((r) => ({ ...r, signals: Signals.parse({ ...NULL_REVIEWS, ...r.signals }) }));
  const runMedian = median(filled.flatMap((r) => (r.signals.reviews30d == null ? [] : [r.signals.reviews30d])));
  await db.transaction(async (tx) => {
    for (const r of filled) {
      const activity = activityScore(r.signals, runMedian);
      await tx.update(competitorSuggestion).set({ signals: r.signals, activity, tier: tierFor(r.overlap ?? 0, activity, tiers) }).where(eq(competitorSuggestion.id, r.id));
    }
    await tx.update(discoveryRun).set({ status: 'done', finishedAt: sql`now()` }).where(and(eq(discoveryRun.id, run.id), eq(discoveryRun.status, 'finalising')));
  });
  return 'done';
}

/**
 * Cron backstop (`rival-sweep`): a run still queued/searching/checking 2 h after it started is failed
 * `stale` (its job died); one still finalising after 1 h is force-finalised. One failure never stops the rest.
 */
export async function sweepRivalRuns(deps: RivalSearchDeps, now: Date): Promise<{ stale: number; finalised: number }> {
  const stale = await deps.db.update(discoveryRun).set({ status: 'failed', error: 'stale', finishedAt: sql`now()` })
    .where(and(inArray(discoveryRun.status, ['queued', 'searching', 'checking']), lt(discoveryRun.startedAt, new Date(now.getTime() - STALE_LIVE_MS))))
    .returning({ id: discoveryRun.id });
  const due = await deps.db.select({ id: discoveryRun.id }).from(discoveryRun)
    .where(and(eq(discoveryRun.status, 'finalising'), lt(discoveryRun.startedAt, new Date(now.getTime() - STALE_FINALISING_MS))));
  let finalised = 0;
  for (const r of due) {
    try {
      if ((await finaliseRivalSearch(deps, r.id, { force: true })) === 'done') finalised++;
    } catch (err) {
      console.warn(`[discovery] sweep: force finalise of run ${r.id} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { stale: stale.length, finalised };
}
