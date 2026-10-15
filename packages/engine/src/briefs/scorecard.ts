import { ad, capture, client, clientCompetitor, competitor, competitorSignal, type Db, evidence, rankScan, rankSnapshot } from '@cs/db';
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ratingTrend } from '../reviews/rating-trend';
import { competitorMatcher, rankMetrics } from '../structured/rank';
import type { PackLoader } from '../tag/tag-stage';

export const ScorecardMetric = z.enum(['rating', 'reviews90d', 'replyRate', 'mapTop3Share', 'adsActive', 'metaAdsActive']);
export type ScorecardMetric = z.infer<typeof ScorecardMetric>;
export const Scorecard = z.object({
  asOf: z.string(), baselineBriefId: z.uuid().nullable(), // null on the starting point itself
  tiles: z.array(z.object({ metric: ScorecardMetric, you: z.number().nullable(), rivalMedian: z.number().nullable(), deltaSinceStart: z.number().nullable() })).length(4),
  rows: z.array(z.object({
    competitorId: z.uuid().nullable(), name: z.string(), self: z.boolean(), tier: z.enum(['top', 'watch', 'minor']).nullable(),
    values: z.record(ScorecardMetric, z.number().nullable()),
  })),
  evidenceIds: z.array(z.uuid()),
  openFirstMoves: z.array(z.object({ recommendationId: z.uuid(), title: z.string() })).default([]),
});
export type Scorecard = z.infer<typeof Scorecard>;

