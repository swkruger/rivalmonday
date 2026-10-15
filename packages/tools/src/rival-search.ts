import { ToolError } from '@cs/core';
import { failRivalRun } from '@cs/collectors';
import { agency, client, discoveryRun, type DiscoveryRunRow, type Tx } from '@cs/db';
import { and, count, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { enqueueOf, type ToolDeps } from './deps';
import { RIVAL_SEARCH_COOLDOWN_MINUTES, RIVAL_SEARCHES_PER_AGENCY_DAY } from './limits';

export type SearchTrigger = 'auto' | 'manual' | 'convert';
export type SearchRefusal = 'missing_profile' | 'cooldown' | 'running' | 'daily_cap';
export type SearchStart = { runId: string } | { refused: SearchRefusal };

const LIVE = ['queued', 'searching', 'checking', 'finalising'] as const;

/** Postgres unique violation (the `discovery_run_one_live` index), possibly wrapped by drizzle. */
function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === '23505') return true;
  }
  return false;
}

/** The client's newest discovery run with `status = 'done'`, or null. Pass the caller's tenant tx or the service Db. */
export async function latestDoneRun(db: Pick<Tx, 'select'>, clientId: string): Promise<DiscoveryRunRow | null> {
  const [run] = await db.select().from(discoveryRun).where(and(eq(discoveryRun.clientId, clientId), eq(discoveryRun.status, 'done'))).orderBy(sql`${discoveryRun.finishedAt} DESC NULLS LAST`, desc(discoveryRun.startedAt)).limit(1);
  return run ?? null;
}

/**
 * Phase 12a D4/D7: the one entry point that starts a paid competitor search for a client. The caller has already
 * proved access. Refusals are returned, never thrown, so `auto` callers stay silent; a missing queue (`deps.enqueue`)
 * throws `internal` before anything is written. The agency row is locked so the daily cap can't be raced past.
 */
export async function startCompetitorSearch(deps: ToolDeps, clientId: string, trigger: SearchTrigger): Promise<SearchStart> {
  const enqueue = enqueueOf(deps);
  const [c] = await deps.service.select({ agencyId: client.agencyId, keywords: client.keywords, serviceArea: client.serviceArea, placeId: client.placeId }).from(client).where(eq(client.id, clientId));
  if (!c) throw new ToolError('not_found', 'Client not found');
  if (c.keywords.length === 0 || !c.serviceArea || !c.placeId) return { refused: 'missing_profile' };

  let started: SearchStart;
  try {
    started = await deps.service.transaction(async (tx): Promise<SearchStart> => {
      await tx.select({ id: agency.id }).from(agency).where(eq(agency.id, c.agencyId)).for('update');
      const [live] = await tx.select({ id: discoveryRun.id }).from(discoveryRun).where(and(eq(discoveryRun.clientId, clientId), inArray(discoveryRun.status, [...LIVE]))).limit(1);
      if (live) return { refused: 'running' };
      const [last] = await tx.select({ finishedAt: discoveryRun.finishedAt }).from(discoveryRun).where(and(eq(discoveryRun.clientId, clientId), isNotNull(discoveryRun.finishedAt))).orderBy(desc(discoveryRun.finishedAt)).limit(1);
      if (last?.finishedAt && Date.now() - last.finishedAt.getTime() < RIVAL_SEARCH_COOLDOWN_MINUTES * 60_000) return { refused: 'cooldown' };
      const [today] = await tx.select({ n: count() }).from(discoveryRun).where(and(eq(discoveryRun.agencyId, c.agencyId), gte(discoveryRun.startedAt, sql`date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`)));
      if ((today?.n ?? 0) >= RIVAL_SEARCHES_PER_AGENCY_DAY) return { refused: 'daily_cap' };
      const [row] = await tx.insert(discoveryRun).values({ agencyId: c.agencyId, clientId, trigger }).returning({ id: discoveryRun.id });
      return { runId: row!.id };
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { refused: 'running' };
    throw err;
  }
  if ('refused' in started) return started;
  try {
    await enqueue('rival-search', { runId: started.runId }, `rival:${clientId}`);
  } catch (err) {
    // Never leave a live run nobody will execute: it would block this client's searches (one live run per client).
    await failRivalRun(deps.service, started.runId, 'enqueue_failed');
    throw err;
  }
  return started;
}

/** `auto`/`convert` hooks: start a search if possible and never fail the caller. Without a queue nothing is written. */
export async function startCompetitorSearchQuietly(deps: ToolDeps, clientId: string, trigger: Exclude<SearchTrigger, 'manual'>): Promise<SearchStart | null> {
  if (!deps.enqueue) return null;
  try {
    return await startCompetitorSearch(deps, clientId, trigger);
  } catch (err) {
    console.warn(`[rival-search] ${trigger} start for ${clientId} failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
