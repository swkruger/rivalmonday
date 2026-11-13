import { GBP_EVENTS_URL } from '@cs/collectors';
import { capture, type Db, evidence, listedEvent, stageRun } from '@cs/db';
import { and, desc, eq, gte, inArray, or, sql } from 'drizzle-orm';
import { LISTED_EVENTS_STAGE } from './stage';

const DAY_MS = 86_400_000;

/** D11: a measured capture = an ok venue-panel (`gbp:events`) or web capture with a done `listed_events` run (never Meta). */
const measured = () =>
  and(
    eq(capture.status, 'ok'),
    or(and(eq(capture.source, 'google_business_profile'), eq(capture.url, GBP_EVENTS_URL)), eq(capture.source, 'web')),
    sql`EXISTS (SELECT 1 FROM ${stageRun} WHERE ${stageRun.stage} = ${LISTED_EVENTS_STAGE} AND ${stageRun.subjectId} = ${capture.id} AND ${stageRun.status} = 'done')`,
  );

/**
 * Scorecard and `event_gap` (P5): events a business listed in the last 30 days (non-series `listed_event` rows first seen since
 * `now − 30 d`, any source). `null` = no measured capture of that business yet ("not checked", never 0).
 */
export async function eventCounts30d(db: Db, competitorIds: string[], now: Date): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>(competitorIds.map((id) => [id, null]));
  if (competitorIds.length === 0) return out;
  const checked = await db.selectDistinct({ id: capture.competitorId }).from(capture).where(and(inArray(capture.competitorId, competitorIds), measured()));
  for (const c of checked) out.set(c.id, 0);
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const counts = await db
    .select({ id: listedEvent.competitorId, n: sql<number>`count(*)::int` })
    .from(listedEvent)
    .where(and(inArray(listedEvent.competitorId, competitorIds), eq(listedEvent.series, false), gte(listedEvent.firstSeenAt, since)))
    .groupBy(listedEvent.competitorId);
  for (const c of counts) if (out.get(c.id) !== null) out.set(c.id, Number(c.n));
  return out;
}

/** The newest measured capture's evidence id per business (no evidence, no claim). */
export async function eventsEvidenceIds(db: Db, competitorIds: string[]): Promise<string[]> {
  if (competitorIds.length === 0) return [];
  const rows = await db
    .select({ competitorId: capture.competitorId, id: evidence.id })
    .from(evidence)
    .innerJoin(capture, eq(capture.id, evidence.captureId))
    .where(and(inArray(capture.competitorId, competitorIds), measured()))
    .orderBy(desc(capture.capturedAt), evidence.id);
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const r of rows) if (!seen.has(r.competitorId)) { seen.add(r.competitorId); ids.push(r.id); }
  return ids;
}
