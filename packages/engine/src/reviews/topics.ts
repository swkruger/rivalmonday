import type { Ai, DecisionQuestion, DecisionResult } from '@cs/ai';
import { redactForModel, sha256Hex } from '@cs/collectors';
import { competitor, type Db, review, reviewAnalysis, stageRun, topicProposal, vertical } from '@cs/db';
import type { VerticalPack } from '@cs/verticals';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { runStage, type StageOutcome } from '../stage';
import { competitorVerticals, type PackLoader, singleVerticalScope } from '../tag/tag-stage';

// kept: model-ops key (15b-3 C7)
export const REVIEW_STAGE = 'review_themes';
export const REVIEW_VERSION = 1;
/** Two 90-day benchmark windows (current and previous, for the trend). */
export const REVIEW_ANALYSIS_DAYS = 180;
export const MIN_REVIEW_CHARS = 10;
export const MAX_REVIEW_CHARS = 2000;
export const SENTIMENT_LEVELS = ['very negative', 'negative', 'mixed or neutral', 'positive', 'very positive'];

export interface TopicDef {
  id: string;
  name: string;
  description: string;
}

export interface VerticalTopics {
  pack: VerticalPack;
  topics: TopicDef[];
}

// kept: model-ops key (15b-3 C7) — the question key format is stored in review_decisions
export const themeKey = (verticalId: string, topicId: string) => `theme_${verticalId}__${topicId}`;
export const otherKey = (verticalId: string) => `other_${verticalId}`;

