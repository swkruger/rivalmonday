import { agencyServiceable, clientWorkAllowed, client, competitor, type Db, observation } from '@cs/db';
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { ensureCompetitorSources } from '../sources/ensure';
import type { SourceKind } from '../sources/kinds';
import { normaliseDomain } from '../rivals/names';
import { findExistingCompetitor } from './accept';

/** The client's own business is benchmarked on reviews and its GBP rating, plus a weekly Google-ads check (12b, so the scorecard has its own ad count) — never crawled; Meta ads only when page ids are pinned. */
export const SELF_SOURCES = ['gbp', 'reviews', 'ads_google'] as const satisfies readonly SourceKind[];

/**
 * Links a client to a global competitor row for its own business (spec §6.5 "client vs each competitor"),
 * found by place id like the suggestion accept tools (`findExistingCompetitor`) or created from the client's name and place id. The row is
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

/**
 * Links every active client that has a place id but no self business yet; returns how many were linked. Then, for every active client's
 * existing self business: ensures the `ads_google` source (backfill for rows linked before it was a self source) and fills a null
 * `domain` from the latest GBP observation so the ads check has something to search (left null when another competitor owns the domain).
 * Prospects are skipped (5b-2 decision 9) — the prospect snapshot links its own business via `ensureSelfCompetitor`.
 */
export async function ensureSelfCompetitors(db: Db): Promise<number> {
  const rows = await db.select({ id: client.id }).from(client).where(and(isNotNull(client.placeId), isNull(client.selfCompetitorId), clientWorkAllowed(client), agencyServiceable(client.agencyId)));
  let linked = 0;
  for (const { id } of rows) if ('competitorId' in (await ensureSelfCompetitor(db, id))) linked++;
  await db.execute(sql`
    INSERT INTO competitor_source (competitor_id, source)
    SELECT DISTINCT c.self_competitor_id, 'ads_google' FROM client c
     WHERE ${clientWorkAllowed('c')} AND ${agencyServiceable(sql.raw('c.agency_id'))} AND c.self_competitor_id IS NOT NULL
    ON CONFLICT DO NOTHING`);
  await fillSelfDomains(db);
  return linked;
}

/** Postgres unique_violation, bare or wrapped by drizzle's query error (`cause`). */
const isUniqueViolation = (e: unknown): boolean => {
  const code = (x: unknown) => (typeof x === 'object' && x !== null ? (x as { code?: unknown }).code : undefined);
  return code(e) === '23505' || code((e as { cause?: unknown } | null)?.cause) === '23505';
};

export async function fillSelfDomains(db: Db): Promise<void> {
  const rows = await db
    .selectDistinctOn([competitor.id], { id: competitor.id, data: observation.data })
    .from(client)
    .innerJoin(competitor, eq(competitor.id, client.selfCompetitorId))
    .innerJoin(observation, and(eq(observation.competitorId, competitor.id), eq(observation.kind, 'gbp_profile'), eq(observation.key, 'profile')))
    .where(and(eq(client.status, 'active'), isNull(competitor.domain)))
    .orderBy(competitor.id, desc(observation.observedAt));
  for (const r of rows) {
    const raw = r.data as { domain?: unknown; url?: unknown };
    const domain = normaliseDomain(typeof raw.domain === 'string' ? raw.domain : typeof raw.url === 'string' ? raw.url : null);
    if (!domain) continue;
    // competitor.domain is globally unique: leave it null when another row owns it.
    // A concurrent writer can still claim the domain between the guard and the write: skip this row, never abort the tick.
    try {
      await db.execute(sql`UPDATE competitor SET domain = ${domain} WHERE id = ${r.id} AND domain IS NULL AND NOT EXISTS (SELECT 1 FROM competitor o WHERE o.domain = ${domain})`);
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      console.warn(`[collectors] self domain ${domain} for competitor ${r.id} was claimed concurrently; left unset`);
    }
  }
}
