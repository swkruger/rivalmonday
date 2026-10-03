import type { ChangeType } from '@cs/core';
import { type ChangeDetails, changeEvent, client, clientCompetitor, type Db, eventScore, type NumericChange, scoreFailure } from '@cs/db';
import { type AnyColumn, and, cosineDistance, desc, eq, gte, isNotNull, isNull, lt, ne, or, type SQL, sql } from 'drizzle-orm';
import { MAX_STAGE_ATTEMPTS, RETRY_BACKOFF_MINUTES } from '../stage';
import type { PackLoader } from '../tag/tag-stage';
import { type Route, scoreForClient } from './score';

/** A pair that failed recently (exponential backoff, like the stage sweep) or MAX_STAGE_ATTEMPTS times is skipped. */
export const scoreBackoff = (eventId: SQL | string, clientId: SQL | AnyColumn) => sql`EXISTS (
  SELECT 1 FROM score_failure f WHERE f.event_id = ${eventId}::uuid AND f.client_id = ${clientId}
    AND (f.attempts >= ${MAX_STAGE_ATTEMPTS}::int
         OR f.failed_at > now() - make_interval(mins => ${RETRY_BACKOFF_MINUTES}::int * power(2, f.attempts - 1)::int)))`;

/**
 * Order-insensitive signature of the numeric facts a change carries (kind, unit, before value, after value).
 * Two events "say the same news" when their signatures match — used so novelty discounts a *repeat* of a
 * price cut, not a second, different price cut on the same page block (which cosine-matches the first almost
 * perfectly because the surrounding text is unchanged).
 */
export function factsSignature(facts: NumericChange[]): string {
  return facts
    .map((f) => `${f.kind}|${(f.before ?? f.after)?.unit ?? ''}|${f.before?.value ?? ''}|${f.after?.value ?? ''}`)
    .sort()
    .join(';');
}

/**
 * The structured counterpart of `factsSignature`: the numbers (or item ids) a structured event reports.
 * Structured summaries are templates ("Google rating changed …"), so two different rating drops cosine-match
 * almost perfectly; comparing signatures keeps novelty for discounting true repeats only. Null for types
 * without such numbers (they keep plain cosine novelty).
 */
export function detailsSignature(changeType: string, d: ChangeDetails): string | null {
  switch (changeType) {
    case 'rating_change':
      return `rating|${d.ratingBefore ?? ''}|${d.ratingAfter ?? ''}`;
    case 'rank_change':
      return `rank|${d.keyword ?? ''}|${d.avgRankBefore ?? ''}|${d.avgRankAfter ?? ''}`;
    case 'review_spike':
      return `reviews|${d.theme ?? ''}|${d.count ?? ''}|${d.windowDays ?? ''}|${d.baselineMean ?? ''}`;
    case 'ad_started':
    case 'ad_stopped':
    case 'hiring':
      return `${changeType}|${(d.items ?? []).map((i) => i.id).sort().join(',')}`;
    default:
      return null;
  }
}

/**
 * Highest cosine similarity to an earlier event of the same competitor inside the window (pgvector).
 * Spec §6.3's novelty factor exists to discount repeats of the *same* news. When the event carries numeric
 * facts, only earlier events with the same facts signature count toward similarity — otherwise a second,
 * different price cut on the same block (e.g. $100→$80 then $80→$60) would cosine-match the first change
 * almost perfectly and get archived as a "repeat", silencing a real price war. Likewise, a structured event
 * with a `detailsSignature` only compares with earlier events of the same type and signature. An event with
 * neither falls back to plain max cosine over earlier events.
 */
export async function noveltySimilarity(
  db: Db,
  ev: { id: string; competitorId: string; clientId: string | null; embedding: number[] | null; occurredAt: Date; facts: NumericChange[]; changeType: string; details: ChangeDetails },
  windowDays: number,
): Promise<number | null> {
  if (!ev.embedding) return null;
  const since = new Date(ev.occurredAt.getTime() - windowDays * 86_400_000);
  // Global events compare with global events; a tenant event also with its own client's events — never another tenant's.
  const scope = ev.clientId ? or(isNull(changeEvent.clientId), eq(changeEvent.clientId, ev.clientId)) : isNull(changeEvent.clientId);
  const where = and(
    eq(changeEvent.competitorId, ev.competitorId), ne(changeEvent.id, ev.id), isNotNull(changeEvent.embedding),
    lt(changeEvent.occurredAt, ev.occurredAt), gte(changeEvent.occurredAt, since), scope, isNull(changeEvent.retractedAt),
  );
  const details = detailsSignature(ev.changeType, ev.details);
  if (ev.facts.length === 0 && details === null) {
    const [row] = await db
      .select({ sim: sql<number | null>`max(1 - (${cosineDistance(changeEvent.embedding, ev.embedding)}))` })
      .from(changeEvent)
      .where(where);
    return row?.sim === null || row?.sim === undefined ? null : Number(row.sim);
  }
  const signature = ev.facts.length > 0 ? factsSignature(ev.facts) : null;
  const sim = sql<number>`1 - (${cosineDistance(changeEvent.embedding, ev.embedding)})`;
  const candidates = await db
    .select({ id: changeEvent.id, facts: changeEvent.facts, changeType: changeEvent.changeType, details: changeEvent.details, sim })
    .from(changeEvent)
    .where(where)
    .orderBy(desc(sim));
  const match = candidates.find(
    (c) =>
      (signature === null || factsSignature(c.facts) === signature) &&
      (details === null || (c.changeType === ev.changeType && detailsSignature(c.changeType, c.details) === details)),
  );
  return match ? Number(match.sim) : null;
}

