import { checkRankScanBudget, estimateRankScanUsd, failStaleRankScans, RANK_SCAN_STALE_HOURS, rankKeywordsFor, rankRadiusKm } from '@cs/collectors';
import { ToolError } from '@cs/core';
import { agency, agencyServiceable, client, clientServiceable, type Db, rankScan, type Tx } from '@cs/db';
import { and, count, desc, eq, gt, gte, ne, sql } from 'drizzle-orm';
import { enqueueOf, type ToolDeps } from './deps';
import { RANK_MANUAL_PER_AGENCY_DAY, RANK_MANUAL_PER_CLIENT_DAYS } from './limits';
import { searchDayLabelAt } from './rival-search';

/**
 * Phase 13b: the manual "Scan now" rules. `running` is reported to `request_rank_scan` as `not_ready`; the settings
 * read keeps it so the button can say a scan is in progress.
 */
export type RankScanState = 'available' | 'weekly_limit' | 'agency_daily_limit' | 'cap' | 'running' | 'not_ready';
export type RankScanAvailability = { state: RankScanState; nextAvailableAt?: string; capUsd?: number };
export type RankScanRequest =
  | { queued: true; scanEtaMinutes: number }
  | { queued: false; reason: 'weekly_limit' | 'agency_daily_limit' | 'cap' | 'not_ready'; nextAvailableAt?: string };

const DAY_MS = 86_400_000;
const utcMidnight = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** Postgres unique violation on `rank_scan_running_unique`, possibly wrapped by drizzle. */
function isRunningUnique(err: unknown): boolean {
  for (let e: unknown = err; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    const x = e as { code?: unknown; constraint_name?: unknown; constraint?: unknown; message?: unknown };
    if (x.code === '23505' && (x.constraint_name === 'rank_scan_running_unique' || x.constraint === 'rank_scan_running_unique' || String(x.message ?? '').includes('rank_scan_running_unique'))) return true;
  }
  return false;
}

/** The first state that blocks a manual scan, in the decided order. Pass the service Db or a service transaction. */
export async function rankScanAvailability(db: Db | Tx, c: { id: string; agencyId: string }, now: Date): Promise<RankScanAvailability> {
  const [row] = await db.select({
    keywords: client.keywords, rankKeywords: client.rankKeywords, rankGridSize: client.rankGridSize, serviceArea: client.serviceArea,
    ok: sql<boolean>`${clientServiceable(client)} AND ${agencyServiceable(client.agencyId)}`,
  }).from(client).where(and(eq(client.id, c.id), eq(client.agencyId, c.agencyId)));
  if (!row || !row.ok || !row.serviceArea || rankKeywordsFor(row).length === 0) return { state: 'not_ready' };

  const staleBefore = new Date(now.getTime() - RANK_SCAN_STALE_HOURS * 3_600_000);
  const [running] = await db.select({ id: rankScan.id }).from(rankScan)
    .where(and(eq(rankScan.clientId, c.id), eq(rankScan.status, 'running'), gt(rankScan.startedAt, staleBefore))).limit(1);
  if (running) return { state: 'running' };

  const [last] = await db.select({ startedAt: rankScan.startedAt }).from(rankScan)
    .where(and(eq(rankScan.clientId, c.id), eq(rankScan.trigger, 'manual'), ne(rankScan.status, 'skipped'), gt(rankScan.startedAt, new Date(now.getTime() - RANK_MANUAL_PER_CLIENT_DAYS * DAY_MS))))
    .orderBy(desc(rankScan.startedAt)).limit(1);
  if (last) return { state: 'weekly_limit', nextAvailableAt: new Date(last.startedAt.getTime() + RANK_MANUAL_PER_CLIENT_DAYS * DAY_MS).toISOString() };

  const dayStart = utcMidnight(now);
  const [today] = await db.select({ n: count() }).from(rankScan)
    .where(and(eq(rankScan.agencyId, c.agencyId), eq(rankScan.trigger, 'manual'), gte(rankScan.startedAt, dayStart)));
  if ((today?.n ?? 0) >= RANK_MANUAL_PER_AGENCY_DAY) return { state: 'agency_daily_limit', nextAvailableAt: new Date(dayStart.getTime() + DAY_MS).toISOString() };

  const budget = await checkRankScanBudget(db, c.id, estimateRankScanUsd(row).usd, now);
  if (!budget.ok) return { state: 'cap', capUsd: budget.capUsd };
  return { state: 'available' };
}

