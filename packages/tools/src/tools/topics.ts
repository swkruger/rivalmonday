import { toolkit, ToolError } from '@cs/core';
import { review, topicProposal } from '@cs/db';
import { decideTopicProposal } from '@cs/engine';
import { and, count, desc, eq, gte, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { catalogPacks } from '../catalog/access';
import type { ToolDeps } from '../deps';
import { requirePlatformOperator } from '../platform';
import { TopicProposalView } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const SAMPLE_CHARS = 300;
const DECIDED_WINDOW_DAYS = 30;

/** The proposal rows `list_topic_proposals` reads: every proposed one plus decisions from the last 30 days ('none' rows never). */
export const topicProposalsWhere = (now = Date.now()) =>
  or(eq(topicProposal.status, 'proposed'), and(inArray(topicProposal.status, ['approved', 'rejected']), gte(topicProposal.decidedAt, new Date(now - DECIDED_WINDOW_DAYS * 86_400_000))));

/** The Topic proposals badge: the list's `pending` rows (status `proposed`). Service role — proposals are platform-wide. */
export async function countPendingTopicProposals(db: ToolDeps['service']): Promise<number> {
  const [row] = await db.select({ n: count() }).from(topicProposal).where(and(topicProposalsWhere(), eq(topicProposal.status, 'proposed')));
  return row?.n ?? 0;
}

export const listTopicProposals = defineTool({
  name: 'list_topic_proposals',
  access: 'read',
  description: 'Platform operators: new review topics the model proposes per business type, and recent decisions.',
  input: z.object({}),
  output: z.object({ pending: z.array(TopicProposalView), decided: z.array(TopicProposalView) }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    await requirePlatformOperator(deps, ctx);
    // 'none' rows (the model found nothing) are never listed.
    const rows = await deps.service
      .select()
      .from(topicProposal)
      .where(topicProposalsWhere())
      .orderBy(desc(topicProposal.createdAt))
      .limit(50);
    const sampleIds = [...new Set(rows.flatMap((r) => r.sampleReviewIds.slice(0, 3)))];
    const texts = sampleIds.length ? await deps.service.select({ id: review.id, text: review.text }).from(review).where(inArray(review.id, sampleIds)) : [];
    const textOf = new Map(texts.map((t) => [t.id, t.text ?? '']));
    const packs = await catalogPacks(deps);
    const names = new Map(packs.map((p) => [p.id, p.name]));
    const toView = (r: (typeof rows)[number]): z.input<typeof TopicProposalView> => ({
      id: r.id, verticalId: r.verticalId, verticalName: names.get(r.verticalId) ?? r.verticalId, topicId: r.topicId, name: r.name, description: r.description,
      status: r.status as 'proposed' | 'approved' | 'rejected', otherCount: r.otherCount, createdAt: r.createdAt.toISOString(), decidedAt: r.decidedAt?.toISOString() ?? null,
      samples: r.sampleReviewIds
        .slice(0, 3)
        .map((id) => textOf.get(id))
        .filter((t): t is string => Boolean(t))
        .map((t) => (t.length > SAMPLE_CHARS ? `${t.slice(0, SAMPLE_CHARS)}…` : t)),
    });
    return { pending: rows.filter((r) => r.status === 'proposed').map(toView), decided: rows.filter((r) => r.status !== 'proposed').map(toView) };
  },
});

export const decideTopicProposalTool = defineTool({
  name: 'decide_topic_proposal',
  access: 'write',
  description: 'Platform operators: approve or reject a proposed review topic.',
  input: z.object({ proposalId: z.string().uuid(), decision: z.enum(['approved', 'rejected']) }),
  output: z.object({ ok: z.literal(true) }),
  permission: 'agency',
  async handler(ctx, { proposalId, decision }, deps) {
    await requirePlatformOperator(deps, ctx);
    try {
      await decideTopicProposal(deps.service, proposalId, decision, ctx.userId);
    } catch (e) {
      if (e instanceof Error && /not awaiting a decision/.test(e.message)) throw new ToolError('invalid_input', 'This proposal was already decided');
      throw e;
    }
    return { ok: true as const };
  },
});

export const topicTools = [listTopicProposals, decideTopicProposalTool];
