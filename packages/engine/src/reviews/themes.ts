import type { Ai, DecisionQuestion, DecisionResult } from '@cs/ai';
import { redactForModel, sha256Hex } from '@cs/collectors';
import { competitor, type Db, review, reviewAnalysis, themeProposal } from '@cs/db';
import type { VerticalPack } from '@cs/verticals';
import { and, asc, eq, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { runStage, type StageOutcome } from '../stage';
import { competitorVerticals, type PackLoader } from '../tag/tag-stage';

export const REVIEW_STAGE = 'review_themes';
export const REVIEW_VERSION = 1;
/** Two 90-day benchmark windows (current and previous, for the trend). */
export const REVIEW_ANALYSIS_DAYS = 180;
export const MIN_REVIEW_CHARS = 10;
export const MAX_REVIEW_CHARS = 2000;
export const SENTIMENT_LEVELS = ['very negative', 'negative', 'mixed or neutral', 'positive', 'very positive'];
const PLATFORM = { agencyId: null, clientId: null } as const;

export interface Theme {
  id: string;
  name: string;
  description: string;
}

export interface VerticalThemes {
  pack: VerticalPack;
  themes: Theme[];
}

export const themeKey = (verticalId: string, themeId: string) => `theme_${verticalId}__${themeId}`;
export const otherKey = (verticalId: string) => `other_${verticalId}`;

/** Stage subject of a review *version*: `md5(review_id || '|' || text)` as a uuid — the sweep computes the same in SQL, so an edit re-runs the stage. */
export function reviewSubjectId(reviewId: string, text: string): string {
  const h = createHash('md5').update(`${reviewId}|${text}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** A vertical's review themes: the pack's seed themes, then AM-approved discovered themes in approval order. */
export async function themesForVertical(db: Db, pack: VerticalPack): Promise<Theme[]> {
  const seed: Theme[] = pack.themes.map((t) => ({ id: t.id, name: t.name, description: t.description }));
  const approved = await db
    .select({ id: themeProposal.themeId, name: themeProposal.name, description: themeProposal.description })
    .from(themeProposal)
    .where(and(eq(themeProposal.verticalId, pack.id), eq(themeProposal.status, 'approved')))
    .orderBy(asc(themeProposal.decidedAt));
  return [...seed, ...approved.filter((a) => !seed.some((s) => s.id === a.id))];
}

/** Spec §6.5: one call per review — a sentiment Score plus one Noul per theme (and "other") per vertical. */
export function buildReviewQuestions(verticals: VerticalThemes[]): Record<string, DecisionQuestion> {
  const q: Record<string, DecisionQuestion> = {
    sentiment: { type: 'score', instructions: 'Overall, how does the reviewer feel about the business?', levels: SENTIMENT_LEVELS },
  };
  for (const { pack, themes } of verticals) {
    for (const t of themes) {
      q[themeKey(pack.id, t.id)] = {
        type: 'noul',
        instructions: `Does the review talk about ${t.name.toLowerCase()} (${t.description.toLowerCase()}) — as praise or as a complaint?`,
      };
    }
    q[otherKey(pack.id)] = {
      type: 'noul',
      instructions: `Does the review raise a specific aspect of this ${pack.name} business that none of these topics covers: ${themes.map((t) => t.name).join(', ')}?`,
    };
  }
  return q;
}

/** One analysis row per vertical. Answers still below threshold after the cascade are left out (not asked / null sentiment), never guessed. */
export function resolveReviewAnalysis(
  result: DecisionResult<string>,
  verticals: VerticalThemes[],
  base: { reviewId: string; competitorId: string; textSha: string },
): (typeof reviewAnalysis.$inferInsert)[] {
  const low = new Set(result.needsReview);
  const a = result.answers;
  const yes = (k: string) => {
    const x = a[k];
    return !low.has(k) && x?.type === 'noul' && x.value === true;
  };
  const s = a.sentiment;
  const sentiment = s?.type === 'score' && !low.has('sentiment') ? s.value : null;
  const confidence = Math.round(Math.min(...Object.values(a).map((x) => x.confidence)) * 100) / 100;
  return verticals.map(({ pack, themes }) => {
    const asked = themes.map((t) => t.id).filter((id) => a[themeKey(pack.id, id)] !== undefined && !low.has(themeKey(pack.id, id)));
    return {
      ...base, verticalId: pack.id, asked, themes: asked.filter((id) => yes(themeKey(pack.id, id))), other: yes(otherKey(pack.id)),
      sentiment, confidence, needsReview: low.size > 0, analysisVersion: REVIEW_VERSION,
    };
  });
}

/** Spec §6.5 review themes + sentiment for one review version. Review text reaches the model only through `redactForModel`. */
export async function analyzeReview(deps: { db: Db; ai: Ai; packs: PackLoader }, reviewId: string): Promise<StageOutcome<{ rows: number }>> {
  const [row] = await deps.db
    .select({ r: review, competitorName: competitor.name })
    .from(review)
    .innerJoin(competitor, eq(competitor.id, review.competitorId))
    .where(eq(review.id, reviewId))
    .limit(1);
  if (!row) throw new Error(`review ${reviewId} not found`);
  const text = row.r.text ?? '';
  if (text.trim().length < MIN_REVIEW_CHARS) throw new Error(`review ${reviewId} has no text to analyse`);
  return runStage(
    deps.db,
    { stage: REVIEW_STAGE, version: REVIEW_VERSION, subjectId: reviewSubjectId(reviewId, text) },
    async () => {
      const verticalIds = await competitorVerticals(deps.db, row.r.competitorId);
      if (verticalIds.length === 0) return [];
      const verticals = await Promise.all(
        verticalIds.map(async (id) => {
          const pack = await deps.packs(id);
          return { pack, themes: await themesForVertical(deps.db, pack) };
        }),
      );
      const state = {
        business_type: verticals.map((v) => v.pack.name).join(' / '),
        rating: row.r.rating,
        review: redactForModel(text, { businessNames: [row.competitorName] }).slice(0, MAX_REVIEW_CHARS),
      };
      const result = await deps.ai.decide('review_decisions', state, buildReviewQuestions(verticals), PLATFORM);
      return resolveReviewAnalysis(result, verticals, { reviewId, competitorId: row.r.competitorId, textSha: sha256Hex(text) });
    },
    async (tx, rows) => {
      for (const r of rows) {
        await tx
          .insert(reviewAnalysis)
          .values(r)
          .onConflictDoUpdate({
            target: [reviewAnalysis.reviewId, reviewAnalysis.verticalId],
            set: {
              textSha: r.textSha, asked: r.asked, themes: r.themes, other: r.other, sentiment: r.sentiment, confidence: r.confidence,
              needsReview: r.needsReview, analysisVersion: r.analysisVersion, analyzedAt: sql`now()`,
            },
          });
      }
      return { rows: rows.length };
    },
  );
}
