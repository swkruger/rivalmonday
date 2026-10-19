import {
  ad, agencyServiceable, client, clientServiceable, clientCompetitor, competitor, competitorSignal, detectedChange, type CompetitorSignalRow, competitorSource, competitorSuggestion, type Db,
  observation, type RankResult, rankScan, rankSnapshot, review, vendorTask,
} from '@cs/db';
import { TIER_LABELS } from '@cs/core';
import type { DiscoveryConfig } from '@cs/verticals';
import { and, desc, eq, inArray, isNotNull, notInArray, sql } from 'drizzle-orm';
import type { PackLoader } from '../rivals/run';
import { activityScore, median, rankWeight, tierFor } from '../rivals/score';
import { Signals } from '../rivals/signals';

const DAY_MS = 86_400_000;
type Tracked = { id: string; placeId: string | null; cid: string | null; domain: string | null; metaPageIds: string[]; googleAdvertiserIds: string[] };
type Snapshot = { results: RankResult[] };

/** Clients the weekly signals job rates: active only (prospects get no recurring work), never paused (9b) nor of a read_only/suspended agency (9a). */
export async function listSignalClients(db: Db): Promise<string[]> {
  return (await db.select({ id: client.id }).from(client).where(and(clientServiceable(client), agencyServiceable(client.agencyId)))).map((r) => r.id);
}

/** The snapshots of the client's most recent finished (`done`) rank scan; empty when it has none. */
async function latestSnapshotSet(db: Db, clientId: string): Promise<Snapshot[]> {
  const [last] = await db.select({ scanId: rankSnapshot.scanId }).from(rankSnapshot)
    .innerJoin(rankScan, eq(rankScan.id, rankSnapshot.scanId))
    .where(and(eq(rankSnapshot.clientId, clientId), eq(rankScan.status, 'done'))).orderBy(desc(rankSnapshot.capturedAt)).limit(1);
  if (!last?.scanId) return [];
  return db.select({ results: rankSnapshot.results }).from(rankSnapshot).where(and(eq(rankSnapshot.clientId, clientId), eq(rankSnapshot.scanId, last.scanId)));
}

