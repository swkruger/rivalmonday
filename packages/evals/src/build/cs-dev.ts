import { createHash } from 'node:crypto';
import { competitor, type Db, detectedChange, type NumericChange, review, trackedPage } from '@cs/db';
import { buildReviewState, competitorVerticals, MIN_REVIEW_CHARS } from '@cs/engine';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { EvalCase } from '../case';
import { evalPack, isEvalVertical, labelCase, questionsFor, redactDeep, type ReviewInput } from './common';
import { changeInput } from './golden';

/** Read rows (newest first) before dedupe and the eval-pack filter, so `limit` cases usually survive. */
const OVERFETCH = 4;
const textKey = (...parts: (string | null)[]) => createHash('sha256').update(parts.map((p) => p ?? '\u0000').join('\u0001')).digest('hex').slice(0, 16);

export interface CsDevChangeRow {
  competitorName: string;
  pageUrl: string | null;
  pageType: string | null;
  kind: string;
  beforeText: string | null;
  afterText: string | null;
  numericChanges: NumericChange[];
  verticalIds: string[];
}

export interface CsDevReviewRow {
  competitorName: string;
  rating: number | null;
  text: string;
  verticalIds: string[];
}

/** Pure: newest-first rows → cases, deduped by text; rows touching a vertical without an eval pack are skipped. */
export function changeRowsToCases(rows: CsDevChangeRow[], limit = Infinity): EvalCase[] {
  const seen = new Set<string>();
  const out: EvalCase[] = [];
  for (const r of rows) {
    if (out.length >= limit) break;
    if (!r.verticalIds.every(isEvalVertical)) continue;
    const key = textKey(r.kind, r.beforeText, r.afterText);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(labelCase('changes', `changes-csdev-${key}`, 'cs_dev', changeInput(r, r)));
  }
  return out;
}

export function reviewRowsToCases(rows: CsDevReviewRow[], limit = Infinity): EvalCase[] {
  const seen = new Set<string>();
  const out: EvalCase[] = [];
  for (const r of rows) {
    if (out.length >= limit) break;
    if (r.text.trim().length < MIN_REVIEW_CHARS || r.verticalIds.length === 0 || !r.verticalIds.every(isEvalVertical)) continue;
    const key = textKey(r.text.trim());
    if (seen.has(key)) continue;
    seen.add(key);
    const verticalIds = [...r.verticalIds].sort();
    const state = buildReviewState({ businessTypes: verticalIds.map((v) => evalPack(v).name), rating: r.rating, text: r.text, competitorName: r.competitorName });
    const input: ReviewInput = { state: redactDeep(state, [r.competitorName]), verticalIds, questionKeys: Object.keys(questionsFor('reviews', verticalIds)) };
    out.push(labelCase('reviews', `reviews-csdev-${key}`, 'cs_dev', input));
  }
  return out;
}

/**
 * cs_dev reads (owner `DATABASE_URL`, read-only queries; the CLI also runs them in a READ ONLY transaction).
 * Web changes the tag stage saw (event / cosmetic / pending); review text only — reviewer names/hashes are never selected.
 */
export async function buildCsDev(suite: 'changes' | 'reviews', db: Db, limit: number): Promise<EvalCase[]> {
  const verticalsOf = async (ids: string[]) => {
    const m = new Map<string, string[]>();
    for (const id of [...new Set(ids)]) m.set(id, await competitorVerticals(db, id));
    return m;
  };
  if (suite === 'changes') {
    const rows = await db
      .select({
        competitorId: detectedChange.competitorId, competitorName: competitor.name, pageUrl: trackedPage.url, pageType: trackedPage.pageType, kind: detectedChange.kind,
        beforeText: detectedChange.beforeText, afterText: detectedChange.afterText, numericChanges: detectedChange.numericChanges,
      })
      .from(detectedChange)
      .innerJoin(competitor, eq(competitor.id, detectedChange.competitorId))
      .leftJoin(trackedPage, eq(trackedPage.id, detectedChange.trackedPageId))
      .where(and(eq(detectedChange.source, 'web'), inArray(detectedChange.status, ['event', 'cosmetic', 'pending'])))
      .orderBy(desc(detectedChange.detectedAt), desc(detectedChange.id))
      .limit(limit * OVERFETCH);
    const verticals = await verticalsOf(rows.map((r) => r.competitorId));
    return changeRowsToCases(rows.map((r) => ({ ...r, verticalIds: verticals.get(r.competitorId) ?? [] })), limit);
  }
  const rows = await db
    .select({ competitorId: review.competitorId, competitorName: competitor.name, rating: review.rating, text: review.text })
    .from(review)
    .innerJoin(competitor, eq(competitor.id, review.competitorId))
    .where(sql`length(trim(${review.text})) >= ${MIN_REVIEW_CHARS}`)
    .orderBy(desc(review.firstSeenAt), desc(review.id))
    .limit(limit * OVERFETCH);
  const verticals = await verticalsOf(rows.map((r) => r.competitorId));
  return reviewRowsToCases(rows.map((r) => ({ ...r, text: r.text ?? '', verticalIds: verticals.get(r.competitorId) ?? [] })), limit);
}
