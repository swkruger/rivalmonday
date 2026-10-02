import type { ChangeType } from '@cs/core';
import { changeEvent, client, clientCompetitor, type Db, eventScore, move, type MoveDetails, moveEvent, type MoveStatus } from '@cs/db';
import { and, asc, eq, gte, isNull, lte, ne, sql } from 'drizzle-orm';
import type { PackLoader } from '../tag/tag-stage';
import { type AdActivity, detectMoves, MOVE_WINDOW_DAYS, type MoveEvent, type MoveFinding } from './rules';

export const MOVES_RULE_VERSION = 2;
/** A move is 'active' once it has held this long … */
export const ACTIVE_AFTER_DAYS = 7;
/** … or straight away at this confidence. */
export const ACTIVE_CONFIDENCE = 0.7;
/** Still holding, but the newest supporting event is older than this → 'fading'. */
export const FADING_AFTER_DAYS = 30;
/** A move whose rule has not held for this long is closed. */
export const CLOSE_AFTER_DAYS = 30;
const DAY_MS = 86_400_000;

export function nextStatus(firstDetectedAt: Date, f: Pick<MoveFinding, 'confidence' | 'lastEvidenceAt'>, now: Date): MoveStatus {
  if (now.getTime() - f.lastEvidenceAt.getTime() > FADING_AFTER_DAYS * DAY_MS) return 'fading';
  return now.getTime() - firstDetectedAt.getTime() >= ACTIVE_AFTER_DAYS * DAY_MS || f.confidence >= ACTIVE_CONFIDENCE ? 'active' : 'emerging';
}

/**
 * Active ads now vs the mean active count at weekly points over the past 84 days (spec §6.4 ad surge). Only
 * points on/after the competitor's first ok ad capture count — before it we simply were not looking, which
 * is not the same as zero ads — and `historyWeeks` says how many points that left.
 */
export async function adActivity(db: Db, competitorId: string, now: Date): Promise<AdActivity> {
  const at = now.toISOString();
  const [row] = (await db.execute(sql`
    WITH first_capture AS (
      SELECT min(captured_at) AS t FROM capture
      WHERE competitor_id = ${competitorId}::uuid AND source IN ('google_ads', 'meta_ads') AND status = 'ok'),
    points AS (
      SELECT w.i, ${at}::timestamptz - make_interval(days => 7 * w.i) AS at
      FROM generate_series(1, 12) AS w(i), first_capture f
      WHERE f.t IS NOT NULL AND ${at}::timestamptz - make_interval(days => 7 * w.i) >= f.t)
    SELECT
      (SELECT count(*)::int FROM ad WHERE competitor_id = ${competitorId}::uuid AND is_active) AS active_now,
      (SELECT coalesce(avg(n), 0)::float8 FROM (
         SELECT count(a.id) AS n
         FROM points p
         LEFT JOIN ad a ON a.competitor_id = ${competitorId}::uuid
           AND a.first_seen_at <= p.at
           AND (a.is_active OR coalesce(a.ended_at, a.last_seen_at) > p.at)
         GROUP BY p.i) s) AS baseline,
      (SELECT count(*)::int FROM points) AS history_weeks`)) as unknown as { active_now: number; baseline: number; history_weeks: number }[];
  return {
    activeNow: Number(row?.active_now ?? 0),
    baseline: Math.round(Number(row?.baseline ?? 0) * 10) / 10,
    historyWeeks: Number(row?.history_weeks ?? 0),
  };
}

export async function listMoveClients(db: Db): Promise<string[]> {
  const rows = await db.selectDistinct({ id: clientCompetitor.clientId }).from(clientCompetitor);
  return rows.map((r) => r.id);
}

export interface MovesRunResult {
  opened: number;
  updated: number;
  fading: number;
  closed: number;
}

/**
 * Nightly moves (spec §6.4) for one client: per tracked competitor, run the rules over the last 90 days of
 * events this client was scored for, then open / update / fade / close its `move` rows and extend each
 * move's evidence chain. Re-running on the same day changes nothing but `updated_at`.
 */
