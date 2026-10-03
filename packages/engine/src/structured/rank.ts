import { clientCompetitor, competitor, type Db, detectedChange, type RankResult, rankScan, rankSnapshot } from '@cs/db';
import { and, desc, eq, lt } from 'drizzle-orm';
import { supersedePriorChanges } from '../events/retract';
import { runStage, type StageOutcome } from '../stage';

export const RANK_DIFF_STAGE = 'rank_diff';
export const RANK_DIFF_VERSION = 1;
/** Scans go 20 deep; a competitor missing from a grid point counts as position 21. */
export const NOT_FOUND_RANK = 21;
/** A rank change: the average grid position moved by at least this many places … */
export const RANK_DELTA_MIN = 3;
/** … or the share of grid points where the competitor is in the top 3 moved by at least this much. */
export const TOP3_SHARE_DELTA_MIN = 0.25;
/** A keyword is compared only on at least this many grid points both scans cover — fewer is noise. */
export const RANK_MIN_SHARED_POINTS = 4;
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

export function competitorMatcher(c: { placeId: string | null; cid: string | null; domain: string | null }): (r: RankResult) => boolean {
  return (r) => Boolean((c.placeId && r.placeId === c.placeId) || (c.cid && r.cid === c.cid) || (c.domain && r.domain === c.domain));
}

export function rankMetrics(results: RankResult[][], match: (r: RankResult) => boolean): { avgRank: number; top3Share: number; points: number } {
  const ranks = results.map((rs) => rs.find(match)?.rank ?? NOT_FOUND_RANK);
  const points = ranks.length;
  if (points === 0) return { avgRank: NOT_FOUND_RANK, top3Share: 0, points: 0 };
  return { avgRank: round(ranks.reduce((a, b) => a + b, 0) / points), top3Share: round(ranks.filter((r) => r <= 3).length / points), points };
}

const pointKey = (s: { keyword: string; lat: number; lng: number }) => `${s.keyword}|${s.lat.toFixed(5)},${s.lng.toFixed(5)}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * Spec §6.1/§6.3 rank delta, tenant-private (a client's keywords are its own): a done scan vs the client's
 * previous done scan, on the keywords and grid points both cover, for every competitor the client tracks.
 */
export async function diffRankScan(deps: { db: Db }, scanId: string): Promise<StageOutcome<{ baseline: boolean; changeIds: string[] }>> {
  const [scan] = await deps.db.select().from(rankScan).where(eq(rankScan.id, scanId)).limit(1);
  if (!scan || scan.status !== 'done' || !scan.finishedAt) throw new Error(`rank scan ${scanId} is not a finished scan`);
  const finishedAt = scan.finishedAt;
  return runStage(
    deps.db,
    { stage: RANK_DIFF_STAGE, version: RANK_DIFF_VERSION, subjectId: scanId },
    async () => {
      const [prev] = await deps.db
        .select({ id: rankScan.id })
        .from(rankScan)
        .where(and(eq(rankScan.clientId, scan.clientId), eq(rankScan.status, 'done'), lt(rankScan.finishedAt, finishedAt)))
        .orderBy(desc(rankScan.finishedAt))
        .limit(1);
      if (!prev) return { baseline: true, rows: [] as (typeof detectedChange.$inferInsert)[] };
      const [before, after, tracked] = await Promise.all([
        deps.db.select().from(rankSnapshot).where(eq(rankSnapshot.scanId, prev.id)),
        deps.db.select().from(rankSnapshot).where(eq(rankSnapshot.scanId, scanId)),
        deps.db
          .select({ id: competitor.id, placeId: competitor.placeId, cid: competitor.cid, domain: competitor.domain })
          .from(clientCompetitor)
          .innerJoin(competitor, eq(competitor.id, clientCompetitor.competitorId))
          .where(eq(clientCompetitor.clientId, scan.clientId)),
      ]);
      const beforeByPoint = new Map(before.map((s) => [pointKey(s), s.results]));
      const pairs = new Map<string, { before: RankResult[][]; after: RankResult[][] }>(); // keyword → results on shared points
      for (const s of after) {
        const b = beforeByPoint.get(pointKey(s));
        if (!b) continue;
        const p = pairs.get(s.keyword) ?? { before: [], after: [] };
        p.before.push(b);
        p.after.push(s.results);
        pairs.set(s.keyword, p);
      }
      const rows: (typeof detectedChange.$inferInsert)[] = [];
      for (const c of tracked) {
        const match = competitorMatcher(c);
        for (const [keyword, p] of [...pairs].sort(([a], [b]) => a.localeCompare(b))) {
          if (p.after.length < RANK_MIN_SHARED_POINTS) continue;
          const m0 = rankMetrics(p.before, match);
          const m1 = rankMetrics(p.after, match);
          if (m0.avgRank === NOT_FOUND_RANK && m1.avgRank === NOT_FOUND_RANK) continue;
          if (Math.abs(m1.avgRank - m0.avgRank) < RANK_DELTA_MIN && Math.abs(m1.top3Share - m0.top3Share) < TOP3_SHARE_DELTA_MIN) continue;
          rows.push({
            competitorId: c.id, source: 'rank', kind: 'modified', rankScanId: scanId, agencyId: scan.agencyId, clientId: scan.clientId, blockKey: `rank:${keyword}`,
            beforeText: `"${keyword}": average map position ${m0.avgRank}, top 3 in ${pct(m0.top3Share)} of ${m0.points} points`,
            afterText: `"${keyword}": average map position ${m1.avgRank}, top 3 in ${pct(m1.top3Share)} of ${m1.points} points`,
            details: { changeType: 'rank_change', keyword, avgRankBefore: m0.avgRank, avgRankAfter: m1.avgRank, top3Before: m0.top3Share, top3After: m1.top3Share, points: m1.points },
            stageVersion: RANK_DIFF_VERSION,
          });
        }
      }
      return { baseline: false, rows };
    },
    async (tx, { baseline, rows }) => {
      await supersedePriorChanges(tx, { rankScanId: scanId }, RANK_DIFF_VERSION);
      if (rows.length === 0) return { baseline, changeIds: [] as string[] };
      const inserted = await tx.insert(detectedChange).values(rows).onConflictDoNothing().returning({ id: detectedChange.id });
      return { baseline, changeIds: inserted.map((r) => r.id) };
    },
  );
}
