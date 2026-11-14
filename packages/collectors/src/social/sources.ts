import { agencyServiceable, client, clientCompetitor, clientWorkAllowed, competitorSource, type Db } from '@cs/db';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { PackLoader } from '../rivals/run';

/** `competitor_source.source` of the weekly social pull. */
export const SOCIAL_KIND = 'social';

/**
 * Competitors a client tracks, or owns as its self business, where the client passes `clientWorkAllowed` and `agencyServiceable`
 * and its pack has `social: true`.
 */
export async function wantedSocialCompetitors(db: Db, packs: PackLoader): Promise<string[]> {
  const clients = await db
    .select({ id: client.id, verticalId: client.verticalId, selfId: client.selfCompetitorId })
    .from(client)
    .where(and(clientWorkAllowed(client), agencyServiceable(client.agencyId)));
  const optedVertical = new Map<string, boolean>();
  for (const v of new Set(clients.map((c) => c.verticalId))) optedVertical.set(v, (await packs(v)).social === true);
  const opted = clients.filter((c) => optedVertical.get(c.verticalId));
  const wanted = new Set<string>();
  for (const c of opted) if (c.selfId) wanted.add(c.selfId);
  if (opted.length > 0) {
    const rows = await db.select({ id: clientCompetitor.competitorId }).from(clientCompetitor).where(inArray(clientCompetitor.clientId, opted.map((c) => c.id)));
    for (const r of rows) wanted.add(r.id);
  }
  return [...wanted];
}

/**
 * `social` source rows exist (active) only for the competitors `wantedSocialCompetitors` returns; every other row is deactivated.
 */
export async function syncSocialSources(db: Db, packs: PackLoader): Promise<{ active: number; inactive: number }> {
  const ids = await wantedSocialCompetitors(db, packs);
  if (ids.length > 0) {
    await db.insert(competitorSource).values(ids.map((competitorId) => ({ competitorId, source: SOCIAL_KIND })))
      .onConflictDoUpdate({ target: [competitorSource.competitorId, competitorSource.source], set: { active: true } });
  }
  await db.update(competitorSource).set({ active: false })
    .where(and(eq(competitorSource.source, SOCIAL_KIND), eq(competitorSource.active, true), ids.length > 0 ? notInArray(competitorSource.competitorId, ids) : undefined));
  const [counts] = await db.select({
    inactive: sql<number>`count(*) FILTER (WHERE NOT ${competitorSource.active})`.mapWith(Number),
  }).from(competitorSource).where(eq(competitorSource.source, SOCIAL_KIND));
  return { active: ids.length, inactive: counts?.inactive ?? 0 };
}

/** Pushes the next try back a day without touching `last_run_at` (the source has not run), e.g. when the vendor key is missing. */
export async function deferSocialSource(db: Db, competitorId: string, status: string): Promise<void> {
  await db.execute(sql`UPDATE competitor_source SET next_due_at = now() + interval '1 day', last_status = ${status} WHERE competitor_id = ${competitorId} AND source = ${SOCIAL_KIND}`);
}
