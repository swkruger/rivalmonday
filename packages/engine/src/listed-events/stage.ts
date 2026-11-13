import { GBP_EVENTS_URL, VENUE_PANEL_KIND } from '@cs/collectors';
import { capture, type ChangeDetails, clientCompetitor, type Db, detectedChange, type ListedEventSource, type ListedEventStatus, listedEvent, observation, stageRun } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { and, eq, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { runStage, type StageOutcome } from '../stage';
import type { CaptureRow } from '../structured/vendor-diff';
import { type EventCandidate, extractCandidates } from './candidates';
import { type ExistingEvent, mergeCandidates } from './merge';
import { eventKey, localDate } from './normalise';

export const LISTED_EVENTS_STAGE = 'listed_events';
export const LISTED_EVENTS_VERSION = 1;
/** At most this many single announcements per capture; the rest fold into one `event:more` aggregate (D8). */
export const EVENT_SINGLES_MAX = 5;
/** Same `name_norm` starting this many days before ⇒ a series (no announcement, D8). */
export const SERIES_DAYS = 35;
/** Announcements only for events starting within this many days of the capture date (D7). */
export const ANNOUNCE_HORIZON_DAYS = 365;
const DEFAULT_TZ = 'America/Chicago';
const DAY_MS = 86_400_000;

export interface ListedEventsResult {
  /** Distinct `listed_event` rows written (inserted or refreshed) from this capture. */
  rows: number;
  changes: string[];
  baseline: boolean;
}

type Lifecycle = 'announced' | 'cancelled' | 'postponed' | 'sold_out';
type Existing = ExistingEvent & { name: string; url: string | null; ticketed: boolean };
interface RowPlan {
  key: string; name: string; nameNorm: string; startDate: string; startsAt: string | null; endsAt: string | null; status: ListedEventStatus;
  url: string | null; venue: string | null; ticketed: boolean; series: boolean;
  /** scheduled → cancelled/postponed/sold_out read from JSON-LD (the row's status follows it). */
  flipTo: ListedEventStatus | null;
}
interface ChangePlan { key: string | null; lifecycle: Lifecycle; name: string; startDate: string; ticketed: boolean; url: string | null; count?: number }

const sourceKeyOf = (cap: CaptureRow): ListedEventSource | null => {
  if (cap.status !== 'ok') return null;
  if (cap.source === 'web' && cap.trackedPageId) return 'web';
  if (cap.source === 'meta_ads') return 'meta_ads';
  if (cap.source === 'google_business_profile' && cap.url === GBP_EVENTS_URL) return 'google_panel';
  return null;
};
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** One candidate per event key: later duplicates only add ticketed / url / venue / times. */
function dedupe(cands: EventCandidate[]): EventCandidate[] {
  const byKey = new Map<string, EventCandidate>();
  for (const c of cands) {
    const k = eventKey(c.nameNorm, c.startDate);
    const prev = byKey.get(k);
    byKey.set(k, prev ? { ...prev, ticketed: prev.ticketed || c.ticketed, url: prev.url ?? c.url, venue: prev.venue ?? c.venue, startsAt: prev.startsAt ?? c.startsAt, endsAt: prev.endsAt ?? c.endsAt } : c);
  }
  return [...byKey.values()];
}

/**
 * Spec D6–D8: the events one ok capture lists (venue panel `gbp:events`, Event JSON-LD of a tracked page, Meta ads
 * last seen in it) → `listed_event` rows (merged across sources) and `event_listed` changes. Announcements only for
 * new events starting within 365 days of a tracked competitor×source that had an earlier processed capture
 * (the first is a silent baseline), never for a series; JSON-LD status flips of upcoming events once per
 * key×lifecycle; vanishing never emits. Self-only competitors get rows, no changes. Rules only, no model calls.
 */
export async function detectListedEvents(deps: { db: Db; store: ObjectStore }, captureId: string): Promise<StageOutcome<ListedEventsResult>> {
  const [cap] = await deps.db.select().from(capture).where(eq(capture.id, captureId)).limit(1);
  const sourceKey = cap ? sourceKeyOf(cap) : null;
  if (!cap || !sourceKey) throw new Error(`capture ${captureId} is not an ok events capture (tracked web page, meta_ads or gbp:events)`);

  return runStage(
    deps.db,
    { stage: LISTED_EVENTS_STAGE, version: LISTED_EVENTS_VERSION, subjectId: captureId },
    async () => {
      let tz = DEFAULT_TZ;
      if (sourceKey === 'google_panel') {
        const [o] = await deps.db.select({ data: observation.data }).from(observation).where(and(eq(observation.captureId, cap.id), eq(observation.kind, VENUE_PANEL_KIND), eq(observation.key, 'events'))).limit(1);
        if (typeof o?.data.timeZone === 'string') tz = o.data.timeZone;
      }
      const today = localDate(cap.capturedAt, tz);
      const cands = dedupe(await extractCandidates(deps, cap));

      const [earlier] = await deps.db
        .select({ id: capture.id })
        .from(capture)
        .innerJoin(stageRun, and(eq(stageRun.subjectId, capture.id), eq(stageRun.stage, LISTED_EVENTS_STAGE), eq(stageRun.stageVersion, LISTED_EVENTS_VERSION), eq(stageRun.status, 'done')))
        .where(and(
          eq(capture.competitorId, cap.competitorId), eq(capture.source, cap.source), lt(capture.capturedAt, cap.capturedAt), ne(capture.id, cap.id),
          sourceKey === 'google_panel' ? eq(capture.url, GBP_EVENTS_URL) : sourceKey === 'web' ? sql`${capture.trackedPageId} IS NOT NULL` : undefined,
        ))
        .limit(1);
      const baseline = !earlier;
      const [trackedRow] = await deps.db.select({ id: clientCompetitor.clientId }).from(clientCompetitor).where(eq(clientCompetitor.competitorId, cap.competitorId)).limit(1);
      const tracked = Boolean(trackedRow);

      const existing: Existing[] = await deps.db
        .select({ id: listedEvent.id, eventKey: listedEvent.eventKey, nameNorm: listedEvent.nameNorm, startDate: listedEvent.startDate, status: listedEvent.status, sources: listedEvent.sources, name: listedEvent.name, url: listedEvent.url, ticketed: listedEvent.ticketed })
        .from(listedEvent)
        .where(and(eq(listedEvent.competitorId, cap.competitorId), sql`${listedEvent.startDate} BETWEEN ${addDays(today, -36)}::date AND ${addDays(today, 366)}::date`));
      const ops = mergeCandidates(existing, cands);
      const byId = new Map(existing.map((e) => [e.id, e]));

      // One plan per row key (two candidates can match the same existing row); an upsert may touch a row only once.
      const plans = new Map<string, RowPlan>();
      const inserts: { key: string; cand: EventCandidate; series: boolean }[] = [];
      const flips: { row: Existing; to: ListedEventStatus; cand: EventCandidate }[] = [];
      for (const op of ops) {
        if (op.op === 'insert') {
          const { key, cand } = op;
          const from = addDays(cand.startDate, -SERIES_DAYS);
          const inSeries = (nameNorm: string, startDate: string) => nameNorm === cand.nameNorm && startDate >= from && startDate < cand.startDate;
          const series = existing.some((e) => inSeries(e.nameNorm, e.startDate)) || ops.some((o) => o.op === 'insert' && o !== op && inSeries(o.cand.nameNorm, o.cand.startDate));
          inserts.push({ key, cand, series });
          plans.set(key, { key, name: cand.name, nameNorm: cand.nameNorm, startDate: cand.startDate, startsAt: cand.startsAt, endsAt: cand.endsAt, status: cand.status, url: cand.url, venue: cand.venue, ticketed: cand.ticketed, series, flipTo: null });
          continue;
        }
        const { cand, statusFlip } = op;
        const row = byId.get(op.existing.id)!;
        const prev = plans.get(row.eventKey);
        const flipTo = statusFlip ? cand.status : null;
        plans.set(row.eventKey, prev
          ? { ...prev, url: prev.url ?? cand.url, venue: prev.venue ?? cand.venue, startsAt: prev.startsAt ?? cand.startsAt, endsAt: prev.endsAt ?? cand.endsAt, ticketed: prev.ticketed || cand.ticketed, flipTo: prev.flipTo ?? flipTo }
          : { key: row.eventKey, name: row.name, nameNorm: row.nameNorm, startDate: row.startDate, startsAt: cand.startsAt, endsAt: cand.endsAt, status: row.status, url: cand.url, venue: cand.venue, ticketed: cand.ticketed, series: false, flipTo });
        if (flipTo && !flips.some((f) => f.row.id === row.id)) flips.push({ row, to: flipTo, cand });
      }

      const changes: ChangePlan[] = [];
      if (tracked) {
        const horizon = addDays(today, ANNOUNCE_HORIZON_DAYS);
        const announce = baseline
          ? []
          : inserts.filter((i) => !i.series && i.cand.startDate >= today && i.cand.startDate <= horizon).sort((a, b) => a.cand.startDate.localeCompare(b.cand.startDate) || a.key.localeCompare(b.key));
        for (const { key, cand } of announce.slice(0, EVENT_SINGLES_MAX)) changes.push({ key, lifecycle: 'announced', name: cand.name, startDate: cand.startDate, ticketed: cand.ticketed, url: cand.url });
        const rest = announce.slice(EVENT_SINGLES_MAX);
        if (rest.length > 0) changes.push({ key: null, lifecycle: 'announced', name: `${rest.length} more events`, startDate: rest[0]!.cand.startDate, ticketed: false, url: null, count: rest.length });

        const upcoming = flips.filter((f) => f.row.startDate >= today);
        if (upcoming.length > 0) {
          const blockOf = (f: (typeof upcoming)[number]) => `event:${f.row.eventKey}:${f.to}`;
          const live = await deps.db
            .select({ blockKey: detectedChange.blockKey })
            .from(detectedChange)
            .where(and(eq(detectedChange.competitorId, cap.competitorId), inArray(detectedChange.blockKey, upcoming.map(blockOf)), ne(detectedChange.status, 'superseded'), isNull(detectedChange.rankScanId)));
          const seen = new Set(live.map((l) => l.blockKey));
          for (const f of upcoming) {
            if (seen.has(blockOf(f))) continue;
            changes.push({ key: f.row.eventKey, lifecycle: f.to as Lifecycle, name: f.row.name, startDate: f.row.startDate, ticketed: f.row.ticketed || f.cand.ticketed, url: f.row.url ?? f.cand.url });
          }
        }
      }
      return { baseline, rows: [...plans.values()], changes };
    },
    async (tx, c) => {
      const ids = new Map<string, string>();
      if (c.rows.length > 0) {
        const written = await tx
          .insert(listedEvent)
          .values(c.rows.map((p) => ({
            competitorId: cap.competitorId, eventKey: p.key, name: p.name, nameNorm: p.nameNorm, startDate: p.startDate,
            startsAt: p.startsAt ? new Date(p.startsAt) : null, endsAt: p.endsAt ? new Date(p.endsAt) : null, status: p.status, sources: [sourceKey],
            url: p.url, venue: p.venue, ticketed: p.ticketed, series: p.series, firstCaptureId: cap.id, lastCaptureId: cap.id, firstSeenAt: cap.capturedAt, lastSeenAt: cap.capturedAt,
          })))
          .onConflictDoUpdate({
            target: [listedEvent.competitorId, listedEvent.eventKey],
            set: {
              sources: sql`ARRAY(SELECT DISTINCT s FROM unnest(listed_event.sources || excluded.sources) AS s ORDER BY s)`,
              lastCaptureId: sql`excluded.last_capture_id`, lastSeenAt: sql`excluded.last_seen_at`,
              url: sql`coalesce(listed_event.url, excluded.url)`, venue: sql`coalesce(listed_event.venue, excluded.venue)`,
              startsAt: sql`coalesce(listed_event.starts_at, excluded.starts_at)`, endsAt: sql`coalesce(listed_event.ends_at, excluded.ends_at)`,
              ticketed: sql`listed_event.ticketed OR excluded.ticketed`,
            },
          })
          .returning({ id: listedEvent.id, eventKey: listedEvent.eventKey });
        for (const w of written) ids.set(w.eventKey, w.id);
        for (const p of c.rows) {
          if (!p.flipTo) continue;
          await tx.update(listedEvent)
            .set({ status: p.flipTo, statusCaptureId: cap.id, statusChangedAt: cap.capturedAt })
            .where(and(eq(listedEvent.competitorId, cap.competitorId), eq(listedEvent.eventKey, p.key), eq(listedEvent.status, 'scheduled')));
        }
      }
      const values = c.changes.map((ch) => {
        const details: ChangeDetails = ch.key === null
          ? { changeType: 'event_listed', lifecycle: ch.lifecycle, startDate: ch.startDate, source: sourceKey, count: ch.count }
          : { changeType: 'event_listed', lifecycle: ch.lifecycle, eventKey: ch.key, eventName: ch.name, startDate: ch.startDate, ticketed: ch.ticketed, listedEventId: ids.get(ch.key), source: sourceKey, url: ch.url };
        return {
          competitorId: cap.competitorId, source: cap.source, kind: ch.lifecycle === 'announced' ? 'added' : 'modified', afterCaptureId: cap.id, beforeCaptureId: null,
          blockKey: ch.key === null ? 'event:more' : `event:${ch.key}:${ch.lifecycle}`, beforeText: null, afterText: ch.name, stageVersion: LISTED_EVENTS_VERSION, details,
        } satisfies typeof detectedChange.$inferInsert;
      });
      const rows = values.length > 0 ? await tx.insert(detectedChange).values(values).onConflictDoNothing().returning({ id: detectedChange.id }) : [];
      return { rows: c.rows.length, changes: rows.map((r) => r.id), baseline: c.baseline } satisfies ListedEventsResult;
    },
  );
}