export async function updateMovesForClient(deps: { db: Db; packs: PackLoader }, clientId: string, opts: { now?: Date } = {}): Promise<MovesRunResult> {
  const now = opts.now ?? new Date();
  const [c] = await deps.db.select().from(client).where(eq(client.id, clientId)).limit(1);
  if (!c) throw new Error(`client ${clientId} not found`);
  const pack = await deps.packs(c.verticalId);
  const serviceNames = Object.fromEntries(pack.services.map((s) => [s.id, s.name]));
  const since = new Date(now.getTime() - MOVE_WINDOW_DAYS * DAY_MS);
  const links = await deps.db.select({ competitorId: clientCompetitor.competitorId }).from(clientCompetitor).where(eq(clientCompetitor.clientId, clientId));
  const r: MovesRunResult = { opened: 0, updated: 0, fading: 0, closed: 0 };

  for (const { competitorId } of links) {
    const rows = await deps.db
      .select({ e: changeEvent })
      .from(changeEvent)
      .innerJoin(eventScore, and(eq(eventScore.eventId, changeEvent.id), eq(eventScore.clientId, clientId)))
      .where(and(eq(changeEvent.competitorId, competitorId), gte(changeEvent.occurredAt, since), lte(changeEvent.occurredAt, now), ne(changeEvent.changeType, 'cosmetic')))
      .orderBy(asc(changeEvent.occurredAt), asc(changeEvent.id));
    const events: MoveEvent[] = rows.map(({ e }) => ({
      id: e.id, changeType: e.changeType as ChangeType, channels: e.channels, occurredAt: e.occurredAt, services: e.services, facts: e.facts, zips: e.zips, summary: e.summary, details: e.details,
    }));
    const findings = detectMoves(events, {
      now, verticalId: c.verticalId, clientServices: c.services, clientZips: c.serviceArea?.zips ?? [], clientTowns: c.serviceArea?.towns ?? [],
      thresholds: pack.move_thresholds, ads: await adActivity(deps.db, competitorId, now), serviceNames,
    });
    const open = await deps.db.select().from(move).where(and(eq(move.clientId, clientId), eq(move.competitorId, competitorId), isNull(move.closedAt)));

    await deps.db.transaction(async (tx) => {
      for (const f of findings) {
        const details: MoveDetails = { eventCount: f.eventIds.length, channels: f.channels, facts: f.facts };
        const existing = open.find((m) => m.moveType === f.type);
        let moveId: string;
        if (existing) {
          await tx
            .update(move)
            .set({ status: nextStatus(existing.firstDetectedAt, f, now), confidence: f.confidence, summary: f.summary, details, ruleVersion: MOVES_RULE_VERSION, lastHeldAt: now, lastEvidenceAt: f.lastEvidenceAt, updatedAt: now })
            .where(eq(move.id, existing.id));
          moveId = existing.id;
          r.updated++;
        } else {
          const [m] = await tx
            .insert(move)
            .values({
              agencyId: c.agencyId, clientId, competitorId, moveType: f.type, status: nextStatus(now, f, now), confidence: f.confidence, summary: f.summary, details,
              ruleVersion: MOVES_RULE_VERSION, firstDetectedAt: now, lastHeldAt: now, lastEvidenceAt: f.lastEvidenceAt, updatedAt: now,
            })
            .returning({ id: move.id });
          moveId = m!.id;
          r.opened++;
        }
        await tx.insert(moveEvent).values(f.eventIds.map((eventId) => ({ moveId, eventId }))).onConflictDoNothing();
      }
      for (const m of open.filter((x) => !findings.some((f) => f.type === x.moveType))) {
        const close = now.getTime() - m.lastHeldAt.getTime() >= CLOSE_AFTER_DAYS * DAY_MS;
        await tx.update(move).set({ status: 'fading', updatedAt: now, ...(close ? { closedAt: now } : {}) }).where(eq(move.id, m.id));
        if (close) r.closed++;
        else r.fading++;
      }
    });
  }
  return r;
}
