import type { DecisionQuestion, ResolvedAnswer } from '@cs/ai';
import type { ChangeType } from '@cs/core';
import { changeEvent, client, competitor, type Db, decisionLabel, decisionReview, decisionSample, detectedChange, eventChange, eventScore } from '@cs/db';
import { and, asc, eq, isNull, notInArray, sql } from 'drizzle-orm';
import { detachChange } from '../events/retract';
import { writeEvent } from '../merge/merge';
import { scoreEvent } from '../score/score-stage';
import { buildTagQuestions, resolveTag, serviceQuestionKey } from '../tag/questions';
import { buildStructuredQuestions } from '../tag/structured';
import { blockEmbedding, competitorVerticals, loadWebChange, type PackLoader, webEventValues } from '../tag/tag-stage';

export type ResolveAction = 'created' | 'updated' | 'detached' | 'retracted' | 'unchanged';

export interface OpenReview {
  id: string;
  createdAt: Date;
  keys: string[];
  answers: Record<string, unknown>;
  changeId: string;
  source: string;
  kind: string;
  beforeText: string | null;
  afterText: string | null;
  competitorName: string;
}

/** Change statuses whose reviews are moot: superseded (replaced by a newer stage version's output) or suppressed (churn guard, never tagged). */
const CLOSED_CHANGE_STATUSES = ['superseded', 'suppressed'];

/** The AM review queue (spec §7.3), oldest first. Phase 5 puts a screen on this. */
export async function listOpenReviews(db: Db, limit = 50): Promise<OpenReview[]> {
  return db
    .select({
      id: decisionReview.id, createdAt: decisionReview.createdAt, keys: decisionReview.keys, answers: decisionReview.answers, changeId: detectedChange.id,
      source: detectedChange.source, kind: detectedChange.kind, beforeText: detectedChange.beforeText, afterText: detectedChange.afterText, competitorName: competitor.name,
    })
    .from(decisionReview)
    .innerJoin(detectedChange, eq(detectedChange.id, decisionReview.subjectId))
    .innerJoin(competitor, eq(competitor.id, detectedChange.competitorId))
    .where(and(isNull(decisionReview.resolvedAt), eq(decisionReview.subjectType, 'detected_change'), notInArray(detectedChange.status, CLOSED_CHANGE_STATUSES)))
    .orderBy(asc(decisionReview.createdAt))
    .limit(limit);
}

/** An AM's answer as a certain decision; throws when the value is not one the question allows. */
function humanAnswer(key: string, q: DecisionQuestion, raw: string | boolean): ResolvedAnswer {
  if (q.type === 'noul') {
    const v = typeof raw === 'boolean' ? raw : raw === 'true' ? true : raw === 'false' ? false : null;
    if (v === null) throw new Error(`answer for ${key} must be true or false (got "${raw}")`);
    return { type: 'noul', value: v, probability: v ? 1 : 0, confidence: 1, provider: 'human' };
  }
  if (q.type === 'choice') {
    const v = String(raw);
    if (!(v in q.options)) throw new Error(`answer for ${key} must be one of ${Object.keys(q.options).join('|')} (got "${v}")`);
    return { type: 'choice', value: v, probabilities: { [v]: 1 }, confidence: 1, provider: 'human' };
  }
  const v = Number(raw);
  if (!Number.isInteger(v) || v < 0 || v >= q.levels.length) throw new Error(`answer for ${key} must be a level from 0 to ${q.levels.length - 1} (got "${raw}")`);
  return { type: 'score', value: v, probabilities: { [String(v)]: 1 }, confidence: 1, provider: 'human' };
}

/**
 * Resolves an open `decision_review` with an AM's answers (spec §7.3): a rejected web change is detached from
 * its event (or the event retracted when it was the only evidence), an accepted one creates or updates the
 * event, and a human-answered question gold-labels the linked sample. Never calls a model.
 */
