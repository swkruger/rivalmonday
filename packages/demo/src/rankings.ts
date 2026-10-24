import { TIER_LABELS } from '@cs/core';
import { type ChangeDetails, changeEvent, detectedChange, eventChange, eventScore, move, moveEvent, rankScan, rankSnapshot, type RankResult, type ScoreFactors } from '@cs/db';
import { buildStructuredSummary, competitorMatcher, MAP_CLIMB_POINTS_MIN, MOVES_RULE_VERSION, RANK_DIFF_VERSION, rankMetrics } from '@cs/engine';
import { routeFor } from './changes';
import type { SeedContext } from './context';
import { distanceKm, type LatLng } from './geo';
import type { ActiveClientKey } from './ids';
import { CLIENT_SPECS, CLIENT_THRESHOLDS, LONE_STAR_PLACE_ID } from './tenancy';

export const GRID_SIZE = 7;
/** Weekly done scans per active client (Phase 13b: 12, the Trend tab's default window). */
export const SCAN_WEEKS = 12;
/** The Lone Star rival (index into `ids.competitors.loneStar`) that climbs the map on keyword 0 over the last two scans. */
const CLIMBER = 0;
/** The rival that moves from "Worth watching" to "Top rival" on the latest scan. */
const TIER_RIVAL = 2;
/** Score boost for the climber on keyword 0, by weeks ago (0 = latest scan). */
const CLIMB_BOOST: Record<number, number> = { 1: 0.9, 0: 2.0 };
export const FILLER_BUSINESSES = [
  'Rapid Air Solutions', 'Cowboy Comfort Systems', 'Texan Temp Control', 'Bluebonnet Heating & Air', 'North Texas Air Pros', 'Weatherford Air Experts',
  'Stephenville Service Co', 'Glen Rose Mechanical', 'Lake Country Plumbing', 'Pinnacle Plumbing & Air', 'Frontier Home Services', 'Cedar Creek Comfort',
  'Hood County Heating', 'Prairie Wind HVAC',
] as const;

export interface GridPoint extends LatLng {
  row: number;
  col: number;
}

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Row 0 is the north edge, column 0 the west edge, spanning the service-area diameter. */
export function gridPoints(center: LatLng, radiusKm: number): GridPoint[] {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  const out: GridPoint[] = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      out.push({ row, col, lat: r6(center.lat + dLat - (2 * dLat * row) / (GRID_SIZE - 1)), lng: r6(center.lng - dLng + (2 * dLng * col) / (GRID_SIZE - 1)) });
    }
  }
  return out;
}

interface Ranked extends LatLng {
  key: string;
  title: string;
  placeId: string;
  domain: string | null;
  /** One base strength per keyword. */
  strength: number[];
}

const edge = (p: GridPoint) => p.row === 0 || p.col === 0 || p.row === GRID_SIZE - 1 || p.col === GRID_SIZE - 1;

/** Spec §4.6. */
export async function seedRankings(ctx: SeedContext): Promise<void> {
  const loneStar = await seedClientScans(ctx, 'loneStar');
  await seedClientScans(ctx, 'brazos');
  await seedRankSignals(ctx, loneStar);
}

interface DoneScan {
  id: string;
  finishedAt: Date;
  /** Result lists per keyword, one per grid point that returned data. */
  byKeyword: Map<string, RankResult[][]>;
}

