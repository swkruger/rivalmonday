import type { DecisionQuestion } from '@cs/ai';
import { toolkit } from '@cs/core';
import { listOpenReviews, resolveDecisionReview, reviewQuestions } from '@cs/engine';
import { z } from 'zod';
import { packsOf, type ToolDeps } from '../deps';
import { requirePlatformOperator } from '../platform';
import { DecisionReviewView } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const TEXT_MAX = 2000;
const clip = (t: string | null) => (t === null ? null : t.length > TEXT_MAX ? `${t.slice(0, TEXT_MAX)}…` : t);

function options(q: DecisionQuestion): { value: string; label: string }[] {
  if (q.type === 'noul') return [{ value: 'true', label: q.criteria?.true ?? 'Yes' }, { value: 'false', label: q.criteria?.false ?? 'No' }];
  if (q.type === 'choice') return Object.entries(q.options).map(([value, label]) => ({ value, label }));
  return q.levels.map((label, i) => ({ value: String(i), label }));
}

export const listDecisionReviews = defineTool({
  name: 'list_decision_reviews',
  description: 'Platform operators: model decisions below the confidence threshold, waiting for a human answer (oldest first).',
  input: z.object({}),
  output: z.object({ items: z.array(DecisionReviewView) }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    await requirePlatformOperator(deps, ctx);
    const open = await listOpenReviews(deps.service, 50);
    const items: z.input<typeof DecisionReviewView>[] = [];
    for (const r of open) {
      let qs: Awaited<ReturnType<typeof reviewQuestions>>;
      try {
        qs = await reviewQuestions({ db: deps.service, packs: packsOf(deps) }, r.id);
      } catch (e) {
        // Resolved or superseded between the list and this read, or a bad row: one item must not fail the whole queue (F8).
        console.warn(`list_decision_reviews: skipping decision_review ${r.id}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
      const said = r.answers as Record<string, { value?: unknown; confidence?: number } | undefined>;
      items.push({
        id: r.id, createdAt: r.createdAt.toISOString(), competitorName: r.competitorName, source: r.source, kind: r.kind, beforeText: clip(r.beforeText), afterText: clip(r.afterText),
        questions: qs.map(({ key, question }) => ({
          key, type: question.type, instructions: question.instructions, options: options(question),
          modelAnswer: said[key]?.value === undefined ? null : String(said[key].value), confidence: said[key]?.confidence ?? null,
        })),
      });
    }
    return { items };
  },
});

export const resolveDecisionReviewTool = defineTool({
  name: 'resolve_decision_review',
  description: 'Platform operators: answer a waiting model decision; the change, its event and the gold labels are updated.',
  input: z.object({
    reviewId: z.string().uuid(),
    answers: z.record(z.string().max(80), z.string().max(80)).refine((a) => Object.keys(a).length > 0 && Object.keys(a).length <= 20, 'Answer at least one question'),
  }),
  output: z.object({ action: z.enum(['created', 'updated', 'detached', 'retracted', 'unchanged']), eventId: z.string().uuid().nullable(), labels: z.number().int() }),
  permission: 'agency',
  async handler(ctx, { reviewId, answers }, deps) {
    await requirePlatformOperator(deps, ctx);
    return resolveDecisionReview({ db: deps.service, packs: packsOf(deps) }, reviewId, { answers, resolvedBy: ctx.userId });
  },
});

export const modelOpsTools = [listDecisionReviews, resolveDecisionReviewTool];