/** Presence across the snapshot set and the rank-weighted share of snapshots the competitor appears in. */
function presenceOf(c: Tracked, snaps: Snapshot[]): { presence: Signals['presence']; overlap: number | null } {
  if (snaps.length === 0) return { presence: null, overlap: null };
  const same = (r: RankResult) => (c.placeId != null && r.placeId === c.placeId) || (c.cid != null && r.cid === c.cid) || (c.domain != null && r.domain === c.domain);
  let appeared = 0;
  let weight = 0;
  let bestRank: number | null = null;
  for (const s of snaps) {
    const ranks = s.results.filter(same).map((r) => r.rank);
    if (ranks.length === 0) continue;
    const best = Math.min(...ranks);
    appeared++;
    weight += rankWeight(best);
    bestRank = bestRank == null ? best : Math.min(bestRank, best);
  }
  return { presence: { searches: snaps.length, appeared, bestRank }, overlap: weight / snaps.length };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Signals for one tracked competitor from stored data. Null = never collected; 0/'none' = collected, nothing found. */
async function signalsFor(db: Db, c: Tracked, now: Date): Promise<Omit<Signals, 'presence'>> {
  // Raw sql params must be strings (postgres-js rejects a bare Date here).
  const d30 = sql`${new Date(now.getTime() - 30 * DAY_MS).toISOString()}::timestamptz`;
  const d90 = sql`${new Date(now.getTime() - 90 * DAY_MS).toISOString()}::timestamptz`;
  const [obs] = await db.select({ data: observation.data }).from(observation)
    .where(and(eq(observation.competitorId, c.id), eq(observation.kind, 'gbp_profile'))).orderBy(desc(observation.observedAt)).limit(1);
  const votes = num(obs?.data.votes);
  const claimed = obs?.data.isClaimed;

  const [rv] = await db.select({
    total: sql<number>`count(*)::int`,
    r30: sql<number>`count(*) FILTER (WHERE ${review.postedAt} >= ${d30})::int`,
    r90: sql<number>`count(*) FILTER (WHERE ${review.postedAt} >= ${d90})::int`,
    answered90: sql<number>`count(*) FILTER (WHERE ${review.postedAt} >= ${d90} AND btrim(coalesce(${review.ownerAnswer}, '')) <> '')::int`,
  }).from(review).where(eq(review.competitorId, c.id));
  const reviewsCollected = (rv?.total ?? 0) > 0 || (await db.select({ id: vendorTask.id }).from(vendorTask)
    .where(and(eq(vendorTask.competitorId, c.id), eq(vendorTask.kind, 'google_reviews'), eq(vendorTask.status, 'done'))).limit(1)).length > 0;

  const ads = await db.select({
    platform: ad.platform,
    total: sql<number>`count(*)::int`,
    active: sql<number>`count(*) FILTER (WHERE ${ad.isActive})::int`,
    new30d: sql<number>`count(*) FILTER (WHERE ${ad.firstSeenAt} >= ${d30})::int`,
  }).from(ad).where(eq(ad.competitorId, c.id)).groupBy(ad.platform);
  const sources = await db.select({ source: competitorSource.source, lastStatus: competitorSource.lastStatus }).from(competitorSource)
    .where(and(eq(competitorSource.competitorId, c.id), inArray(competitorSource.source, ['ads_google', 'ads_meta'])));
  const ranOk = (s: string) => sources.some((x) => x.source === s && x.lastStatus === 'ok');
  const adStats = (platform: 'google' | 'meta', source: string) => {
    const a = ads.find((x) => x.platform === platform);
    return a ?? (ranOk(source) ? { total: 0, active: 0, new30d: 0 } : null);
  };
  const g = adStats('google', 'ads_google');
  const m = adStats('meta', 'ads_meta');
  const account = (pinned: string[], source: string) => (pinned.length > 0 ? 'matched' as const : ranOk(source) ? 'none' as const : null);

  return {
    rating: num(obs?.data.rating), votes: votes == null ? null : Math.round(votes),
    reviews30d: reviewsCollected ? rv!.r30 : null, reviews90d: reviewsCollected ? rv!.r90 : null,
    replyRate: reviewsCollected && rv!.r90 > 0 ? rv!.answered90 / rv!.r90 : null,
    googleAdsActive: g?.active ?? null, googleAdsNew30d: g?.new30d ?? null, googleAccount: account(c.googleAdvertiserIds, 'ads_google'),
    metaPage: account(c.metaPageIds, 'ads_meta'), metaAdsActive: m?.active ?? null,
    claimed: typeof claimed === 'boolean' ? claimed : null, chain: null, categoryMatch: null, distanceKm: null,
  };
}

/**
 * Rates every competitor the client tracks from stored data (Phase 12a): signals as for suggestions, Overlap
 * from the client's suggestion for that place id, else rank-weighted presence in the latest rank scan, else
 * null (tier Minor). Upserts `competitor_signal` and deletes rows for competitors no longer tracked.
 */
export async function computeTrackedSignals(deps: { db: Db; packs: PackLoader; runbookTiers?: (clientId: string) => Promise<DiscoveryConfig['tiers'] | null> }, clientId: string, now: Date): Promise<CompetitorSignalRow[]> {
  const { db } = deps;
  const [c] = await db.select({ agencyId: client.agencyId, verticalId: client.verticalId, selfId: client.selfCompetitorId }).from(client).where(eq(client.id, clientId)).limit(1);
  if (!c) throw new Error(`client ${clientId} not found`);
  const tracked: Tracked[] = (await db.select({
    id: competitor.id, placeId: competitor.placeId, cid: competitor.cid, domain: competitor.domain,
    metaPageIds: competitor.metaPageIds, googleAdvertiserIds: competitor.googleAdvertiserIds,
  }).from(clientCompetitor).innerJoin(competitor, eq(competitor.id, clientCompetitor.competitorId))
    .where(eq(clientCompetitor.clientId, clientId))).filter((t) => t.id !== c.selfId);
  const tiers = (await deps.runbookTiers?.(clientId)) ?? (await deps.packs(c.verticalId)).discovery.tiers;

  const placeIds = tracked.flatMap((t) => (t.placeId ? [t.placeId] : []));
  const suggested = new Map((placeIds.length === 0 ? [] : await db.select({ placeId: competitorSuggestion.placeId, overlap: competitorSuggestion.overlap })
    .from(competitorSuggestion)
    .where(and(eq(competitorSuggestion.clientId, clientId), inArray(competitorSuggestion.placeId, placeIds), isNotNull(competitorSuggestion.overlap))))
    .map((r) => [r.placeId!, r.overlap!]));
  const snaps = await latestSnapshotSet(db, clientId);

  const rated: { id: string; signals: Signals; overlap: number | null }[] = [];
  for (const t of tracked) {
    const p = presenceOf(t, snaps);
    const signals = Signals.parse({ ...(await signalsFor(db, t, now)), presence: p.presence });
    rated.push({ id: t.id, signals, overlap: (t.placeId ? suggested.get(t.placeId) : undefined) ?? p.overlap });
  }
  const clientMedian = median(rated.flatMap((r) => (r.signals.reviews30d == null ? [] : [r.signals.reviews30d])));

  return db.transaction(async (tx) => {
    const out: CompetitorSignalRow[] = [];
    // Phase 13b P9: read the previous tiers first; a changed tier is recorded against the latest finished scan (skipped/failed scans never count).
    const before = new Map((await tx.select({ competitorId: competitorSignal.competitorId, tier: competitorSignal.tier }).from(competitorSignal)
      .where(eq(competitorSignal.clientId, clientId))).map((r) => [r.competitorId, r.tier]));
    const [lastScan] = await tx.select({ id: rankScan.id }).from(rankScan)
      .where(and(eq(rankScan.clientId, clientId), eq(rankScan.status, 'done'))).orderBy(desc(rankScan.startedAt)).limit(1);
    for (const r of rated) {
      const activity = activityScore(r.signals, clientMedian);
      const row = { agencyId: c.agencyId, clientId, competitorId: r.id, overlap: r.overlap, activity, tier: r.overlap == null ? 'minor' as const : tierFor(r.overlap, activity, tiers), signals: r.signals, computedAt: now };
      const [saved] = await tx.insert(competitorSignal).values(row).onConflictDoUpdate({
        target: [competitorSignal.clientId, competitorSignal.competitorId],
        set: { overlap: row.overlap, activity: row.activity, tier: row.tier, signals: row.signals, computedAt: row.computedAt },
      }).returning();
      out.push(saved!);
      const from = before.get(r.id);
      if (lastScan && from && from !== row.tier) {
        await tx.insert(detectedChange).values({
          source: 'rank', kind: 'modified', rankScanId: lastScan.id, agencyId: c.agencyId, clientId, competitorId: r.id,
          blockKey: `tier:${now.toISOString().slice(0, 10)}`, beforeText: TIER_LABELS[from], afterText: TIER_LABELS[row.tier],
          details: { changeType: 'tier_change', from, to: row.tier }, stageVersion: 1,
        }).onConflictDoNothing();
      }
    }
    const keep = rated.map((r) => r.id);
    await tx.delete(competitorSignal).where(and(eq(competitorSignal.clientId, clientId), ...(keep.length > 0 ? [notInArray(competitorSignal.competitorId, keep)] : [])));
    return out;
  });
}
