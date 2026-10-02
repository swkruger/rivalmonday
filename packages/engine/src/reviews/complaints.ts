import { capture, type Db, detectedChange } from '@cs/db';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { competitorVerticals, type PackLoader } from '../tag/tag-stage';
import { themesForVertical } from './themes';

/** detected_change.stage_version of complaint-spike changes (they are written by the nightly review-insights run, not a stage_run stage). */
export const COMPLAINT_STAGE_VERSION = 1;
export const COMPLAINT_WINDOW_DAYS = 30;
/** Baseline: the three 30-day periods before the window. */
export const COMPLAINT_BASELINE_PERIODS = 3;
export const COMPLAINT_MIN = 3;
/** One complaint spike per theme per competitor per 30 days. */
export const COMPLAINT_COOLDOWN_DAYS = 30;
/** Sentiment levels that make a theme mention a complaint: 0 very negative, 1 negative. */
export const COMPLAINT_MAX_SENTIMENT = 1;
const DAY_MS = 86_400_000;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Spec §6.4 "complaint-theme spike": ≥ COMPLAINT_MIN and ≥ multiplier × the baseline monthly mean (floored at 1). `z` is a Poisson-style deviation for the size curve. */
export function complaintSpike(current: number, baseline: number[], multiplier: number): { spike: boolean; baselineMean: number; z: number } {
  const mean = baseline.length > 0 ? baseline.reduce((a, b) => a + b, 0) / baseline.length : 0;
  return { spike: current >= COMPLAINT_MIN && current >= multiplier * Math.max(mean, 1), baselineMean: r2(mean), z: r2((current - mean) / Math.max(Math.sqrt(mean), 1)) };
}

export const complaintBlockKey = (verticalId: string, themeId: string) => `reviews:complaints:${verticalId}:${themeId}`;

/**
 * Writes a `review_spike` detected change per (vertical, theme) whose complaints spiked in the last 30 days.
 * The change cites the competitor's latest ok google_reviews capture (no evidence, no claim) and flows through
 * the normal structured tag → score → moves pipeline. Review text never enters the change: counts only.
 */
export async function detectComplaintSpikes(deps: { db: Db; packs: PackLoader }, competitorId: string, opts: { now?: Date } = {}): Promise<string[]> {
  const now = opts.now ?? new Date();
  const at = now.toISOString();
  const [latest, prev] = await deps.db
    .select({ id: capture.id })
    .from(capture)
    .where(and(eq(capture.competitorId, competitorId), eq(capture.source, 'google_reviews'), eq(capture.status, 'ok'), lte(capture.capturedAt, now)))
    .orderBy(desc(capture.capturedAt))
    .limit(2);
  if (!latest) return [];
  const span = COMPLAINT_WINDOW_DAYS * (COMPLAINT_BASELINE_PERIODS + 1);
  const ids: string[] = [];
  for (const verticalId of await competitorVerticals(deps.db, competitorId)) {
    const pack = await deps.packs(verticalId);
    const rows = (await deps.db.execute(sql`
      SELECT t.theme, floor(extract(epoch FROM (${at}::timestamptz - r.posted_at)) / ${COMPLAINT_WINDOW_DAYS * 86_400}::int)::int AS period, count(*)::int AS n
      FROM review_analysis a
      JOIN review r ON r.id = a.review_id
      CROSS JOIN LATERAL jsonb_array_elements_text(a.themes) AS t(theme)
      WHERE a.competitor_id = ${competitorId}::uuid AND a.vertical_id = ${verticalId} AND a.sentiment <= ${COMPLAINT_MAX_SENTIMENT}::int
        AND r.posted_at > ${at}::timestamptz - make_interval(days => ${span}::int) AND r.posted_at <= ${at}::timestamptz
      GROUP BY 1, 2`)) as unknown as { theme: string; period: number; n: number }[];
    for (const theme of await themesForVertical(deps.db, pack)) {
      const count = (p: number) => Number(rows.find((r) => r.theme === theme.id && Number(r.period) === p)?.n ?? 0);
      const s = complaintSpike(count(0), Array.from({ length: COMPLAINT_BASELINE_PERIODS }, (_, i) => count(i + 1)), pack.move_thresholds.complaint_spike_multiplier);
      if (!s.spike) continue;
      const blockKey = complaintBlockKey(verticalId, theme.id);
      const [recent] = await deps.db
        .select({ id: detectedChange.id })
        .from(detectedChange)
        .where(and(eq(detectedChange.competitorId, competitorId), eq(detectedChange.blockKey, blockKey), gte(detectedChange.detectedAt, new Date(now.getTime() - COMPLAINT_COOLDOWN_DAYS * DAY_MS))))
        .limit(1);
      if (recent) continue;
      const [row] = await deps.db
        .insert(detectedChange)
        .values({
          competitorId, source: 'google_reviews', kind: 'modified', beforeCaptureId: prev?.id ?? null, afterCaptureId: latest.id, blockKey,
          beforeText: `${s.baselineMean} complaints a month about ${theme.name} over the previous ${COMPLAINT_WINDOW_DAYS * COMPLAINT_BASELINE_PERIODS} days`,
          afterText: `${count(0)} complaints about ${theme.name} in the last ${COMPLAINT_WINDOW_DAYS} days`,
          details: {
            changeType: 'review_spike', theme: theme.id, themeName: theme.name, verticalId, count: count(0), baselineMean: s.baselineMean, windowDays: COMPLAINT_WINDOW_DAYS, z: s.z,
          },
          stageVersion: COMPLAINT_STAGE_VERSION, detectedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: detectedChange.id });
      if (row) ids.push(row.id);
    }
  }
  return ids;
}
