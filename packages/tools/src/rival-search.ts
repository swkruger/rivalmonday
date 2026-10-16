import { ToolError } from '@cs/core';
import { agency, client, discoveryRun, type DiscoveryRunRow, type DiscoveryRunTrigger, type Tx } from '@cs/db';
import { addDays, localClock, safeTimezone, zonedTimeToUtc } from '@cs/engine';
import { and, count, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { enqueueOf, type ToolDeps } from './deps';
import { RIVAL_SEARCH_COOLDOWN_MINUTES, RIVAL_SEARCHES_PER_AGENCY_DAY } from './limits';

/** `scheduled`: the monthly automatic refresh (worker `rival-monthly`, migration 0056). */
export type SearchTrigger = DiscoveryRunTrigger;
/**
 * `enqueue_failed`: the queue refused the job; the run row was deleted, so it never counts toward any limit.
 * `weekly_limit`: a manual search already started this client-local week (owner decision 2026-10-15).
 */
export type SearchRefusal = 'missing_profile' | 'cooldown' | 'running' | 'daily_cap' | 'weekly_limit' | 'enqueue_failed';
export type SearchStart =
  | { runId: string }
  | { refused: Exclude<SearchRefusal, 'weekly_limit'> }
  | { refused: 'weekly_limit'; nextManualSearchAt: string; nextLabel: string };

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The client-local week the manual-search limit counts in: Monday 00:00 in `tz` (`start`) up to the next Monday
 * 00:00 (`next`, whose local date is `nextLocalDate`). An invalid zone falls back via `safeTimezone`.
 */
export function manualSearchWeek(now: Date, tz: string): { start: Date; next: Date; nextLocalDate: string } {
  const zone = safeTimezone(tz);
  const c = localClock(now, zone);
  const monday = addDays(c.date, -((c.weekday + 6) % 7));
  const nextLocalDate = addDays(monday, 7);
  return { start: zonedTimeToUtc(monday, '00:00', zone), next: zonedTimeToUtc(nextLocalDate, '00:00', zone), nextLocalDate };
}

/** A local calendar date (`YYYY-MM-DD`) as the decided "Ddd D Mon" label, e.g. "Mon 20 Oct". */
export function searchDayLabel(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const at = new Date(Date.UTC(y!, m! - 1, d!));
  return `${DAY[at.getUTCDay()]} ${at.getUTCDate()} ${MONTH[at.getUTCMonth()]}`;
}

/** An instant's local date in `tz` as the "Ddd D Mon" label (the web button: "Next search available Mon 20 Oct"). */
export const searchDayLabelAt = (iso: string, tz: string) => searchDayLabel(localClock(new Date(iso), safeTimezone(tz)).date);

/** The decided refusal copy for a second manual search in one week. */
export const weeklyLimitMessage = (label: string) => `One competitor search per week. Next search available ${label}.`;

/**
 * Manual runs started this client-local week. A failed run that made no paid search (`searchesDone` 0) does not
 * use up the week (controller ruling I2).
 */
const manualThisWeek = (clientId: string, start: Date) =>
  and(
    eq(discoveryRun.clientId, clientId), eq(discoveryRun.trigger, 'manual'), gte(discoveryRun.startedAt, start),
    sql`NOT (${discoveryRun.status} = 'failed' AND coalesce((${discoveryRun.progress}->>'searchesDone')::int, 0) = 0)`,
  );

/**
 * When the next manual "Find competitors" is allowed (ISO, next client-local Monday 00:00), or null when one is
 * allowed now. Only `manual` runs started this client-local week count (any status; enqueue failures were deleted).
 * Pass the caller's tenant tx or the service Db.
 */
export async function nextManualSearchAt(db: Pick<Tx, 'select'>, clientId: string, tz: string, now: Date = new Date()): Promise<string | null> {
  const week = manualSearchWeek(now, tz);
  const [row] = await db.select({ id: discoveryRun.id }).from(discoveryRun).where(manualThisWeek(clientId, week.start)).limit(1);
  return row ? week.next.toISOString() : null;
}

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
export async function startCompetitorSearch(deps: ToolDeps, clientId: string, trigger: SearchTrigger, now: Date = new Date()): Promise<SearchStart> {
  const enqueue = enqueueOf(deps);
  const [c] = await deps.service.select({ agencyId: client.agencyId, keywords: client.keywords, serviceArea: client.serviceArea, placeId: client.placeId, timezone: client.timezone }).from(client).where(eq(client.id, clientId));
  if (!c) throw new ToolError('not_found', 'Client not found');
  if (c.keywords.length === 0 || !c.serviceArea || !c.placeId) return { refused: 'missing_profile' };

  let started: SearchStart;
  try {
    started = await deps.service.transaction(async (tx): Promise<SearchStart> => {
      await tx.select({ id: agency.id }).from(agency).where(eq(agency.id, c.agencyId)).for('update');
      const [live] = await tx.select({ id: discoveryRun.id }).from(discoveryRun).where(and(eq(discoveryRun.clientId, clientId), inArray(discoveryRun.status, [...LIVE]))).limit(1);
      if (live) return { refused: 'running' };
      if (trigger === 'manual') {
        // Owner decision 2026-10-15: one manual search per client per client-local week (replaces the cooldown for
        // manual runs); automatic runs (auto/convert/scheduled) never count and are never capped here.
        const week = manualSearchWeek(now, c.timezone);
        const [used] = await tx.select({ id: discoveryRun.id }).from(discoveryRun).where(manualThisWeek(clientId, week.start)).limit(1);
        if (used) return { refused: 'weekly_limit', nextManualSearchAt: week.next.toISOString(), nextLabel: searchDayLabel(week.nextLocalDate) };
        const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const [today] = await tx.select({ n: count() }).from(discoveryRun).where(and(eq(discoveryRun.agencyId, c.agencyId), eq(discoveryRun.trigger, 'manual'), gte(discoveryRun.startedAt, dayStart)));
        if ((today?.n ?? 0) >= RIVAL_SEARCHES_PER_AGENCY_DAY) return { refused: 'daily_cap' };
      } else {
        const [last] = await tx.select({ finishedAt: discoveryRun.finishedAt }).from(discoveryRun).where(and(eq(discoveryRun.clientId, clientId), isNotNull(discoveryRun.finishedAt))).orderBy(desc(discoveryRun.finishedAt)).limit(1);
        if (last?.finishedAt && now.getTime() - last.finishedAt.getTime() < RIVAL_SEARCH_COOLDOWN_MINUTES * 60_000) return { refused: 'cooldown' };
      }
      const [row] = await tx.insert(discoveryRun).values({ agencyId: c.agencyId, clientId, trigger, startedAt: now }).returning({ id: discoveryRun.id });
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
    console.warn(`rival-search enqueue failed for run ${started.runId}: ${err instanceof Error ? err.message : String(err)}`);
    // No work started: drop the run (a live row would block this client; a failed one would count toward the cap).
    await deps.service.delete(discoveryRun).where(eq(discoveryRun.id, started.runId));
    return { refused: 'enqueue_failed' };
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

/**
 * Owner decision 2026-10-15: discovery auto-runs only the first time a client's search profile is complete. A client
 * with any discovery run (any status, any trigger) gets no further auto runs; the manual "Find competitors" stays.
 */
export async function startFirstAutoSearch(deps: ToolDeps, clientId: string): Promise<SearchStart | null> {
  const [any] = await deps.service.select({ id: discoveryRun.id }).from(discoveryRun).where(eq(discoveryRun.clientId, clientId)).limit(1);
  if (any) return null;
  return startCompetitorSearchQuietly(deps, clientId, 'auto');
}

/**
 * The monthly refresh's clients (worker `rival-monthly`): active clients (prospects get no recurring work) whose
 * search profile is complete — keywords, a service area and a Google place id — in id order. Service Db.
 */
export async function listMonthlyRivalClients(db: Pick<Tx, 'select'>): Promise<string[]> {
  const rows = await db.select({ id: client.id }).from(client)
    .where(and(eq(client.status, 'active'), sql`jsonb_array_length(${client.keywords}) > 0`, isNotNull(client.serviceArea), sql`${client.serviceArea} <> 'null'::jsonb`, isNotNull(client.placeId), sql`${client.placeId} <> ''`))
    .orderBy(client.id);
  return rows.map((r) => r.id);
}