const TILE_METRICS = ['rating', 'reviews90d', 'replyRate', 'mapTop3Share'] as const satisfies readonly ScorecardMetric[];
const TIER_ORDER: Record<string, number> = { top: 0, watch: 1, minor: 2 };
export const SCORECARD_EVIDENCE_CAP = 50;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Median of the non-null values; null when there are none. */
export function median(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

const count = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/**
 * The starting-point / weekly scorecard: the client (row first) against every tracked competitor (by tier, then name) on rating,
 * 90-day reviews, reply rate and map-pack top-3 share, plus the ad counts. `null` = not measured, never 0.
 */
export async function buildScorecard(
  deps: { db: Db; packs: PackLoader },
  clientId: string,
  opts: { now?: Date; baseline?: Scorecard | null; openFirstMoves?: { recommendationId: string; title: string }[] } = {},
): Promise<Scorecard> {
  const now = opts.now ?? new Date();
  const [c] = await deps.db.select().from(client).where(eq(client.id, clientId)).limit(1);
  if (!c) throw new Error(`client ${clientId} not found`);

  const trend = await ratingTrend({ db: deps.db }, clientId, { now });
  const ids = trend.businesses.map((b) => b.competitorId);
  const comps = ids.length > 0
    ? await deps.db.select({ id: competitor.id, placeId: competitor.placeId, cid: competitor.cid, domain: competitor.domain }).from(competitor).where(inArray(competitor.id, ids))
    : [];
  const signals = await deps.db
    .select({ competitorId: competitorSignal.competitorId, tier: competitorSignal.tier, signals: competitorSignal.signals })
    .from(competitorSignal).where(eq(competitorSignal.clientId, clientId));
  const tracked = await deps.db.select({ id: clientCompetitor.competitorId }).from(clientCompetitor).where(eq(clientCompetitor.clientId, clientId));
  const trackedIds = new Set(tracked.map((t) => t.id));

  // Map pack: the latest finished scan.
  const [scan] = await deps.db
    .select({ id: rankScan.id }).from(rankScan)
    .where(and(eq(rankScan.clientId, clientId), eq(rankScan.status, 'done'), isNotNull(rankScan.finishedAt)))
    .orderBy(desc(rankScan.finishedAt)).limit(1);
  const snaps = scan ? await deps.db.select({ results: rankSnapshot.results, captureId: rankSnapshot.captureId }).from(rankSnapshot).where(eq(rankSnapshot.scanId, scan.id)) : [];

  const top3 = (id: string): number | null => {
    const comp = comps.find((x) => x.id === id);
    if (!comp || snaps.length === 0 || (!comp.placeId && !comp.cid && !comp.domain)) return null;
    return rankMetrics(snaps.map((s) => s.results), competitorMatcher(comp)).top3Share;
  };

  // The client's own ads: counted only when an ads source has been checked for it (never coerced to 0).
  const selfAds = async (platform: 'google' | 'meta'): Promise<number | null> => {
    if (!c.selfCompetitorId) return null;
    const source = platform === 'google' ? 'google_ads' : 'meta_ads';
    const [checked] = await deps.db.select({ n: sql<number>`count(*)::int` }).from(capture).where(and(eq(capture.competitorId, c.selfCompetitorId), eq(capture.source, source), eq(capture.status, 'ok')));
    const [rows] = await deps.db.select({ total: sql<number>`count(*)::int`, active: sql<number>`count(*) FILTER (WHERE ${ad.isActive})::int` }).from(ad).where(and(eq(ad.competitorId, c.selfCompetitorId), eq(ad.platform, platform)));
    return Number(checked?.n ?? 0) > 0 || Number(rows?.total ?? 0) > 0 ? Number(rows?.active ?? 0) : null;
  };
  const [selfGoogle, selfMeta] = c.selfCompetitorId ? await Promise.all([selfAds('google'), selfAds('meta')]) : [null, null];

  const rows = trend.businesses
    .filter((b) => b.self || trackedIds.has(b.competitorId))
    .map((b) => {
      const sig = signals.find((s) => s.competitorId === b.competitorId);
      return {
        b, tier: b.self ? null : (sig?.tier ?? null),
        values: {
          rating: b.rating, reviews90d: b.reviews90d, replyRate: b.replyRate, mapTop3Share: top3(b.competitorId),
          adsActive: b.self ? selfGoogle : count(sig?.signals?.googleAdsActive), metaAdsActive: b.self ? selfMeta : count(sig?.signals?.metaAdsActive),
        } satisfies Record<ScorecardMetric, number | null>,
      };
    })
    .sort((x, y) => {
      if (x.b.self !== y.b.self) return x.b.self ? -1 : 1;
      const t = (x.tier ? TIER_ORDER[x.tier]! : 3) - (y.tier ? TIER_ORDER[y.tier]! : 3);
      return t !== 0 ? t : x.b.name.localeCompare(y.b.name);
    });

  const me = rows.find((r) => r.b.self);
  const rivals = rows.filter((r) => !r.b.self);
  const tiles = TILE_METRICS.map((metric) => {
    const you = me?.values[metric] ?? null;
    const base = opts.baseline?.tiles.find((t) => t.metric === metric)?.you ?? null;
    const rivalMedian = median(rivals.map((r) => r.values[metric]));
    return { metric, you, rivalMedian: rivalMedian === null ? null : r2(rivalMedian), deltaSinceStart: opts.baseline && you !== null && base !== null ? r2(you - base) : null };
  });

  // Evidence: review/GBP captures, then the map-pack captures of the scan.
  const evidenceIds: string[] = [...new Set(trend.businesses.flatMap((b) => b.evidenceIds))];
  const rankCaptures = [...new Set(snaps.flatMap((s) => (s.captureId ? [s.captureId] : [])))];
  if (rankCaptures.length > 0) {
    const ev = await deps.db.select({ id: evidence.id }).from(evidence).where(inArray(evidence.captureId, rankCaptures)).orderBy(asc(evidence.id));
    for (const e of ev) if (!evidenceIds.includes(e.id)) evidenceIds.push(e.id);
  }

  return {
    asOf: now.toISOString(),
    baselineBriefId: null,
    tiles,
    rows: rows.map((r) => ({ competitorId: r.b.competitorId, name: r.b.name, self: r.b.self, tier: r.tier, values: r.values })),
    evidenceIds: evidenceIds.slice(0, SCORECARD_EVIDENCE_CAP),
    openFirstMoves: opts.openFirstMoves ?? [],
  };
}