export interface ScoreRunResult {
  scored: number;
  failed: number;
  routes: Record<Route, number>;
}

/** Scores the event for every tracking client that has no score yet. Idempotent via event_score's primary key. */
export async function scoreEvent(deps: { db: Db; packs: PackLoader }, eventId: string, opts: { now?: Date } = {}): Promise<ScoreRunResult> {
  const [ev] = await deps.db.select().from(changeEvent).where(eq(changeEvent.id, eventId)).limit(1);
  if (!ev) throw new Error(`event ${eventId} not found`);
  const empty: ScoreRunResult = { scored: 0, failed: 0, routes: { alert: 0, brief: 0, archive: 0 } };
  if (ev.retractedAt) return empty; // Phase 3d: a retracted event is never (re)scored
  const now = opts.now ?? new Date();
  const ageDays = Math.max(0, (now.getTime() - ev.occurredAt.getTime()) / 86_400_000);
  const clients = await deps.db
    .select({ c: client })
    .from(clientCompetitor)
    .innerJoin(client, eq(client.id, clientCompetitor.clientId))
    .where(
      and(
        eq(clientCompetitor.competitorId, ev.competitorId),
        ev.clientId ? eq(client.id, ev.clientId) : undefined, // tenant-private events belong to one client
        // A complaint-theme spike (`review_spike` with `details.verticalId` set) was raised for one specific
        // vertical's theme list — never score it for a client of a different vertical tracking the same
        // competitor (a franchise competitor can span verticals, e.g. HVAC + dental).
        ev.details.verticalId ? eq(client.verticalId, ev.details.verticalId) : undefined,
        sql`NOT EXISTS (SELECT 1 FROM event_score s WHERE s.event_id = ${ev.id} AND s.client_id = ${client.id})`,
        sql`NOT ${scoreBackoff(ev.id, client.id)}`,
      ),
    );

  const result: ScoreRunResult = { scored: 0, failed: 0, routes: { alert: 0, brief: 0, archive: 0 } };
  const similarityByWindow = new Map<number, Promise<number | null>>();
  for (const { c } of clients) {
    try {
      const pack = await deps.packs(c.verticalId);
      const window = pack.scoring.novelty_window_days;
      if (!similarityByWindow.has(window)) similarityByWindow.set(window, noveltySimilarity(deps.db, ev, window));
      const s = scoreForClient(
        {
          changeType: ev.changeType as ChangeType, facts: ev.facts, serviceId: ev.services[c.verticalId] ?? null, zips: ev.zips, needsReview: ev.needsReview,
          maxSimilarity: await similarityByWindow.get(window)!, details: ev.details, ageDays,
        },
        { services: c.services, zips: c.serviceArea?.zips ?? [], thresholds: c.scoreThresholds ?? null },
        pack,
      );
      const inserted = await deps.db
        .insert(eventScore)
        .values({ agencyId: c.agencyId, clientId: c.id, eventId: ev.id, score: s.score, route: s.route, factors: s.factors, packVersion: pack.version })
        .onConflictDoNothing()
        .returning({ eventId: eventScore.eventId });
      if (inserted.length > 0) {
        result.scored++;
        result.routes[s.route]++;
      }
      await deps.db.delete(scoreFailure).where(and(eq(scoreFailure.eventId, ev.id), eq(scoreFailure.clientId, c.id)));
    } catch (err) {
      result.failed++;
      console.error(`[engine] scoring event ${ev.id} for client ${c.id} failed`, err);
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 2000);
      const [f] = await deps.db
        .insert(scoreFailure)
        .values({ eventId: ev.id, clientId: c.id, agencyId: c.agencyId, error: message })
        .onConflictDoUpdate({ target: [scoreFailure.eventId, scoreFailure.clientId], set: { attempts: sql`${scoreFailure.attempts} + 1`, error: message, failedAt: sql`now()` } })
        .returning({ attempts: scoreFailure.attempts });
      if (f && f.attempts >= MAX_STAGE_ATTEMPTS) console.warn(`[engine] scoring event ${ev.id} for client ${c.id} exhausted: ${message}`);
    }
  }
  return result;
}