async function seedClientScans(ctx: SeedContext, key: ActiveClientKey): Promise<DoneScan[]> {
  const rng = ctx.rng(`rankings:${key}`);
  const spec = CLIENT_SPECS[key];
  const { center, radiusKm } = spec.serviceArea;
  const keywords = spec.keywords;
  const three = () => [rng.between(0.5, 2.5), rng.between(0.5, 2.5), rng.between(0.5, 2.5)];
  const businesses: Ranked[] = [
    ...(key === 'loneStar' ? [{ key: 'self', title: 'Lone Star Cooling', placeId: LONE_STAR_PLACE_ID, domain: 'lone-star-cooling.example', lat: 32.447, lng: -97.798, strength: [3.2, 2.8, 1.0] }] : []),
    ...ctx.ids.competitors[key].filter((c) => c.id !== ctx.ids.noData.rankings)
      .map((c, i) => ({ key: c.id, title: c.name, placeId: c.placeId, domain: c.domain, lat: c.lat, lng: c.lng, strength: [2.6 - i * 0.2, 2.4 - i * 0.15, 2.2 - i * 0.1].map((s) => s + rng.between(-0.3, 0.3)) })),
    ...FILLER_BUSINESSES.map((title, i) => ({
      key: `filler-${i}`, title, placeId: `demo-filler-${i}`, domain: null, lat: center.lat + rng.between(-0.15, 0.15), lng: center.lng + rng.between(-0.15, 0.15), strength: three(),
    })),
  ];
  const points = gridPoints(center, radiusKm);
  const climberId = ctx.ids.competitors.loneStar[CLIMBER]!.id;
  const done: DoneScan[] = [];
  // Every scan carries the settings snapshot so the whole series keys equal (never 'legacy').
  const settings = { trigger: 'scheduled' as const, gridSize: GRID_SIZE, radiusKm, keywords: [...keywords] };
  for (let w = SCAN_WEEKS - 1; w >= 0; w--) {
    const finishedAt = ctx.clock.daysAgo(w * 7 + 1);
    const startedAt = new Date(finishedAt.getTime() - 20 * 60_000);
    const base = { agencyId: ctx.ids.agencyId, clientId: ctx.ids.clients[key] };
    if (key === 'loneStar' && w === 5) {
      // Spec §4.6: one failed scan, three days after the week-5 scan.
      const failedAt = ctx.clock.daysAgo(w * 7 - 2);
      await ctx.db.insert(rankScan).values({ ...base, ...settings, status: 'failed', snapshots: 0, failed: points.length * keywords.length, startedAt: new Date(failedAt.getTime() - 20 * 60_000), finishedAt: failedAt });
    }
    const growth = (SCAN_WEEKS - 1 - w) * 0.07; // Lone Star slowly gains share of voice
    const snaps: Omit<typeof rankSnapshot.$inferInsert, 'scanId'>[] = [];
    for (const [k, keyword] of keywords.entries()) {
      for (const p of points) {
        if (key === 'loneStar' && w === 3 && k === 0 && p.row === GRID_SIZE - 1 && p.col === GRID_SIZE - 1) continue; // one failed grid point → "no data"
        let ranked = businesses
          .map((b) => ({ b, s: b.strength[k]! + (b.key === 'self' ? growth : 0) + (key === 'loneStar' && k === 0 && b.key === climberId ? (CLIMB_BOOST[w] ?? 0) : 0) - distanceKm(p, b) / 6 + rng.between(-0.6, 0.6) }))
          .sort((x, y) => y.s - x.s)
          .map((x) => x.b);
        // Spec §4.6: one keyword where the client's own business is outside the top 20 at the edge of the area.
        if (key === 'loneStar' && k === 2 && edge(p)) ranked = ranked.filter((b) => b.key !== 'self');
        const results: RankResult[] = ranked.slice(0, 20).map((b, i) => ({ rank: i + 1, placeId: b.placeId, cid: null, domain: b.domain, title: b.title }));
        snaps.push({ ...base, keyword, lat: p.lat, lng: p.lng, results, capturedAt: finishedAt });
      }
    }
    const [scan] = await ctx.db.insert(rankScan).values({ ...base, ...settings, status: 'done', snapshots: snaps.length, failed: points.length * keywords.length - snaps.length, startedAt, finishedAt }).returning({ id: rankScan.id });
    for (let i = 0; i < snaps.length; i += 200) await ctx.db.insert(rankSnapshot).values(snaps.slice(i, i + 200).map((s) => ({ ...s, scanId: scan!.id })));
    const byKeyword = new Map<string, RankResult[][]>();
    for (const s of snaps) byKeyword.set(s.keyword, [...(byKeyword.get(s.keyword) ?? []), s.results]);
    done.push({ id: scan!.id, finishedAt, byKeyword });
  }
  return done;
}

const rankFactors = (score: number): ScoreFactors => ({
  typeWeight: 1, size: Math.min(1, Math.round((score / 90) * 100) / 100), serviceOverlap: 1, territoryOverlap: 1, relevance: 1, novelty: 0.9,
  maxSimilarity: 0.2, needsReviewCap: false, thresholds: CLIENT_THRESHOLDS.loneStar, scoringVersion: 2,
});

/**
 * Phase 13b: what the diff, tag, score and move stages write for the demo's rank scans. Seeded here (not in changes.ts)
 * because these rows hang off scan ids and `seedChanges` runs before `seedRankings`. Tenant-private: agency + client on every row.
 */
