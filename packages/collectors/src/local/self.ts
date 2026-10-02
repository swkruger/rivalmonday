import { client, competitor, type Db } from '@cs/db';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { ensureCompetitorSources } from '../sources/ensure';
import type { SourceKind } from '../sources/kinds';
import { findExistingCompetitor } from './accept';

/** The client's own business is benchmarked on reviews and its GBP rating only — never crawled, never ad-pulled (Phase 3c decision 1). */
export const SELF_SOURCES = ['gbp', 'reviews'] as const satisfies readonly SourceKind[];

/**
 * Links a client to a global competitor row for its own business (spec §6.5 "client vs each competitor"),
 * found by place id like `acceptSuggestion` or created from the client's name and place id. The row is
 * never added to client_competitor, so its events are never scored or routed for the client itself.
 */
export async function ensureSelfCompetitor(db: Db, clientId: string): Promise<{ competitorId: string } | { skipped: string }> {
  const [c] = await db.select().from(client).where(eq(client.id, clientId)).limit(1);
  if (!c) throw new Error(`client ${clientId} not found`);
  if (c.selfCompetitorId) return { competitorId: c.selfCompetitorId };
  if (!c.placeId) return { skipped: 'client has no placeId' };
  const match = { placeId: c.placeId, cid: null, domain: null };
  let competitorId = (await findExistingCompetitor(db, match))?.id;
  if (!competitorId) {
    const [row] = await db.insert(competitor).values({ name: c.name, placeId: c.placeId }).onConflictDoNothing().returning({ id: competitor.id });
    competitorId = row?.id ?? (await findExistingCompetitor(db, match))?.id;
    if (!competitorId) throw new Error(`could not create or find a competitor for client ${clientId}`);
    await ensureCompetitorSources(db, competitorId, SELF_SOURCES);
  }
  await db.update(client).set({ selfCompetitorId: competitorId }).where(eq(client.id, clientId));
  return { competitorId };
}

/** Links every client that has a place id but no self business yet; returns how many were linked. */
export async function ensureSelfCompetitors(db: Db): Promise<number> {
  const rows = await db.select({ id: client.id }).from(client).where(and(isNotNull(client.placeId), isNull(client.selfCompetitorId)));
  let linked = 0;
  for (const { id } of rows) if ('competitorId' in (await ensureSelfCompetitor(db, id))) linked++;
  return linked;
}