/** Stage subject of a review *version*: `md5(review_id || '|' || text)` as a uuid — the sweep computes the same in SQL, so an edit re-runs the stage. */
export function reviewSubjectId(reviewId: string, text: string): string {
  const h = createHash('md5').update(`${reviewId}|${text}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** A vertical's review topics: the pack's seed topics, then AM-approved discovered topics in approval order. */
export async function topicsForVertical(db: Db, pack: VerticalPack): Promise<TopicDef[]> {
  const seed: TopicDef[] = pack.topics.map((t) => ({ id: t.id, name: t.name, description: t.description }));
  const approved = await db
    .select({ id: topicProposal.topicId, name: topicProposal.name, description: topicProposal.description })
    .from(topicProposal)
    .where(and(eq(topicProposal.verticalId, pack.id), eq(topicProposal.status, 'approved')))
    .orderBy(asc(topicProposal.decidedAt));
  return [...seed, ...approved.filter((a) => !seed.some((s) => s.id === a.id))];
}

/** Spec §6.5: one call per review — a sentiment Score plus one Noul per topic (and "other") per vertical. */
export function buildReviewQuestions(verticals: VerticalTopics[]): Record<string, DecisionQuestion> {
  const q: Record<string, DecisionQuestion> = {
    sentiment: { type: 'score', instructions: 'Overall, how does the reviewer feel about the business?', levels: SENTIMENT_LEVELS },
  };
  for (const { pack, topics } of verticals) {
    for (const t of topics) {
      q[themeKey(pack.id, t.id)] = {
        type: 'noul',
        instructions: `Does the review talk about ${t.name.toLowerCase()} (${t.description.toLowerCase()}) — as praise or as a complaint?`,
      };
    }
    q[otherKey(pack.id)] = {
      type: 'noul',
      instructions: `Does the review raise a specific aspect of this ${pack.name} business that none of these topics covers: ${topics.map((t) => t.name).join(', ')}?`,
    };
  }
  return q;
}

/** One analysis row per vertical. Answers still below threshold after the cascade are left out (not asked / null sentiment), never guessed. */
export function resolveReviewAnalysis(
  result: DecisionResult<string>,
  verticals: VerticalTopics[],
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
  return verticals.map(({ pack, topics }) => {
    const asked = topics.map((t) => t.id).filter((id) => a[themeKey(pack.id, id)] !== undefined && !low.has(themeKey(pack.id, id)));
    return {
      ...base, verticalId: pack.id, asked, topics: asked.filter((id) => yes(themeKey(pack.id, id))), other: yes(otherKey(pack.id)),
      sentiment, confidence, needsReview: low.size > 0, analysisVersion: REVIEW_VERSION,
    };
  });
}

/** Spec §6.5 review topics + sentiment for one review version. Review text reaches the model only through `redactForModel`. */
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
          return { pack, topics: await topicsForVertical(deps.db, pack) };
        }),
      );
      const state = {
        business_type: verticals.map((v) => v.pack.name).join(' / '),
        rating: row.r.rating,
        review: redactForModel(text, { businessNames: [row.competitorName] }).slice(0, MAX_REVIEW_CHARS),
      };
      const result = await deps.ai.decide('review_decisions', state, buildReviewQuestions(verticals), singleVerticalScope(verticalIds));
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
              textSha: r.textSha, asked: r.asked, topics: r.topics, other: r.other, sentiment: r.sentiment, confidence: r.confidence,
              needsReview: r.needsReview, analysisVersion: r.analysisVersion, analyzedAt: sql`now()`,
              checkedAt: null, // a text edit restarts the re-ask marker
            },
          });
      }
      return { rows: rows.length };
    },
  );
}

// --- Re-ask (15b-3b §5): older reviews get only the questions they were never asked. ---

/** A vertical's topics read fresh from the DB (P5) — never the cached pack loader, which may be up to 60 s stale. */
export interface ReaskTopics {
  seed: TopicDef[];
  /** When the seed list may last have changed: own `updated_at`, or `greatest(own, generic)` for an inheriting vertical. */
  seedEditedAt: Date | null;
  approved: (TopicDef & { decidedAt: Date })[];
}

export interface ReaskGap {
  /** a = the row exists (ask only the missing topics); b = no row for this vertical yet (full analysis). */
  kind: 'a' | 'b';
  verticalId: string;
  topics: TopicDef[];
}

export interface ReaskOutcome {
  ran: boolean;
  questions: number;
  rows: number;
}

const topicList = (v: unknown): TopicDef[] =>
  Array.isArray(v)
    ? v
        .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null && typeof (t as { id?: unknown }).id === 'string')
        .map((t) => ({ id: t.id as string, name: String(t.name ?? t.id), description: String(t.description ?? '') }))
    : [];

/** Mirrors the sweep SQL: seed = own `config.topics` when the key exists, else generic's (the whole-array replace of `assemblePack`). */
export async function reaskTopics(db: Db, verticalId: string): Promise<ReaskTopics> {
  const rows = await db
    .select({ id: vertical.id, config: vertical.config, updatedAt: vertical.updatedAt })
    .from(vertical)
    .where(inArray(vertical.id, [verticalId, 'generic']));
  const own = rows.find((r) => r.id === verticalId);
  // The sweep joins `vertical`: a vertical without a catalogue row never has an (a) gap.
  if (!own) return { seed: [], seedEditedAt: null, approved: [] };
  const generic = rows.find((r) => r.id === 'generic');
  const hasOwn = Object.prototype.hasOwnProperty.call(own.config, 'topics');
  const seed = topicList(hasOwn ? own.config.topics : generic?.config.topics);
  const seedEditedAt = hasOwn || !generic || generic.updatedAt <= own.updatedAt ? own.updatedAt : generic.updatedAt;
  const approved = await db
    .select({ id: topicProposal.topicId, name: topicProposal.name, description: topicProposal.description, decidedAt: topicProposal.decidedAt })
    .from(topicProposal)
    .where(and(eq(topicProposal.verticalId, verticalId), eq(topicProposal.status, 'approved')))
    .orderBy(asc(topicProposal.decidedAt));
  // A null decided_at never triggers (SQL `NULL > mark` is not true), but the topic still belongs to the list.
  return { seed, seedEditedAt, approved: approved.map((a) => ({ id: a.id, name: a.name, description: a.description, decidedAt: a.decidedAt ?? new Date(0) })) };
}

/** The exact JS twin of the sweep's gap SQL (Review focus 1): null = nothing to ask for this vertical. */
export function reaskGap(verticalId: string, row: { asked: string[]; analyzedAt: Date; checkedAt: Date | null } | null, t: ReaskTopics): ReaskGap | null {
  const strip = (x: TopicDef): TopicDef => ({ id: x.id, name: x.name, description: x.description });
  const all = [...t.seed, ...t.approved.filter((a) => !t.seed.some((s) => s.id === a.id))].map(strip);
  if (!row) return { kind: 'b', verticalId, topics: all };
  const mark = row.checkedAt ?? row.analyzedAt;
  const asked = new Set(row.asked);
  const seedEdited = t.seedEditedAt !== null && t.seedEditedAt > mark;
  const approvedSince = new Set(t.approved.filter((a) => a.decidedAt > mark).map((a) => a.id));
  const topics = all.filter((x) => !asked.has(x.id) && (approvedSince.has(x.id) || (seedEdited && t.seed.some((s) => s.id === x.id))));
  return topics.length > 0 ? { kind: 'a', verticalId, topics } : null;
}

/** (a) asks only its topic keys; (b) asks every topic key + `other`; `sentiment` only when there is a (b) gap. Wording as `buildReviewQuestions`. */
export function buildReaskQuestions(gaps: ReaskGap[], packs: Map<string, VerticalPack>): Record<string, DecisionQuestion> {
  const pack = (id: string) => {
    const p = packs.get(id);
    if (!p) throw new Error(`no pack for vertical ${id}`);
    return p;
  };
  const b = gaps.filter((g) => g.kind === 'b');
  const q: Record<string, DecisionQuestion> = b.length > 0 ? buildReviewQuestions(b.map((g) => ({ pack: pack(g.verticalId), topics: g.topics }))) : {};
  for (const g of gaps.filter((x) => x.kind === 'a')) {
    const full = buildReviewQuestions([{ pack: pack(g.verticalId), topics: g.topics }]);
    for (const t of g.topics) q[themeKey(g.verticalId, t.id)] = full[themeKey(g.verticalId, t.id)]!;
  }
  return q;
}

const dedupe = (xs: string[]) => [...new Set(xs)];

/**
 * Re-asks one review only what it was never asked (spec §5). Not a stage: the `checked_at` marker is the idempotence,
 * set to the handler's start time (P6). A throwing decide writes nothing (P9) — the next sweep offers the review again.
 */
export async function reaskReview(deps: { db: Db; ai: Ai; packs: PackLoader; now?: () => Date }, reviewId: string): Promise<ReaskOutcome> {
  const startedAt = deps.now?.() ?? new Date();
  const none: ReaskOutcome = { ran: false, questions: 0, rows: 0 };
  const { db } = deps;
  const [row] = await db
    .select({ r: review, competitorName: competitor.name })
    .from(review)
    .innerJoin(competitor, eq(competitor.id, review.competitorId))
    .where(eq(review.id, reviewId))
    .limit(1);
  if (!row) return none;
  const text = row.r.text ?? '';
  if (text.trim().length < MIN_REVIEW_CHARS) return none;
  if (!row.r.postedAt || row.r.postedAt.getTime() < startedAt.getTime() - REVIEW_ANALYSIS_DAYS * 86_400_000) return none;
  // P8: only once the current text has a *done* first analysis (failed or exhausted ones are never re-asked).
  const [done] = await db
    .select({ s: stageRun.status })
    .from(stageRun)
    .where(and(eq(stageRun.stage, REVIEW_STAGE), eq(stageRun.stageVersion, REVIEW_VERSION), eq(stageRun.subjectId, reviewSubjectId(reviewId, text)), eq(stageRun.status, 'done')))
    .limit(1);
  if (!done) return none;

  const competitorId = row.r.competitorId;
  const verticalIds = await competitorVerticals(db, competitorId);
  if (verticalIds.length === 0) return { ran: true, questions: 0, rows: 0 };
  const current = and(eq(reviewAnalysis.reviewId, reviewId), inArray(reviewAnalysis.verticalId, verticalIds));
  const rows = await db.select().from(reviewAnalysis).where(current);
  const gaps: ReaskGap[] = [];
  for (const v of verticalIds) {
    const g = reaskGap(v, rows.find((r) => r.verticalId === v) ?? null, await reaskTopics(db, v));
    if (g) gaps.push(g);
  }
  if (gaps.length === 0) {
    const marked = await db.update(reviewAnalysis).set({ checkedAt: startedAt }).where(current).returning({ v: reviewAnalysis.verticalId });
    return { ran: true, questions: 0, rows: marked.length };
  }

  const packs = new Map(await Promise.all(verticalIds.map(async (v) => [v, await deps.packs(v)] as const)));
  const questions = buildReaskQuestions(gaps, packs);
  const state = {
    business_type: verticalIds.map((v) => packs.get(v)!.name).join(' / '),
    rating: row.r.rating,
    review: redactForModel(text, { businessNames: [row.competitorName] }).slice(0, MAX_REVIEW_CHARS),
  };
  const result = await deps.ai.decide('review_decisions', state, questions, singleVerticalScope(gaps.map((g) => g.verticalId)));
  const textSha = sha256Hex(text);
  const low = new Set(result.needsReview);
  const a = result.answers;

  const written = await db.transaction(async (tx) => {
    // The text may have been edited while the model ran: the answers then belong to the old text — write nothing.
    const [cur] = await tx.select({ text: review.text }).from(review).where(eq(review.id, reviewId)).for('share');
    if (!cur || sha256Hex(cur.text ?? '') !== textSha) return 0;
    let n = 0;
    for (const g of gaps.filter((x) => x.kind === 'a')) {
      const pk = and(eq(reviewAnalysis.reviewId, reviewId), eq(reviewAnalysis.verticalId, g.verticalId));
      const [locked] = await tx.select().from(reviewAnalysis).where(pk).for('update');
      if (!locked || locked.textSha !== textSha) continue;
      const keys = g.topics.map((t) => ({ id: t.id, key: themeKey(g.verticalId, t.id) }));
      const confident = keys.filter((k) => a[k.key] !== undefined && !low.has(k.key));
      const yes = confident.filter((k) => {
        const x = a[k.key];
        return x?.type === 'noul' && x.value === true;
      });
      const confs = keys.map((k) => a[k.key]?.confidence).filter((c): c is number => typeof c === 'number');
      await tx
        .update(reviewAnalysis)
        .set({
          asked: dedupe([...locked.asked, ...confident.map((k) => k.id)]),
          topics: dedupe([...locked.topics, ...yes.map((k) => k.id)]),
          confidence: Math.round(Math.min(locked.confidence, ...confs) * 100) / 100,
          needsReview: locked.needsReview || keys.some((k) => low.has(k.key)),
          checkedAt: startedAt,
          // analyzed_at, sentiment, other and analysis_version stay as the first analysis left them (discovery counts by analyzed_at).
        })
        .where(pk);
      n++;
    }
    const b = gaps.filter((x) => x.kind === 'b');
    if (b.length > 0) {
      const fresh = resolveReviewAnalysis(result, b.map((g) => ({ pack: packs.get(g.verticalId)!, topics: g.topics })), { reviewId, competitorId, textSha });
      const inserted = await tx
        .insert(reviewAnalysis)
        .values(fresh.map((r) => ({ ...r, checkedAt: startedAt })))
        .onConflictDoNothing()
        .returning({ v: reviewAnalysis.verticalId });
      n += inserted.length;
    }
    const rest = verticalIds.filter((v) => !gaps.some((g) => g.verticalId === v));
    if (rest.length > 0) {
      const marked = await tx
        .update(reviewAnalysis)
        .set({ checkedAt: startedAt })
        .where(and(eq(reviewAnalysis.reviewId, reviewId), inArray(reviewAnalysis.verticalId, rest), eq(reviewAnalysis.textSha, textSha)))
        .returning({ v: reviewAnalysis.verticalId });
      n += marked.length;
    }
    return n;
  });
  return { ran: true, questions: Object.keys(questions).length, rows: written };
}