async function seedRankSignals(ctx: SeedContext, scans: DoneScan[]): Promise<void> {
  const { db, ids } = ctx;
  const tenant = { agencyId: ids.agencyId, clientId: ids.clients.loneStar };
  const keyword = CLIENT_SPECS.loneStar.keywords[0]!;
  const climber = ids.competitors.loneStar[CLIMBER]!;
  const match = competitorMatcher({ ...climber, cid: null });
  const last = scans.slice(-3);
  const eventIds: string[] = [];
  let pointsGained = 0;
  let firstAt: Date | null = null;

  // rank_change rows, mirroring diffRankScan: a scan against the previous done scan, on the shared grid points.
  for (let i = 1; i < last.length; i++) {
    const scan = last[i]!;
    const m0 = rankMetrics(last[i - 1]!.byKeyword.get(keyword)!, match);
    const m1 = rankMetrics(scan.byKeyword.get(keyword)!, match);
    const top3PointsBefore = Math.round(m0.top3Share * m0.points);
    const top3PointsAfter = Math.round(m1.top3Share * m1.points);
    if (top3PointsAfter <= top3PointsBefore) continue;
    const pct = (x: number) => `${Math.round(x * 100)}%`;
    const details = { changeType: 'rank_change', keyword, avgRankBefore: m0.avgRank, avgRankAfter: m1.avgRank, top3Before: m0.top3Share, top3After: m1.top3Share, points: m1.points, top3PointsBefore, top3PointsAfter, scanId: scan.id };
    pointsGained += top3PointsAfter - top3PointsBefore;
    eventIds.push(await seedRankEvent(ctx, {
      ...tenant, competitorId: climber.id, competitorName: climber.name, scan, blockKey: `rank:${keyword}`, changeType: 'rank_change', service: 'ac_repair',
      beforeText: `"${keyword}": average map position ${m0.avgRank}, top 3 in ${pct(m0.top3Share)} of ${m0.points} points`,
      afterText: `"${keyword}": average map position ${m1.avgRank}, top 3 in ${pct(m1.top3Share)} of ${m1.points} points`,
      details, score: 50 + Math.min(30, (top3PointsAfter - top3PointsBefore) * 3), occurredAt: scan.finishedAt,
    }));
    firstAt ??= scan.finishedAt;
  }
  if (pointsGained < MAP_CLIMB_POINTS_MIN) throw new Error(`demo rankings: the climber gained only ${pointsGained} top-3 points (need ${MAP_CLIMB_POINTS_MIN})`);

  // The open map_climb move (emerging; its playbook is map_climb_defend).
  const summary = `Climbed into the map top 3 at ${pointsGained} more points for "${keyword}"`;
  const [mv] = await db.insert(move).values({
    ...tenant, competitorId: climber.id, moveType: 'map_climb', status: 'emerging', confidence: 0.55, summary,
    details: { eventCount: eventIds.length, channels: ['rank'], facts: { keyword, pointsGained } }, ruleVersion: MOVES_RULE_VERSION,
    firstDetectedAt: firstAt!, lastHeldAt: ctx.clock.daysAgo(0.5), lastEvidenceAt: last.at(-1)!.finishedAt, updatedAt: ctx.clock.daysAgo(0.5),
  }).returning({ id: move.id });
  await db.insert(moveEvent).values(eventIds.map((eventId) => ({ moveId: mv!.id, eventId })));
  ids.moves.push({ id: mv!.id, client: 'loneStar', competitorId: climber.id, moveType: 'map_climb', open: true, summary });

  // One tier_change (watch → top) on the latest scan, as the signals job writes it (block key tier:YYYY-MM-DD).
  const latest = scans.at(-1)!;
  const rival = ids.competitors.loneStar[TIER_RIVAL]!;
  const day = latest.finishedAt.toISOString().slice(0, 10);
  await seedRankEvent(ctx, {
    ...tenant, competitorId: rival.id, competitorName: rival.name, scan: latest, blockKey: `tier:${day}`, changeType: 'tier_change', service: null,
    beforeText: TIER_LABELS.watch, afterText: TIER_LABELS.top, details: { changeType: 'tier_change', from: 'watch', to: 'top' }, score: 46, occurredAt: new Date(`${day}T00:00:00Z`),
  });
}

interface RankEventSpec {
  agencyId: string;
  clientId: string;
  competitorId: string;
  competitorName: string;
  scan: DoneScan;
  blockKey: string;
  beforeText: string;
  afterText: string;
  details: ChangeDetails;
  changeType: 'rank_change' | 'tier_change';
  service: string | null;
  score: number;
  occurredAt: Date;
}

/** One detected_change + change_event + event_score for a rank scan (the diff, tag and score stages' output). */
async function seedRankEvent(ctx: SeedContext, s: RankEventSpec): Promise<string> {
  const { db, ids } = ctx;
  const [ch] = await db.insert(detectedChange).values({
    competitorId: s.competitorId, source: 'rank', kind: 'modified', rankScanId: s.scan.id, agencyId: s.agencyId, clientId: s.clientId, blockKey: s.blockKey,
    beforeText: s.beforeText, afterText: s.afterText, details: s.details, status: 'event', stageVersion: RANK_DIFF_VERSION, detectedAt: s.occurredAt,
  }).returning({ id: detectedChange.id });
  const summary = buildStructuredSummary({ source: 'rank', beforeText: s.beforeText, afterText: s.afterText, details: s.details }, [s.competitorName]);
  const [ev] = await db.insert(changeEvent).values({
    competitorId: s.competitorId, agencyId: s.agencyId, clientId: s.clientId, changeType: s.changeType, channels: ['rank'], services: { hvac_plumbing: s.service },
    summary, facts: [], details: s.details, zips: [], confidence: 1, occurredAt: s.occurredAt, createdAt: s.occurredAt,
  }).returning({ id: changeEvent.id });
  await db.insert(eventChange).values({ eventId: ev!.id, changeId: ch!.id });
  const route = routeFor('loneStar', s.score);
  await db.insert(eventScore).values({
    agencyId: s.agencyId, clientId: s.clientId, eventId: ev!.id, score: s.score, route, factors: rankFactors(s.score), packVersion: 1, scoredAt: new Date(s.occurredAt.getTime() + 3_600_000),
  });
  ids.events.push({ id: ev!.id, client: 'loneStar', competitorId: s.competitorId, changeId: ch!.id, changeType: s.changeType, source: 'rank', route, score: s.score, occurredAt: s.occurredAt, summary, evidenceIds: [], captureId: '' });
  return ev!.id;
}
