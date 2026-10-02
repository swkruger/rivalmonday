import type { ChangeType } from '@cs/core';
import { changeEvent, client, clientCompetitor, type Db, eventScore, type NumericChange } from '@cs/db';
import { and, cosineDistance, desc, eq, gte, isNotNull, isNull, lt, ne, or, sql } from 'drizzle-orm';
import type { PackLoader } from '../tag/tag-stage';
import { type Route, scoreForClient } from './score';

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
 * Highest cosine similarity to an earlier event of the same competitor inside the window (pgvector).
 * Spec §6.3's novelty factor exists to discount repeats of the *same* news. When the event carries numeric
 * facts, only earlier events with the same facts signature count toward similarity — otherwise a second,
 * different price cut on the same block (e.g. $100→$80 then $80→$60) would cosine-match the first change
 * almost perfectly and get archived as a "repeat", silencing a real price war. An event with no facts falls
 * back to plain max cosine over earlier events.
 */
export async function noveltySimilarity(
  db: Db,
  ev: { id: string; competitorId: string; clientId: string | null; embedding: number[] | null; occurredAt: Date; facts: NumericChange[] },
  windowDays: number,
): Promise<number | null> {
  if (!ev.embedding) return null;
  const since = new Date(ev.occurredAt.getTime() - windowDays * 86_400_000);
  // Global events compare with global events; a tenant event also with its own client's events — never another tenant's.
  const scope = ev.clientId ? or(isNull(changeEvent.clientId), eq(changeEvent.clientId, ev.clientId)) : isNull(changeEvent.clientId);
  const where = and(
    eq(changeEvent.competitorId, ev.competitorId), ne(changeEvent.id, ev.id), isNotNull(changeEvent.embedding),
    lt(changeEvent.occurredAt, ev.occurredAt), gte(changeEvent.occurredAt, since), scope,
  );
  if (ev.facts.length === 0) {
    const [row] = await db
      .select({ sim: sql<number | null>`max(1 - (${cosineDistance(changeEvent.embedding, ev.embedding)}))` })
      .from(changeEvent)
      .where(where);
    return row?.sim === null || row?.sim === undefined ? null : Number(row.sim);
  }
  const signature = factsSignature(ev.facts);
  const sim = sql<number>`1 - (${cosineDistance(changeEvent.embedding, ev.embedding)})`;
  const candidates = await db
    .select({ id: changeEvent.id, facts: changeEvent.facts, sim })
    .from(changeEvent)
    .where(where)
    .orderBy(desc(sim));
  const match = candidates.find((c) => factsSignature(c.facts) === signature);
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
        sql`NOT EXISTS (SELECT 1 FROM event_score s WHERE s.event_id = ${ev.id} AND s.client_id = ${client.id})`,
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
    } catch (err) {
      result.failed++;
      console.error(`[engine] scoring event ${ev.id} for client ${c.id} failed`, err);
    }
  }
  return result;
}
