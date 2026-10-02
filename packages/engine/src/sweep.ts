import type { Db } from '@cs/db';
import { sql } from 'drizzle-orm';
import { MAX_STAGE_ATTEMPTS } from './stage';
import { TAG_STAGE, TAG_VERSION } from './tag/tag-stage';
import { WEB_DIFF_STAGE, WEB_DIFF_VERSION } from './web/diff-stage';

export interface EngineWork {
  diff: string[];
  tag: string[];
  score: string[];
}

/** Events created this recently are (re)checked for missing client scores, e.g. a newly linked client. */
export const SCORE_WINDOW_DAYS = 14;

/**
 * Base of the sweep's exponential retry backoff for a failed stage_run: offered again only after
 * `RETRY_BACKOFF_MINUTES * 2^(attempts-1)` minutes since finished_at. Engine stage jobs run with
 * retryLimit 0 (apps/worker/src/jobs/engine.ts) — the sweep is the only retry path — so without
 * this backoff a short model outage would exhaust MAX_STAGE_ATTEMPTS for every subject in the
 * outage window within minutes, permanently excluding them. A base of 30 gives 30/60/120/240
 * minutes between the MAX_STAGE_ATTEMPTS attempts: a horizon of about 7.5 hours.
 */
export const RETRY_BACKOFF_MINUTES = 30;

const ids = (rows: unknown) => (rows as { id: string }[]).map((r) => r.id);

export async function findEngineWork(db: Db, opts: { limit: number; competitorId?: string; scoreWindowDays?: number }): Promise<EngineWork> {
  const only = (col: string) => (opts.competitorId ? sql`AND ${sql.raw(col)} = ${opts.competitorId}::uuid` : sql``);
  const finished = (stage: string, version: number, subject: string) => sql`
    EXISTS (SELECT 1 FROM stage_run s WHERE s.stage = ${stage} AND s.stage_version = ${version}::int AND s.subject_id = ${sql.raw(subject)}
            AND (s.status = 'done' OR s.attempts >= ${MAX_STAGE_ATTEMPTS}::int
                 OR (s.status = 'failed' AND s.finished_at IS NOT NULL
                     AND s.finished_at > now() - make_interval(mins => ${RETRY_BACKOFF_MINUTES}::int * power(2, s.attempts - 1)::int))))`;

  const diff = await db.execute(sql`
    SELECT c.id FROM capture c
    WHERE c.source = 'web' AND c.status = 'ok' AND c.tracked_page_id IS NOT NULL ${only('c.competitor_id')}
      AND NOT ${finished(WEB_DIFF_STAGE, WEB_DIFF_VERSION, 'c.id')}
    ORDER BY c.captured_at ASC LIMIT ${opts.limit}`);
  const tag = await db.execute(sql`
    SELECT d.id FROM detected_change d
    WHERE d.status = 'pending' ${only('d.competitor_id')}
      AND NOT ${finished(TAG_STAGE, TAG_VERSION, 'd.id')}
    ORDER BY d.detected_at ASC LIMIT ${opts.limit}`);
  const score = await db.execute(sql`
    SELECT e.id FROM event e
    WHERE e.created_at >= now() - make_interval(days => ${opts.scoreWindowDays ?? SCORE_WINDOW_DAYS}::int) ${only('e.competitor_id')}
      AND EXISTS (SELECT 1 FROM client_competitor cc WHERE cc.competitor_id = e.competitor_id
                  AND NOT EXISTS (SELECT 1 FROM event_score s WHERE s.event_id = e.id AND s.client_id = cc.client_id))
    ORDER BY e.created_at ASC LIMIT ${opts.limit}`);
  return { diff: ids(diff), tag: ids(tag), score: ids(score) };
}