/** Decided copy for a refused manual scan (the web action throws it as `invalid_input` + `userFacing`). */
export function rankScanRefusalMessage(a: RankScanAvailability, c: { name: string; timezone: string }): string | null {
  switch (a.state) {
    case 'weekly_limit': return `Next manual scan available ${searchDayLabelAt(a.nextAvailableAt!, c.timezone)}.`;
    case 'agency_daily_limit': return `Your agency has used today's ${RANK_MANUAL_PER_AGENCY_DAY} manual scans.`;
    case 'cap': return `This scan would exceed ${c.name}'s monthly cost cap ($${a.capUsd}). Raise the cap in Usage or wait until next month.`;
    case 'running': return 'A rank scan is already running for this client.';
    case 'not_ready': return 'Add keywords and a service area (and an active client) before scanning.';
    default: return null;
  }
}

/** The button state's label for `get_rank_settings`; null when a scan is available. */
export function rankScanLabel(a: RankScanAvailability, c: { name: string; timezone: string }): string | null {
  if (a.state === 'weekly_limit') return `Next scan available ${searchDayLabelAt(a.nextAvailableAt!, c.timezone)}`;
  if (a.state === 'agency_daily_limit') return rankScanRefusalMessage(a, c);
  if (a.state === 'cap') return rankScanRefusalMessage(a, c);
  if (a.state === 'running') return 'Scan running';
  if (a.state === 'not_ready') return 'Add keywords and a service area to scan';
  return null;
}

/** After-commit map-background refresh: failure is logged, never thrown (the weekly sweep repairs a missed map). */
export async function enqueueMapRefresh(deps: ToolDeps, clientId: string): Promise<void> {
  if (!deps.enqueue) return;
  try {
    await deps.enqueue('rank-map-refresh', { clientId }, `rank-map:${clientId}`);
  } catch (err) {
    console.warn(`[rank-map] refresh enqueue for ${clientId} failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Starts a manual scan: one service transaction (agency row `FOR UPDATE`) checks availability and inserts the running
 * row with a settings snapshot; the job is enqueued after commit and a failed enqueue deletes the row. The partial unique
 * index `rank_scan_running_unique` is the real concurrency guard (the queue is single-shot).
 */
export async function requestRankScan(deps: ToolDeps, userId: string, c: { id: string; agencyId: string }, now: Date = new Date()): Promise<RankScanRequest> {
  const enqueue = enqueueOf(deps);
  await failStaleRankScans(deps.service, now);
  let started: { scanId: string; calls: number } | RankScanRequest;
  try {
    started = await deps.service.transaction(async (tx) => {
      await tx.select({ id: agency.id }).from(agency).where(eq(agency.id, c.agencyId)).for('update');
      const a = await rankScanAvailability(tx, c, now);
      if (a.state !== 'available') {
        return { queued: false as const, reason: a.state === 'running' ? 'not_ready' as const : a.state, ...(a.nextAvailableAt ? { nextAvailableAt: a.nextAvailableAt } : {}) };
      }
      const [row] = await tx.select().from(client).where(eq(client.id, c.id));
      const keywords = rankKeywordsFor(row!);
      const est = estimateRankScanUsd(row!);
      const [ins] = await tx.insert(rankScan).values({
        agencyId: c.agencyId, clientId: c.id, status: 'running', trigger: 'manual', requestedBy: userId, startedAt: now,
        gridSize: row!.rankGridSize, radiusKm: rankRadiusKm(row!.serviceArea!.radiusKm), keywords, estimatedUsd: est.usd,
      }).returning({ id: rankScan.id });
      return { scanId: ins!.id, calls: est.calls };
    });
  } catch (err) {
    if (isRunningUnique(err)) return { queued: false, reason: 'not_ready' };
    throw err;
  }
  if ('queued' in started) return started;
  try {
    await enqueue('rank-scan', { clientId: c.id, trigger: 'manual', scanId: started.scanId, requestedBy: userId }, `rank-scan:${c.id}`);
  } catch (err) {
    console.warn(`rank-scan enqueue failed for scan ${started.scanId}: ${err instanceof Error ? err.message : String(err)}`);
    // No work started: a live row would block the client until the stale sweep, and would count toward the limits.
    await deps.service.delete(rankScan).where(eq(rankScan.id, started.scanId));
    throw new ToolError('internal', 'Could not queue the rank scan');
  }
  return { queued: true, scanEtaMinutes: Math.ceil((started.calls * 2) / 60) + 1 };
}
