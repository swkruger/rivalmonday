import { agencyServiceable, client, clientCompetitor, clientWorkAllowed, competitorSource, type Db, socialAccount } from '@cs/db';
import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import type { PackLoader } from '../rivals/run';

/** `competitor_source.source` of the weekly social pull. */
export const SOCIAL_KIND = 'social';

/**
 * `social` source rows exist (active) only for competitors a client tracks, or owns as its self business, where the client passes
 * `clientWorkAllowed` and `agencyServiceable` and its pack has `social: true`; every other row is deactivated. `discover` lists
 * the active competitors that have never run the source and have no `social_account` row (any status), so the caller enqueues
 * one discovery each: the first claim marks `last_run_at`, which ends the listing.
 */
export async function syncSocialSources(db: Db, packs: PackLoader): Promise<{ active: number; inactive: number; discover: string[] }> {
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
  const ids = [...wanted];
  if (ids.length > 0) {
    await db.insert(competitorSource).values(ids.map((competitorId) => ({ competitorId, source: SOCIAL_KIND })))
      .onConflictDoUpdate({ target: [competitorSource.competitorId, competitorSource.source], set: { active: true } });
  }
  await db.update(competitorSource).set({ active: false })
    .where(and(eq(competitorSource.source, SOCIAL_KIND), eq(competitorSource.active, true), ids.length > 0 ? notInArray(competitorSource.competitorId, ids) : undefined));
  const discover = ids.length === 0 ? [] : (await db.select({ id: competitorSource.competitorId }).from(competitorSource)
    .where(and(
      eq(competitorSource.source, SOCIAL_KIND), eq(competitorSource.active, true), isNull(competitorSource.lastRunAt), inArray(competitorSource.competitorId, ids),
      sql`NOT EXISTS (SELECT 1 FROM ${socialAccount} sa WHERE sa.competitor_id = ${competitorSource.competitorId})`,
    ))).map((r) => r.id);
  const [counts] = await db.select({
    inactive: sql<number>`count(*) FILTER (WHERE NOT ${competitorSource.active})`.mapWith(Number),
  }).from(competitorSource).where(eq(competitorSource.source, SOCIAL_KIND));
  return { active: ids.length, inactive: counts?.inactive ?? 0, discover };
}
