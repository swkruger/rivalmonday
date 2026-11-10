import { auditedCompetitors, failStaleCitationRuns } from '@cs/collectors';
import { ToolError } from '@cs/core';
import { agency, agencyServiceable, citationAuditRun, client, clientServiceable, type Db, type Tx } from '@cs/db';
import { and, count, desc, eq, gt, gte, ne, sql } from 'drizzle-orm';
import { enqueueOf, type ToolDeps } from './deps';
import { CITATION_MANUAL_PER_AGENCY_DAY, CITATION_MANUAL_PER_CLIENT_DAYS } from './limits';

/** Phase 18c-2 D1: the manual "Check listings now" rules, in the order they are reported. */
export type CitationAuditState = 'available' | 'weekly_limit' | 'agency_daily_limit' | 'running' | 'not_ready' | 'spend_paused';
export type CitationAuditAvailability = { state: CitationAuditState; nextAvailableAt?: string };
export type CitationAuditRequest = { runId: string } | { refused: Exclude<CitationAuditState, 'available'>; nextAvailableAt?: string };

const DAY_MS = 86_400_000;
const utcMidnight = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** Postgres unique violation on `citation_audit_run_one_live`, possibly wrapped by drizzle. */
function isLiveRunViolation(err: unknown): boolean {
  for (let e: unknown = err, i = 0; e && typeof e === 'object' && i < 4; e = (e as { cause?: unknown }).cause, i++) {
    const x = e as { code?: string; constraint_name?: string; constraint?: string };
    if (x.code === '23505' && (x.constraint_name ?? x.constraint) === 'citation_audit_run_one_live') return true;
  }
  return false;
}

/**
 * The first state that blocks a manual listings check. Pass the service Db or a service transaction. `vendorsConfigured`
 * defaults to true (`ToolDeps.vendorsConfigured` absent). Every read is limited to `c.agencyId`.
 * Counting rule (D1): `trigger = 'manual' AND status <> 'failed'` (capped counts).
 */
export async function citationAuditAvailability(db: Db | Tx, c: { id: string; agencyId: string }, now: Date, vendorsConfigured = true): Promise<CitationAuditAvailability> {
  const dayStart = utcMidnight(now);
  const ofClient = and(eq(citationAuditRun.clientId, c.id), eq(citationAuditRun.agencyId, c.agencyId));
  const [[row], rivals, [running], [last], [today]] = await Promise.all([
    db.select({
      ok: sql<boolean>`${clientServiceable(client)} AND ${agencyServiceable(client.agencyId)}`,
      spendPaused: sql<boolean>`${client.spendPausedAt} IS NOT NULL`,
    }).from(client).where(and(eq(client.id, c.id), eq(client.agencyId, c.agencyId))),
    auditedCompetitors(db, c.id),
    db.select({ id: citationAuditRun.id }).from(citationAuditRun).where(and(ofClient, eq(citationAuditRun.status, 'running'))).limit(1),
    db.select({ startedAt: citationAuditRun.startedAt }).from(citationAuditRun)
      .where(and(ofClient, eq(citationAuditRun.trigger, 'manual'), ne(citationAuditRun.status, 'failed'), gt(citationAuditRun.startedAt, new Date(now.getTime() - CITATION_MANUAL_PER_CLIENT_DAYS * DAY_MS))))
      .orderBy(desc(citationAuditRun.startedAt)).limit(1),
    db.select({ n: count() }).from(citationAuditRun)
      .where(and(eq(citationAuditRun.agencyId, c.agencyId), eq(citationAuditRun.trigger, 'manual'), ne(citationAuditRun.status, 'failed'), gte(citationAuditRun.startedAt, dayStart))),
  ]);
  if (!row || !row.ok || !vendorsConfigured || (!rivals.selfId && rivals.rivalIds.length === 0)) return { state: 'not_ready' };
  if (row.spendPaused) return { state: 'spend_paused' };
  if (running) return { state: 'running' };
  if (last) return { state: 'weekly_limit', nextAvailableAt: new Date(last.startedAt.getTime() + CITATION_MANUAL_PER_CLIENT_DAYS * DAY_MS).toISOString() };
  if ((today?.n ?? 0) >= CITATION_MANUAL_PER_AGENCY_DAY) return { state: 'agency_daily_limit', nextAvailableAt: new Date(dayStart.getTime() + DAY_MS).toISOString() };
  return { state: 'available' };
}

/**
 * Starts a manual check: one service transaction (agency row `FOR UPDATE`) checks availability and inserts the running
 * row (competitor ids from `auditedCompetitors`, the same selection the job uses); the job is enqueued after commit and
 * a failed enqueue deletes the row. `citation_audit_run_one_live` is the real concurrency guard.
 */
export async function requestCitationAudit(deps: ToolDeps, _userId: string, c: { id: string; agencyId: string }, now: Date = new Date()): Promise<CitationAuditRequest> {
  const enqueue = enqueueOf(deps);
  await failStaleCitationRuns(deps.service, now);
  let started: CitationAuditRequest;
  try {
    started = await deps.service.transaction(async (tx) => {
      await tx.select({ id: agency.id }).from(agency).where(eq(agency.id, c.agencyId)).for('update');
      const a = await citationAuditAvailability(tx, c, now, deps.vendorsConfigured ?? true);
      if (a.state !== 'available') return { refused: a.state, ...(a.nextAvailableAt ? { nextAvailableAt: a.nextAvailableAt } : {}) };
      const { selfId, rivalIds } = await auditedCompetitors(tx, c.id);
      const [ins] = await tx.insert(citationAuditRun).values({
        agencyId: c.agencyId, clientId: c.id, trigger: 'manual', status: 'running', competitorIds: [...(selfId ? [selfId] : []), ...rivalIds], startedAt: now,
      }).returning({ id: citationAuditRun.id });
      return { runId: ins!.id };
    });
  } catch (err) {
    if (isLiveRunViolation(err)) return { refused: 'running' };
    throw err;
  }
  if ('refused' in started) return started;
  try {
    await enqueue('citation-audit-client', { clientId: c.id, runId: started.runId }, `citation-manual:${started.runId}`);
  } catch (err) {
    console.warn(`citation-audit enqueue failed for run ${started.runId}: ${err instanceof Error ? err.message : String(err)}`);
    // No work started: a live row would block the client until the stale sweep and would count toward the limits.
    await deps.service.delete(citationAuditRun).where(eq(citationAuditRun.id, started.runId));
    throw new ToolError('internal', 'Could not queue the listings check');
  }
  return started;
}
