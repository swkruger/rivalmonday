import { toolkit, ToolError } from '@cs/core';
import { review, themeProposal } from '@cs/db';
import { decideThemeProposal } from '@cs/engine';
import { listVerticalPacks } from '@cs/verticals';
import { and, desc, eq, gte, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { packsOf, type ToolDeps } from '../deps';
import { requirePlatformOperator } from '../platform';
import { ThemeProposalView } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const SAMPLE_CHARS = 300;
const DECIDED_WINDOW_DAYS = 30;

export const listThemeProposals = defineTool({
  name: 'list_theme_proposals',
  description: 'Platform operators: new review topics the model proposes per business type, and recent decisions.',
  input: z.object({}),
  output: z.object({ pending: z.array(ThemeProposalView), decided: z.array(ThemeProposalView) }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    await requirePlatformOperator(deps, ctx);
    const since = new Date(Date.now() - DECIDED_WINDOW_DAYS * 86_400_000);
    // 'none' rows (the model found nothing) are never listed.
    const rows = await deps.service
      .select()
      .from(themeProposal)
      .where(or(eq(themeProposal.status, 'proposed'), and(inArray(themeProposal.status, ['approved', 'rejected']), gte(themeProposal.decidedAt, since))))
      .orderBy(desc(themeProposal.createdAt))
      .limit(50);
    const sampleIds = [...new Set(rows.flatMap((r) => r.sampleReviewIds.slice(0, 3)))];
    const texts = sampleIds.length ? await deps.service.select({ id: review.id, text: review.text }).from(review).where(inArray(review.id, sampleIds)) : [];
    const textOf = new Map(texts.map((t) => [t.id, t.text ?? '']));
    const packs = await Promise.all((await listVerticalPacks()).map((id) => packsOf(deps)(id)));
    const names = new Map(packs.map((p) => [p.id, p.name]));
    const toView = (r: (typeof rows)[number]): z.input<typeof ThemeProposalView> => ({
      id: r.id, verticalId: r.verticalId, verticalName: names.get(r.verticalId) ?? r.verticalId, themeId: r.themeId, name: r.name, description: r.description,
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

export const decideThemeProposalTool = defineTool({
  name: 'decide_theme_proposal',
  description: 'Platform operators: approve or reject a proposed review topic.',
  input: z.object({ proposalId: z.string().uuid(), decision: z.enum(['approved', 'rejected']) }),
  output: z.object({ ok: z.literal(true) }),
  permission: 'agency',
  async handler(ctx, { proposalId, decision }, deps) {
    await requirePlatformOperator(deps, ctx);
    try {
      await decideThemeProposal(deps.service, proposalId, decision, ctx.userId);
    } catch (e) {
      if (e instanceof Error && /not awaiting a decision/.test(e.message)) throw new ToolError('invalid_input', 'This proposal was already decided');
      throw e;
    }
    return { ok: true as const };
  },
});

export const themeTools = [listThemeProposals, decideThemeProposalTool];
