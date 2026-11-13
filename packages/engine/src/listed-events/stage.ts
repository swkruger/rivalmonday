import { GBP_EVENTS_URL, VENUE_PANEL_KIND } from '@cs/collectors';
import { agencyServiceable, capture, type ChangeDetails, clientWorkAllowed, type Db, detectedChange, type ListedEventSource, type ListedEventStatus, listedEvent, observation, stageRun, type Tx } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { and, eq, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { safeTimezone } from '../briefs/schedule';
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
type ChangePlan =
  | { kind: 'single'; key: string; lifecycle: Lifecycle; name: string; startDate: string; ticketed: boolean; url: string | null }
  /** The announcements past EVENT_SINGLES_MAX, by start date. */
  | { kind: 'more'; keys: { key: string; startDate: string }[] };
/** What the compute step decided; the commit writes it (and re-checks races). Exported for tests only. */
export interface ListedEventsPlan { baseline: boolean; rows: RowPlan[]; changes: ChangePlan[] }

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

/** Loads the capture and checks it is one the stage accepts (ok tracked-page web, meta_ads or gbp:events); else throws. */
export async function loadEventsCapture(db: Db, captureId: string): Promise<{ cap: CaptureRow; sourceKey: ListedEventSource }> {
  const [cap] = await db.select().from(capture).where(eq(capture.id, captureId)).limit(1);
  const sourceKey = cap ? sourceKeyOf(cap) : null;
  if (!cap || !sourceKey) throw new Error(`capture ${captureId} is not an ok events capture (tracked web page, meta_ads or gbp:events)`);
  return { cap, sourceKey };
}

/** Compute step (no writes). Exported for tests only. */
export async function planListedEvents(deps: { db: Db; store: ObjectStore }, cap: CaptureRow, sourceKey: ListedEventSource): Promise<ListedEventsPlan> {
  let tz = DEFAULT_TZ;
  if (sourceKey === 'google_panel') {
    const [o] = await deps.db.select({ data: observation.data }).from(observation).where(and(eq(observation.captureId, cap.id), eq(observation.kind, VENUE_PANEL_KIND), eq(observation.key, 'events'))).limit(1);
    if (typeof o?.data.timeZone === 'string') tz = safeTimezone(o.data.timeZone); // vendor text: an unknown zone falls back to Chicago
  }
  const today = localDate(cap.capturedAt, tz);
  const cands = dedupe(await extractCandidates(deps, cap));

  // Baseline per competitor × source; a web page is its own source (a new events page starts silently).
  const [earlier] = await deps.db
    .select({ id: capture.id })
    .from(capture)
    .innerJoin(stageRun, and(eq(stageRun.subjectId, capture.id), eq(stageRun.stage, LISTED_EVENTS_STAGE), eq(stageRun.stageVersion, LISTED_EVENTS_VERSION), eq(stageRun.status, 'done')))
    .where(and(
      eq(capture.competitorId, cap.competitorId), eq(capture.source, cap.source), lt(capture.capturedAt, cap.capturedAt), ne(capture.id, cap.id),
      sourceKey === 'google_panel' ? eq(capture.url, GBP_EVENTS_URL) : sourceKey === 'web' ? eq(capture.trackedPageId, cap.trackedPageId!) : undefined,
    ))
    .limit(1);
  const baseline = !earlier;
  // Tracked = some workable client tracks it (the sweep's predicate); self businesses are never in client_competitor.
  const [trackedRow] = (await deps.db.execute(sql`
    SELECT 1 AS one FROM client_competitor cc JOIN client cl ON cl.id = cc.client_id
    WHERE cc.competitor_id = ${cap.competitorId}::uuid AND ${clientWorkAllowed('cl')} AND ${agencyServiceable(sql.raw('cl.agency_id'))}
    LIMIT 1`)) as unknown as { one: number }[];
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
    // A first-seen cancelled/postponed/sold-out event gets a row, never an announcement.
    const announce = baseline
      ? []
      : inserts
          .filter((i) => !i.series && i.cand.status === 'scheduled' && i.cand.startDate >= today && i.cand.startDate <= horizon)
          .sort((a, b) => a.cand.startDate.localeCompare(b.cand.startDate) || a.key.localeCompare(b.key));
    for (const { key, cand } of announce.slice(0, EVENT_SINGLES_MAX)) changes.push({ kind: 'single', key, lifecycle: 'announced', name: cand.name, startDate: cand.startDate, ticketed: cand.ticketed, url: cand.url });
    const rest = announce.slice(EVENT_SINGLES_MAX);
    if (rest.length > 0) changes.push({ kind: 'more', keys: rest.map((i) => ({ key: i.key, startDate: i.cand.startDate })) });

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
        changes.push({ kind: 'single', key: f.row.eventKey, lifecycle: f.to as Lifecycle, name: f.row.name, startDate: f.row.startDate, ticketed: f.row.ticketed || f.cand.ticketed, url: f.row.url ?? f.cand.url });
      }
    }
  }
  return { baseline, rows: [...plans.values()], changes };
}

