import { GBP_EVENTS_URL } from '@cs/collectors';
import { capture, type Db, evidence, listedEvent, stageRun } from '@cs/db';
import { and, asc, desc, eq, gte, inArray, lte, notInArray, or, sql } from 'drizzle-orm';
import { localDate } from './normalise';
import { LISTED_EVENTS_STAGE } from './stage';

const DAY_MS = 86_400_000;
/** Upcoming = starting today through this many days ahead (the Events page window). */
export const UPCOMING_EVENTS_DAYS = 60;
/** An event still counts as shown when a measured capture listed it this recently (a weekly scan plus slack). */
export const UPCOMING_LAST_SEEN_DAYS = 8;

/** D11: a measured capture = an ok venue-panel (`gbp:events`) or web capture with a done `listed_events` run (never Meta). */
const measured = () =>
  and(
    eq(capture.status, 'ok'),
    or(and(eq(capture.source, 'google_business_profile'), eq(capture.url, GBP_EVENTS_URL)), eq(capture.source, 'web')),
    sql`EXISTS (SELECT 1 FROM ${stageRun} WHERE ${stageRun.stage} = ${LISTED_EVENTS_STAGE} AND ${stageRun.subjectId} = ${capture.id} AND ${stageRun.status} = 'done')`,
  );

const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/**
 * Scorecard and `event_gap` (Task 12 fix ruling 1): upcoming events a business currently shows — non-series `listed_event` rows starting
 * today (in `tz`) through +60 days and last seen within 8 days, any source, not cancelled or postponed (sold out still counts). `null` = no measured capture of that business yet (never 0).
 */
export async function upcomingEvents(db: Db, competitorIds: string[], now: Date, tz = 'America/Chicago'): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>(competitorIds.map((id) => [id, null]));
  if (competitorIds.length === 0) return out;
  const checked = await db.selectDistinct({ id: capture.competitorId }).from(capture).where(and(inArray(capture.competitorId, competitorIds), measured()));
  for (const c of checked) out.set(c.id, 0);
  const today = localDate(now, tz);
  const counts = await db
    .select({ id: listedEvent.competitorId, n: sql<number>`count(*)::int` })
    .from(listedEvent)
    .where(and(
      inArray(listedEvent.competitorId, competitorIds), eq(listedEvent.series, false), notInArray(listedEvent.status, ['cancelled', 'postponed']),
      gte(listedEvent.startDate, today), lte(listedEvent.startDate, addDays(today, UPCOMING_EVENTS_DAYS)),
      gte(listedEvent.lastSeenAt, new Date(now.getTime() - UPCOMING_LAST_SEEN_DAYS * DAY_MS)),
    ))
    .groupBy(listedEvent.competitorId);
  for (const c of counts) if (out.get(c.id) !== null) out.set(c.id, Number(c.n));
  return out;
}

/** The newest measured capture's evidence id per business (it lists the counted events; no evidence, no claim). */
export async function eventsEvidenceIds(db: Db, competitorIds: string[]): Promise<string[]> {
  if (competitorIds.length === 0) return [];
  const rows = await db
    .selectDistinctOn([capture.competitorId], { id: evidence.id })
    .from(evidence)
    .innerJoin(capture, eq(capture.id, evidence.captureId))
    .where(and(inArray(capture.competitorId, competitorIds), measured()))
    .orderBy(capture.competitorId, desc(capture.capturedAt), asc(evidence.kind), asc(evidence.id));
  return rows.map((r) => r.id);
}
