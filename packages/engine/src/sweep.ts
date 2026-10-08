import type { Db } from '@cs/db';
import { sql } from 'drizzle-orm';
import { PRICE_STAGE, PRICE_VERSION } from './prices/price-stage';
import { MIN_REVIEW_CHARS, REVIEW_ANALYSIS_DAYS, REVIEW_STAGE, REVIEW_VERSION } from './reviews/themes';
import { scoreBackoff } from './score/score-stage';
import { MAX_STAGE_ATTEMPTS, RETRY_BACKOFF_MINUTES } from './stage';
import { RANK_DIFF_STAGE, RANK_DIFF_VERSION } from './structured/rank';
import { VENDOR_DIFF_STAGE, VENDOR_DIFF_VERSION, VENDOR_SETTLE_MINUTES, vendorDiffSources } from './structured/vendor-diff';
import { TAG_STAGE, TAG_VERSION } from './tag/tag-stage';
import { WEB_DIFF_STAGE, WEB_DIFF_VERSION } from './web/diff-stage';

export { RETRY_BACKOFF_MINUTES } from './stage';

export interface EngineWork {
  diff: string[];
  tag: string[];
  score: string[];
  rankDiff: string[];
  reviews: string[];
  prices: string[];
}

/** Events created this recently are (re)checked for missing client scores, e.g. a newly linked client. */
export const SCORE_WINDOW_DAYS = 14;

/**
 * A client newly linked to a competitor (client_competitor.created_at within SCORE_WINDOW_DAYS) is offered
 * that competitor's recent history too, not just events created after the link — but only back this far, so
 * linking to a long-tracked competitor doesn't suddenly dump months of backlog on the new client.
 */
export const LATE_LINK_LOOKBACK_DAYS = 90;

const ids = (rows: unknown) => (rows as { id: string }[]).map((r) => r.id);

export async function findEngineWork(db: Db, opts: { limit: number; competitorId?: string; scoreWindowDays?: number; now?: Date }): Promise<EngineWork> {
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
  const vendorDiff = await db.execute(sql`
    SELECT c.id FROM capture c
    WHERE c.source IN (${sql.join(vendorDiffSources().map((s) => sql`${s}`), sql`, `)}) AND c.status = 'ok'
      AND c.captured_at < now() - make_interval(mins => ${VENDOR_SETTLE_MINUTES}::int) ${only('c.competitor_id')}
      AND NOT ${finished(VENDOR_DIFF_STAGE, VENDOR_DIFF_VERSION, 'c.id')}
    ORDER BY c.captured_at ASC LIMIT ${opts.limit}`);
  const tag = await db.execute(sql`
    SELECT d.id FROM detected_change d
    WHERE d.status = 'pending' ${only('d.competitor_id')}
      AND NOT ${finished(TAG_STAGE, TAG_VERSION, 'd.id')}
    ORDER BY d.detected_at ASC LIMIT ${opts.limit}`);
  const window = opts.scoreWindowDays ?? SCORE_WINDOW_DAYS;
  const score = await db.execute(sql`
    SELECT e.id FROM event e
    WHERE e.retracted_at IS NULL ${only('e.competitor_id')}
      AND EXISTS (
        SELECT 1 FROM client_competitor cc JOIN client cl ON cl.id = cc.client_id
        WHERE cc.competitor_id = e.competitor_id
          AND (e.client_id IS NULL OR cc.client_id = e.client_id)
          -- A complaint spike belongs to one vertical's theme list (3c): only that vertical's clients score it.
          AND (e.details->>'verticalId' IS NULL OR cl.vertical_id = e.details->>'verticalId')
          -- 5b-2 decision 9: prospects get no scores (so no alerts or brief content) until converted.
          AND cl.status = 'active'
          -- Recent events, or recent history for a client linked recently (decision 12).
          AND (e.created_at >= now() - make_interval(days => ${window}::int)
               OR (cc.created_at >= now() - make_interval(days => ${window}::int)
                   AND e.occurred_at >= now() - make_interval(days => ${LATE_LINK_LOOKBACK_DAYS}::int)))
          AND NOT EXISTS (SELECT 1 FROM event_score s WHERE s.event_id = e.id AND s.client_id = cc.client_id)
          AND NOT ${scoreBackoff(sql`e.id`, sql`cc.client_id`)})
    ORDER BY e.created_at ASC LIMIT ${opts.limit}`);
  // Rank scans are per client; a competitor filter (engine-once --competitor) does not apply to them.
  // Aliased "rs", not "s" — the finished() helper above already aliases stage_run as "s".
  // Only active clients' scans (5b-2 decision 9): a prospect's snapshot scans wait, undiffed, until it converts.
  const rankDiff = opts.competitorId
    ? []
    : await db.execute(sql`
        SELECT rs.id FROM rank_scan rs JOIN client cl ON cl.id = rs.client_id
        WHERE rs.status = 'done' AND rs.finished_at IS NOT NULL AND cl.status = 'active'
          AND NOT ${finished(RANK_DIFF_STAGE, RANK_DIFF_VERSION, 'rs.id')}
        ORDER BY rs.finished_at ASC LIMIT ${opts.limit}`);

  const now = (opts.now ?? new Date()).toISOString();
  // Reviews of tracked competitors and of clients' own businesses; subject = this text version (see reviewSubjectId).
  // Strip all whitespace at both ends (not just spaces, unlike bare btrim) to match analyzeReview's JS
  // `text.trim()` — otherwise a review like "ok\n\n\n\n\n\n\n\n" clears this length check (btrim leaves the
  // newlines) but then fails analyzeReview's own check, so the sweep claims it and it throws forever.
  const reviews = await db.execute(sql`
    SELECT r.id FROM review r
    WHERE r.text IS NOT NULL AND length(regexp_replace(r.text, '^\\s+|\\s+$', '', 'g')) >= ${MIN_REVIEW_CHARS}::int
      AND r.posted_at >= ${now}::timestamptz - make_interval(days => ${REVIEW_ANALYSIS_DAYS}::int) ${only('r.competitor_id')}
      AND (EXISTS (SELECT 1 FROM client_competitor cc WHERE cc.competitor_id = r.competitor_id)
           OR EXISTS (SELECT 1 FROM client cl WHERE cl.self_competitor_id = r.competitor_id))
      AND NOT ${finished(REVIEW_STAGE, REVIEW_VERSION, "md5(r.id::text || '|' || r.text)::uuid")}
    ORDER BY r.posted_at DESC LIMIT ${opts.limit}`);

  // Prices: every ok web capture of a competitor some client tracks, oldest first so spans build in order.
  const prices = await db.execute(sql`
    SELECT c.id FROM capture c
    WHERE c.source = 'web' AND c.status = 'ok' AND c.tracked_page_id IS NOT NULL ${only('c.competitor_id')}
      AND EXISTS (SELECT 1 FROM client_competitor cc WHERE cc.competitor_id = c.competitor_id)
      AND NOT ${finished(PRICE_STAGE, PRICE_VERSION, 'c.id')}
    ORDER BY c.captured_at ASC LIMIT ${opts.limit}`);

  return { diff: [...ids(diff), ...ids(vendorDiff)], tag: ids(tag), score: ids(score), rankDiff: ids(rankDiff), reviews: ids(reviews), prices: ids(prices) };
}