/**
 * Commit step. Race-safe: an announcement is written only for a row this transaction actually inserted (`xmax = 0`),
 * a flip only when the guarded `status = 'scheduled'` update returned the row. Exported for tests only.
 */
export async function commitListedEvents(tx: Tx, cap: CaptureRow, sourceKey: ListedEventSource, plan: ListedEventsPlan): Promise<ListedEventsResult> {
  const ids = new Map<string, string>();
  const inserted = new Set<string>();
  const flipped = new Map<string, ListedEventStatus>();
  if (plan.rows.length > 0) {
    const written = await tx
      .insert(listedEvent)
      .values(plan.rows.map((p) => ({
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
      .returning({ id: listedEvent.id, eventKey: listedEvent.eventKey, inserted: sql<boolean>`(xmax = 0)` });
    for (const w of written) {
      ids.set(w.eventKey, w.id);
      if (w.inserted) inserted.add(w.eventKey);
    }
    for (const p of plan.rows) {
      if (!p.flipTo) continue;
      const done = await tx.update(listedEvent)
        .set({ status: p.flipTo, statusCaptureId: cap.id, statusChangedAt: cap.capturedAt })
        .where(and(eq(listedEvent.competitorId, cap.competitorId), eq(listedEvent.eventKey, p.key), eq(listedEvent.status, 'scheduled')))
        .returning({ id: listedEvent.id });
      if (done.length > 0) flipped.set(p.key, p.flipTo);
    }
  }
  const values: (typeof detectedChange.$inferInsert)[] = [];
  const base = { competitorId: cap.competitorId, source: cap.source, afterCaptureId: cap.id, beforeCaptureId: null, beforeText: null, stageVersion: LISTED_EVENTS_VERSION };
  for (const ch of plan.changes) {
    if (ch.kind === 'more') {
      const won = ch.keys.filter((k) => inserted.has(k.key));
      if (won.length === 0) continue;
      const details: ChangeDetails = { changeType: 'event_listed', lifecycle: 'announced', startDate: won[0]!.startDate, source: sourceKey, count: won.length };
      values.push({ ...base, kind: 'added', blockKey: 'event:more', afterText: `${won.length} more events`, details });
      continue;
    }
    const ok = ch.lifecycle === 'announced' ? inserted.has(ch.key) : flipped.get(ch.key) === ch.lifecycle;
    if (!ok) continue;
    const details: ChangeDetails = {
      changeType: 'event_listed', lifecycle: ch.lifecycle, eventKey: ch.key, eventName: ch.name, startDate: ch.startDate, ticketed: ch.ticketed, listedEventId: ids.get(ch.key), source: sourceKey, url: ch.url,
    };
    values.push({ ...base, kind: ch.lifecycle === 'announced' ? 'added' : 'modified', blockKey: `event:${ch.key}:${ch.lifecycle}`, afterText: ch.name, details });
  }
  const rows = values.length > 0 ? await tx.insert(detectedChange).values(values).onConflictDoNothing().returning({ id: detectedChange.id }) : [];
  return { rows: plan.rows.length, changes: rows.map((r) => r.id), baseline: plan.baseline };
}

/**
 * Spec D6–D8: the events one ok capture lists (venue panel `gbp:events`, Event JSON-LD of a tracked page, Meta ads
 * active at the capture) → `listed_event` rows (merged across sources) and `event_listed` changes. Announcements only
 * for new scheduled events starting within 365 days, of a competitor a workable client tracks, from a source (web: the
 * page) that had an earlier processed capture (the first is a silent baseline), never for a series; JSON-LD status
 * flips of upcoming events once per key×lifecycle; vanishing never emits. Self-only competitors get rows, no changes.
 * Rules only, no model calls.
 */
export async function detectListedEvents(deps: { db: Db; store: ObjectStore }, captureId: string): Promise<StageOutcome<ListedEventsResult>> {
  const { cap, sourceKey } = await loadEventsCapture(deps.db, captureId);
  return runStage(
    deps.db,
    { stage: LISTED_EVENTS_STAGE, version: LISTED_EVENTS_VERSION, subjectId: captureId },
    () => planListedEvents(deps, cap, sourceKey),
    (tx, plan) => commitListedEvents(tx, cap, sourceKey, plan),
  );
}
