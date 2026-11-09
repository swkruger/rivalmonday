import { type BriefReport, type ChartSeries, insideBounds, type RankMetric } from '@cs/core';
import {
  alert, changeEvent, client, clientCompetitor, competitor, type Db, move, rankMapImage, type RankResult, rankScan, rankSnapshot, recommendation,
} from '@cs/db';
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { monthKeys, ratingStats } from '../reviews/rating-trend';
import { competitorMatcher, NOT_FOUND_RANK, rankMetrics, rankSettingsKey } from '../structured/rank';
import type { PackLoader } from '../tag/tag-stage';
import { adWeeklySeries } from '../workspace/ads';
import { kpiEventReads, kpiGlobalReads, workspaceKpis } from '../workspace/kpi';
import { MOVE_LABELS, pressureByClient } from '../workspace/pressure';
import { liveEventCount } from '../workspace/scope';
import type { BriefClient } from './gather';
import { gradedChanges } from './graded';

const DAY = 86_400_000;
export const REPORT_RATING_MONTHS = 12;
export const REPORT_AD_WEEKS = 12;
export const REPORT_LIMITS = { pressure: 5, keywords: 5, rivals: 2, moves: 6, recommendations: 8, alerts: 5 } as const;

const byName = (a: { name: string; id: string }, b: { name: string; id: string }) => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id);
const humanise = (k: string) => {
  const s = k.replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

type Matchable = { placeId: string | null; cid: string | null; domain: string | null };
const matchable = (b: Matchable) => Boolean(b.placeId || b.cid || b.domain);

/** `rankMetrics`, with no data (no business to match, no grid points) as `avgRank: null` rather than "not in the top 20". */
function metricOf(results: RankResult[][], business: Matchable | null): RankMetric {
  if (!business || results.length === 0) return { avgRank: null, top3Share: 0, points: 0 };
  return rankMetrics(results, competitorMatcher(business));
}

/**
 * Spec §4.4: every datum of the weekly report (PDF and app sections) from stored rows, at `asOf = period.end`. Runs on the
 * worker's service DB; every read is filtered by the client's id or its tracked competitors. Deterministic: lists are
 * sorted with id tie-breaks, numbers are finite, no data is an empty list or null (never 0).
 */
export async function buildBriefReport(
  deps: { db: Db; packs: PackLoader },
  c: BriefClient,
  period: { start: Date; end: Date },
  writtenEventIds: Set<string>,
): Promise<BriefReport> {
  const { db } = deps;
  const asOf = period.end;
  const [row] = await db
    .select({ id: client.id, name: client.name, verticalId: client.verticalId, services: client.services, selfCompetitorId: client.selfCompetitorId, placeId: client.placeId })
    .from(client).where(eq(client.id, c.id)).limit(1);
  if (!row) throw new Error(`client ${c.id} not found`);
  const [trackedAll, selfRows] = await Promise.all([
    db.select({ id: competitor.id, name: competitor.name, placeId: competitor.placeId, cid: competitor.cid, domain: competitor.domain })
      .from(clientCompetitor).innerJoin(competitor, eq(competitor.id, clientCompetitor.competitorId)).where(eq(clientCompetitor.clientId, c.id)),
    row.selfCompetitorId
      ? db.select({ id: competitor.id, placeId: competitor.placeId, cid: competitor.cid, domain: competitor.domain }).from(competitor).where(eq(competitor.id, row.selfCompetitorId))
      : Promise.resolve([]),
  ]);
  const tracked = [...trackedAll].sort(byName);
  const trackedIds = tracked.map((t) => t.id);
  const rivals = tracked.filter((t) => t.id !== row.selfCompetitorId);
  const selfRow = selfRows[0];
  // As `workspaceBusinesses`: the self row (its place id falling back to the client's), else the client's place id alone.
  const selfMatch: Matchable | null = selfRow
    ? { placeId: selfRow.placeId ?? row.placeId, cid: selfRow.cid, domain: selfRow.domain }
    : row.placeId ? { placeId: row.placeId, cid: null, domain: null } : null;

  const months = monthKeys(asOf, REPORT_RATING_MONTHS);
  const ratingBusinesses = [
    ...(row.selfCompetitorId ? [{ id: row.selfCompetitorId, name: row.name, you: true }] : []),
    ...rivals.map((t) => ({ id: t.id, name: t.name, you: false })),
  ];

  const [changes, events, globals, pressureMap, stats, adSeries, rankings, moves, recs, alerts] = await Promise.all([
    gradedChanges({ db }, c, period, writtenEventIds),
    kpiEventReads(db, c.id, asOf, asOf),
    kpiGlobalReads(db, trackedIds, row.selfCompetitorId, asOf, asOf),
    pressureByClient(db, [c.id], asOf),
    ratingStats(db, ratingBusinesses.map((b) => b.id), asOf, months),
    adWeeklySeries(db, rivals.map((t) => t.id), asOf, REPORT_AD_WEEKS),
    rankingsOf(db, c.id, asOf, selfMatch, rivals),
    db.select({ id: move.id, competitorName: competitor.name, moveType: move.moveType, status: move.status, firstDetectedAt: move.firstDetectedAt })
      .from(move)
      .innerJoin(clientCompetitor, and(eq(clientCompetitor.clientId, move.clientId), eq(clientCompetitor.competitorId, move.competitorId)))
      .innerJoin(competitor, eq(competitor.id, move.competitorId))
      .where(and(eq(move.clientId, c.id), isNull(move.closedAt), inArray(move.status, ['emerging', 'active']), lte(move.firstDetectedAt, asOf), sql`${liveEventCount} > 0`))
      .orderBy(desc(sql`coalesce(${move.lastEvidenceAt}, ${move.firstDetectedAt})`), desc(move.id))
      .limit(REPORT_LIMITS.moves),
    // Only these columns: `upsell_tag` never leaves the database here.
    db.select({ id: recommendation.id, title: recommendation.title, status: recommendation.status, createdAt: recommendation.createdAt })
      .from(recommendation)
      .where(and(eq(recommendation.clientId, c.id), inArray(recommendation.status, ['todo', 'in_progress']), lte(recommendation.createdAt, asOf)))
      .orderBy(sql`CASE WHEN ${recommendation.status} = 'in_progress' THEN 0 ELSE 1 END`, desc(recommendation.createdAt), asc(recommendation.id))
      .limit(REPORT_LIMITS.recommendations),
    db.select({ headline: alert.headline, competitorName: competitor.name, deliveredAt: alert.deliveredAt })
      .from(alert)
      .innerJoin(competitor, eq(competitor.id, alert.competitorId))
      .innerJoin(changeEvent, eq(changeEvent.id, alert.eventId))
      .where(and(eq(alert.clientId, c.id), eq(alert.status, 'delivered'), isNotNull(alert.deliveredAt), gt(alert.deliveredAt, period.start), lte(alert.deliveredAt, period.end), isNull(changeEvent.retractedAt)))
      .orderBy(desc(alert.deliveredAt), desc(alert.id))
      .limit(REPORT_LIMITS.alerts),
  ]);

  const k = workspaceKpis(row, trackedIds, events, globals, asOf);
  const pressure = [...(pressureMap.get(c.id) ?? [])]
    .sort((a, b) => b.pressure.score - a.pressure.score || a.name.localeCompare(b.name, 'en') || a.competitorId.localeCompare(b.competitorId))
    .slice(0, REPORT_LIMITS.pressure)
    .map((p) => ({
      competitorId: p.competitorId, name: p.name, score: p.pressure.score, level: p.pressure.level,
      // 'Quiet' is the no-signal placeholder, not a reason.
      reason: p.pressure.score > 0 ? (p.pressure.reasons[0] ?? null) : null,
    }));

  const ratingSeries: ChartSeries[] = ratingBusinesses.map((b) => ({
    key: b.id, name: b.name, points: stats.get(b.id)!.monthly.map((m) => m.avgRating), ...(b.you ? { you: true } : {}),
  }));
  const adWeeks = Array.from({ length: REPORT_AD_WEEKS }, (_, i) => new Date(asOf.getTime() - (REPORT_AD_WEEKS - 1 - i) * 7 * DAY).toISOString().slice(0, 10));

  return {
    v: 1,
    asOf: asOf.toISOString(),
    changes,
    kpis: k,
    pressure,
    rating: { months, series: ratingSeries },
    ads: { weeks: adWeeks, series: rivals.map((t) => ({ key: t.id, name: t.name, points: adSeries.get(t.id)! })) },
    rankings,
    moves: moves.map((m) => ({
      id: m.id, competitorName: m.competitorName, moveType: m.moveType, label: MOVE_LABELS[m.moveType] ?? humanise(m.moveType), status: m.status,
      firstDetectedAt: m.firstDetectedAt.toISOString(),
    })),
    recommendations: recs.map((r) => ({
      id: r.id, title: r.title, status: r.status as 'todo' | 'in_progress',
      createdThisWeek: r.createdAt.getTime() > period.start.getTime() && r.createdAt.getTime() <= period.end.getTime(),
    })),
    alerts: alerts.map((a) => ({ headline: a.headline, competitorName: a.competitorName, deliveredAt: a.deliveredAt!.toISOString() })),
  };
}

/** The latest finished scan at or before `asOf` vs the one before it (same settings series only; else `prev` is null). */
async function rankingsOf(
  db: Db,
  clientId: string,
  asOf: Date,
  self: Matchable | null,
  rivals: (Matchable & { id: string; name: string })[],
): Promise<BriefReport['rankings']> {
  const scans = await db
    .select({ id: rankScan.id, finishedAt: rankScan.finishedAt, gridSize: rankScan.gridSize, radiusKm: rankScan.radiusKm, keywords: rankScan.keywords })
    .from(rankScan)
    .where(and(eq(rankScan.clientId, clientId), eq(rankScan.status, 'done'), isNotNull(rankScan.finishedAt), lte(rankScan.finishedAt, asOf)))
    .orderBy(desc(rankScan.finishedAt), desc(rankScan.id))
    .limit(2);
  const cur = scans[0];
  if (!cur) return null;
  const prev = scans[1] && rankSettingsKey(scans[1]) === rankSettingsKey(cur) ? scans[1] : null;
  const [snaps, [image]] = await Promise.all([
    db.select({ scanId: rankSnapshot.scanId, keyword: rankSnapshot.keyword, lat: rankSnapshot.lat, lng: rankSnapshot.lng, results: rankSnapshot.results })
      .from(rankSnapshot)
      .where(and(eq(rankSnapshot.clientId, clientId), inArray(rankSnapshot.scanId, prev ? [cur.id, prev.id] : [cur.id]))),
    db.select({ objectKey: rankMapImage.objectKey, bounds: rankMapImage.bounds, width: rankMapImage.width, height: rankMapImage.height })
      .from(rankMapImage).where(eq(rankMapImage.clientId, clientId)),
  ]);
  const curSnaps = snaps.filter((s) => s.scanId === cur.id);
  const prevSnaps = snaps.filter((s) => s.scanId === prev?.id);
  const keywords = [...new Set(curSnaps.map((s) => s.keyword))].sort((a, b) => a.localeCompare(b, 'en')).slice(0, REPORT_LIMITS.keywords);
  const rankable = rivals.filter(matchable);
  const resultsOf = (list: typeof snaps, kw: string) => list.filter((s) => s.keyword === kw).map((s) => s.results);

  const rows = keywords.map((keyword) => {
    const results = resultsOf(curSnaps, keyword);
    const before = resultsOf(prevSnaps, keyword);
    const ranked = rankable
      .map((r) => ({ name: r.name, id: r.id, metric: metricOf(results, r) }))
      .sort((a, b) => (a.metric.avgRank ?? NOT_FOUND_RANK + 1) - (b.metric.avgRank ?? NOT_FOUND_RANK + 1) || b.metric.top3Share - a.metric.top3Share || byName(a, b))
      .slice(0, REPORT_LIMITS.rivals);
    return {
      keyword,
      you: metricOf(results, self),
      prev: prev && before.length > 0 ? metricOf(before, self) : null,
      rivals: ranked.map((r) => ({ name: r.name, metric: r.metric })),
    };
  });

  const first = keywords[0];
  // The map shows only when it covers every point of the scan (as `get_geogrid`: the grid may have grown since the image).
  const map = image && first && curSnaps.every((s) => insideBounds({ lat: s.lat, lng: s.lng }, image.bounds))
    ? {
        keyword: first, objectKey: image.objectKey, bounds: image.bounds, width: image.width, height: image.height,
        points: curSnaps
          .filter((s) => s.keyword === first)
          .sort((a, b) => b.lat - a.lat || a.lng - b.lng)
          .map((s) => ({ lat: s.lat, lng: s.lng, rank: self ? (s.results.find(competitorMatcher(self))?.rank ?? NOT_FOUND_RANK) : null })),
      }
    : null;

  return { scanAt: cur.finishedAt!.toISOString(), prevScanAt: prev?.finishedAt?.toISOString() ?? null, keywords: rows, map };
}