export async function resolveDecisionReview(
  deps: { db: Db; packs: PackLoader },
  reviewId: string,
  input: { answers: Record<string, string | boolean>; resolvedBy: string },
): Promise<{ action: ResolveAction; eventId: string | null; labels: number }> {
  const { db } = deps;
  const [rev] = await db.select().from(decisionReview).where(eq(decisionReview.id, reviewId)).limit(1);
  if (!rev) throw new Error(`decision_review ${reviewId} not found`);
  if (rev.resolvedAt) throw new Error(`decision_review ${reviewId} is already resolved`);
  if (rev.subjectType !== 'detected_change') throw new Error(`decision_review ${reviewId} has unsupported subject ${rev.subjectType}`);
  const [ch] = await db.select().from(detectedChange).where(eq(detectedChange.id, rev.subjectId)).limit(1);
  if (!ch) throw new Error(`detected_change ${rev.subjectId} not found`);
  if (ch.status === 'superseded') throw new Error(`decision_review ${reviewId}: detected_change ${ch.id} was superseded by a newer stage version; nothing to resolve`);
  if (ch.status === 'suppressed') throw new Error(`decision_review ${reviewId}: detected_change ${ch.id} is suppressed; nothing to resolve`);
  const [sample] = rev.sampleId ? await db.select().from(decisionSample).where(eq(decisionSample.id, rev.sampleId)).limit(1) : [];

  const verticalIds = ch.clientId ? (await db.select({ v: client.verticalId }).from(client).where(eq(client.id, ch.clientId))).map((r) => r.v) : await competitorVerticals(db, ch.competitorId);
  const packs = await Promise.all(verticalIds.map(deps.packs));
  const questions = (sample?.questions as Record<string, DecisionQuestion> | undefined) ??
    (ch.source === 'web' ? buildTagQuestions(packs) : buildStructuredQuestions(ch.details.changeType as ChangeType, packs));

  const human: Record<string, ResolvedAnswer> = {};
  for (const [key, raw] of Object.entries(input.answers)) {
    const q = questions[key];
    if (!q) throw new Error(`unknown question "${key}" for decision_review ${reviewId}`);
    human[key] = humanAnswer(key, q, raw);
  }
  const merged = { ...(rev.answers as Record<string, ResolvedAnswer>), ...human };

  const [link] = await db
    .select({ eventId: eventChange.eventId })
    .from(eventChange)
    .innerJoin(changeEvent, eq(changeEvent.id, eventChange.eventId))
    .where(and(eq(eventChange.changeId, ch.id), isNull(changeEvent.retractedAt)))
    .limit(1);
  const eventId: string | null = link?.eventId ?? null;
  // Loaded before the transaction: loadWebChange/blockEmbedding take the pool Db.
  const webRow = ch.source === 'web' ? await loadWebChange(db, ch.id) : undefined;
  const embedding = webRow ? await blockEmbedding(db, webRow.change) : null;

  // The transaction returns its outcome rather than mutating outer locals: TS doesn't track
  // reassignments made inside a nested closure, so a captured `let` stays narrowed to its initial
  // literal at every read after the (awaited) call that mutates it.
  const outcome = await db.transaction(async (tx) => {
    let action: ResolveAction = 'unchanged';
    let newEventId = eventId;
    let labels = 0;
    if (ch.source === 'web') {
      const res = resolveTag(ch.numericChanges, { answers: merged, needsReview: [] }, packs);
      // A human "not meaningful" wins even over the money rule (which binds models, decision 8).
      const meaningful = human.meaningful?.type === 'noul' ? human.meaningful.value : res.meaningful;
      const type = res.type === 'cosmetic' ? 'content' : res.type;
      if (!meaningful) {
        await tx.update(detectedChange).set({ status: 'cosmetic' }).where(eq(detectedChange.id, ch.id));
        if (newEventId) {
          const d = await detachChange(tx, ch.id, 'review');
          action = d?.retracted ? 'retracted' : 'detached';
        }
      } else if (!newEventId) {
        if (!webRow) throw new Error(`detected_change ${ch.id} has no capture`);
        newEventId = await writeEvent(tx, ch.id, { ...webEventValues(webRow, { ...res, type, meaningful: true, needsReview: [], confidence: 1 }, embedding), needsReview: false }, null);
        await tx.update(detectedChange).set({ status: 'event' }).where(eq(detectedChange.id, ch.id));
        action = 'created';
      } else {
        await tx.update(changeEvent).set({ changeType: type, services: res.services, needsReview: false }).where(eq(changeEvent.id, newEventId));
        await tx.delete(eventScore).where(eq(eventScore.eventId, newEventId));
        action = 'updated';
      }
    } else if (newEventId) {
      const services = Object.fromEntries(
        packs.map((p) => {
          const v = merged[serviceQuestionKey(p.id)]?.value;
          return [p.id, typeof v === 'string' && p.services.some((s) => s.id === v) ? v : null];
        }),
      );
      const offer = human.offer?.type === 'noul' ? human.offer.value : undefined;
      await tx
        .update(changeEvent)
        .set({ services, needsReview: false, ...(offer === undefined ? {} : { details: sql`jsonb_set(${changeEvent.details}, '{offer}', ${JSON.stringify(offer)}::jsonb)` }) })
        .where(eq(changeEvent.id, newEventId));
      await tx.delete(eventScore).where(eq(eventScore.eventId, newEventId));
      action = 'updated';
    }
    await tx.update(decisionReview).set({ resolvedAt: new Date(), resolvedBy: input.resolvedBy, resolution: input.answers }).where(eq(decisionReview.id, reviewId));
    if (sample) {
      for (const [key, a] of Object.entries(human)) {
        const value = String(a.value);
        await tx
          .insert(decisionLabel)
          .values({ sampleId: sample.id, questionKey: key, value, source: 'review', labeledBy: input.resolvedBy })
          .onConflictDoUpdate({ target: [decisionLabel.sampleId, decisionLabel.questionKey], set: { value, source: 'review', labeledBy: input.resolvedBy } });
        labels++;
      }
    }
    return { action, eventId: newEventId, labels };
  });
  if (outcome.eventId && (outcome.action === 'created' || outcome.action === 'updated')) await scoreEvent({ db, packs: deps.packs }, outcome.eventId);
  return { action: outcome.action, eventId: outcome.action === 'unchanged' ? null : outcome.eventId, labels: outcome.labels };
}
