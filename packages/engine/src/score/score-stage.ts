import type { ChangeType } from '@cs/core';
import { changeEvent, client, clientCompetitor, type Db, eventScore } from '@cs/db';
import { and, cosineDistance, eq, gte, isNotNull, lt, ne, sql } from 'drizzle-orm';
import type { PackLoader } from '../tag/tag-stage';
import { type Route, scoreForClient } from './score';

/** Highest cosine similarity to an earlier event of the same competitor inside the window (pgvector). */
export async function noveltySimilarity(
  db: Db,
  ev: { id: string; competitorId: string; embedding: number[] | null; occurredAt: Date },
  windowDays: number,
): Promise<number | null> {
  if (!ev.embedding) return null;
  const since = new Date(ev.occurredAt.getTime() - windowDays * 86_400_000);
  const [row] = await db
    .select({ sim: sql<number | null>`max(1 - (${cosineDistance(changeEvent.embedding, ev.embedding)}))` })
    .from(changeEvent)
    .where(
      and(
        eq(changeEvent.competitorId, ev.competitorId), ne(changeEvent.id, ev.id), isNotNull(changeEvent.embedding),
        lt(changeEvent.occurredAt, ev.occurredAt), gte(changeEvent.occurredAt, since),
      ),
    );
  return row?.sim === null || row?.sim === undefined ? null : Number(row.sim);
}

export interface ScoreRunResult {
  scored: number;
  failed: number;
  routes: Record<Route, number>;
}

/** Scores the event for every tracking client that has no score yet. Idempotent via event_score's primary key. */
export async function scoreEvent(deps: { db: Db; packs: PackLoader }, eventId: string): Promise<ScoreRunResult> {
  const [ev] = await deps.db.select().from(changeEvent).where(eq(changeEvent.id, eventId)).limit(1);
  if (!ev) throw new Error(`event ${eventId} not found`);
  const clients = await deps.db
    .select({ c: client })
    .from(clientCompetitor)
    .innerJoin(client, eq(client.id, clientCompetitor.clientId))
    .where(and(eq(clientCompetitor.competitorId, ev.competitorId), sql`NOT EXISTS (SELECT 1 FROM event_score s WHERE s.event_id = ${ev.id} AND s.client_id = ${client.id})`));

  const result: ScoreRunResult = { scored: 0, failed: 0, routes: { alert: 0, brief: 0, archive: 0 } };
  const similarityByWindow = new Map<number, Promise<number | null>>();
  for (const { c } of clients) {
    try {
      const pack = await deps.packs(c.verticalId);
      const window = pack.scoring.novelty_window_days;
      if (!similarityByWindow.has(window)) similarityByWindow.set(window, noveltySimilarity(deps.db, ev, window));
      const s = scoreForClient(
        { changeType: ev.changeType as ChangeType, facts: ev.facts, serviceId: ev.services[c.verticalId] ?? null, zips: ev.zips, needsReview: ev.needsReview, maxSimilarity: await similarityByWindow.get(window)! },
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
