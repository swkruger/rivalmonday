import { canAccessClient, isAgencyRole, toolkit, ToolError } from '@cs/core';
import { recommendation, withTenant } from '@cs/db';
import { updateRecommendationStatus } from '@cs/engine';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { RecommendationView, toIso } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const STATUSES = ['todo', 'in_progress', 'done', 'dismissed'] as const;

export const listRecommendations = defineTool({
  name: 'list_recommendations',
  description: 'Recommended next steps for a client, newest first, with their status.',
  input: z.object({ clientId: uuid }),
  output: z.object({ items: z.array(RecommendationView) }),
  permission: 'read',
  async handler(ctx, { clientId }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const rows = await withTenant(deps.app, ctx, (tx) => tx.select().from(recommendation).where(eq(recommendation.clientId, clientId)).orderBy(desc(recommendation.updatedAt)).limit(300));
    const agency = isAgencyRole(ctx.role);
    return {
      items: rows.map((r) => ({
        id: r.id, title: r.title, rationale: r.rationale, effort: r.effort, impact: r.impact, owner: r.owner, status: r.status as (typeof STATUSES)[number],
        dismissReason: r.dismissReason, dueAt: toIso(r.dueAt), source: r.source, evidenceIds: r.evidenceIds, upsellTag: agency ? r.upsellTag : null,
        createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
      })),
    };
  },
});

export const updateRecommendationStatusTool = defineTool({
  name: 'update_recommendation_status',
  description: 'Move a recommendation to to-do, in progress, done or dismissed (dismissing needs a reason).',
  input: z.object({ recommendationId: uuid, status: z.enum(STATUSES), reason: z.string().max(500).optional() }),
  output: z.object({ ok: z.literal(true) }),
  permission: 'manage',
  async handler(ctx, { recommendationId, status, reason }, deps) {
    await updateRecommendationStatus({ service: deps.service, app: deps.app }, ctx, recommendationId, status, reason?.trim() || undefined);
    return { ok: true as const };
  },
});

export const recommendationTools = [listRecommendations, updateRecommendationStatusTool];
