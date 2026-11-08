import { detectedChange, observation } from '@cs/db';
import { and, eq, gte, lte, ne, sql } from 'drizzle-orm';
import { pageIdOf } from './ads';
import type { SourceDiffer, StructuredChange } from './vendor-diff';

/** Spec D3: a Facebook Page's likes grew by at least this share ... */
export const AUDIENCE_MIN_PCT = 15;
/** ... and at least this many likes (small pages jitter) ... */
export const AUDIENCE_MIN_GAIN = 50;
/** ... measured against a reading this many days back (inclusive range), closest to the target. */
export const AUDIENCE_WINDOW_DAYS = [21, 35] as const;
export const AUDIENCE_TARGET_DAYS = 28;
/** At most one `audience_growth` per competitor and page in this many days. */
export const AUDIENCE_COOLDOWN_DAYS = 28;
const DAY_MS = 86_400_000;

const round1 = (x: number) => Math.round(x * 10) / 10;
const likesOf = (data: Record<string, unknown>): number | null => (typeof data.likes === 'number' && Number.isFinite(data.likes) ? data.likes : null);

/** Page likes rose >= 15 % (and >= 50) over ~28 days, at most once per 28 days per page. Drops never emit. */
export const diffAudience: SourceDiffer = async (db, cap) => {
  const pageId = pageIdOf(cap.url);
  if (!pageId) return [];
  const [cur] = await db
    .select({ data: observation.data })
    .from(observation)
    .where(and(eq(observation.captureId, cap.id), eq(observation.kind, 'meta_page'), eq(observation.key, pageId)))
    .limit(1);
  const after = cur ? likesOf(cur.data) : null;
  if (after === null) return [];

  const at = cap.capturedAt.getTime();
  const [minDays, maxDays] = AUDIENCE_WINDOW_DAYS;
  const target = at - AUDIENCE_TARGET_DAYS * DAY_MS;
  const readings = await db
    .select({ data: observation.data, captureId: observation.captureId, observedAt: observation.observedAt })
    .from(observation)
    .where(
      and(
        eq(observation.competitorId, cap.competitorId), eq(observation.kind, 'meta_page'), eq(observation.key, pageId),
        gte(observation.observedAt, new Date(at - maxDays * DAY_MS)), lte(observation.observedAt, new Date(at - minDays * DAY_MS)),
      ),
    );
  const base = readings.sort((x, y) => Math.abs(x.observedAt.getTime() - target) - Math.abs(y.observedAt.getTime() - target))[0];
  const before = base ? likesOf(base.data) : null;
  if (!base || before === null || before <= 0) return [];

  const pct = round1(((after - before) / before) * 100);
  if (pct < AUDIENCE_MIN_PCT || after - before < AUDIENCE_MIN_GAIN) return [];

  const [recent] = await db
    .select({ id: detectedChange.id })
    .from(detectedChange)
    .where(
      and(
        eq(detectedChange.competitorId, cap.competitorId), ne(detectedChange.status, 'superseded'), ne(detectedChange.afterCaptureId, cap.id),
        sql`${detectedChange.details}->>'changeType' = 'audience_growth'`, sql`${detectedChange.details}->>'pageId' = ${pageId}`,
        gte(detectedChange.detectedAt, new Date(at - AUDIENCE_COOLDOWN_DAYS * DAY_MS)),
      ),
    )
    .limit(1);
  if (recent) return [];

  const days = Math.round((at - base.observedAt.getTime()) / DAY_MS);
  const change: StructuredChange = {
    kind: 'modified', blockKey: `meta:likes:${pageId}`,
    beforeText: `Facebook Page likes: ${before}`, afterText: `Facebook Page likes: ${after}`,
    details: { changeType: 'audience_growth', pageId, likesBefore: before, likesAfter: after, pct, days },
    beforeCaptureId: base.captureId,
  };
  return [change];
};
