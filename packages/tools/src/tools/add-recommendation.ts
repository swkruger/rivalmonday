import { appLinkFor, toolkit, ToolError } from '@cs/core';
import { capture, client, evidence, feedback, recommendation, withTenant } from '@cs/db';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { competitorLinked } from '../workspace/evidence-access';
import { requireVisibleEvent, workspaceClient } from '../workspace/scope';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const LEVEL = z.enum(['L', 'M', 'H']);
const UNSEEN = 'Every evidence id must be one you can see';

export const addRecommendation = defineTool({
  name: 'add_recommendation',
  access: 'write',
  description: 'Save a recommended next step for a client, backed by evidence you can see (no evidence, no recommendation).',
  input: z.object({
    clientId: uuid,
    title: z.string().trim().min(3).max(120),
    rationale: z.string().trim().min(10).max(1000),
    evidenceIds: z.array(uuid).min(1).max(10),
    eventIds: z.array(uuid).max(10).optional(),
    effort: LEVEL,
    impact: LEVEL,
    owner: z.enum(['client', 'agency']).default('client'),
  }),
  output: z.object({ id: uuid, url: z.string() }),
  permission: 'feedback',
  feature: 'dashboard',
  channels: ['mcp', 'ask'],
  async handler(ctx, input, deps, meta) {
    if (ctx.userId.startsWith('contact:')) throw new ToolError('permission_denied', 'Sign in to add a recommendation');
    const c = await workspaceClient(deps, ctx, input.clientId);
    const [st] = await withTenant(deps.app, ctx, (tx) => tx.select({ status: client.status }).from(client).where(eq(client.id, c.id)));
    if (st?.status !== 'active') throw new ToolError('not_found', 'Client not found');

    const evidenceIds = [...new Set(input.evidenceIds)];
    const eventIds = [...new Set(input.eventIds ?? [])];
    const rows = await deps.service.select({ id: evidence.id, competitorId: capture.competitorId })
      .from(evidence).innerJoin(capture, eq(capture.id, evidence.captureId)).where(inArray(evidence.id, evidenceIds));
    if (rows.length !== evidenceIds.length) throw new ToolError('invalid_input', UNSEEN);
    for (const competitorId of new Set(rows.map((r) => r.competitorId))) {
      if (!(await competitorLinked(deps, ctx, c.id, competitorId))) throw new ToolError('invalid_input', UNSEEN);
    }
    for (const eventId of eventIds) {
      try { await requireVisibleEvent(deps, ctx, c.id, eventId); } catch (e) {
        if (e instanceof ToolError && e.code === 'not_found') throw new ToolError('invalid_input', UNSEEN);
        throw e;
      }
    }

    const [rec] = await deps.service.insert(recommendation).values({
      agencyId: ctx.agencyId, clientId: c.id, title: input.title, rationale: input.rationale, evidenceIds, eventIds,
      effort: input.effort, impact: input.impact, owner: input.owner, status: 'todo', source: meta.channel, upsellTag: null,
    }).returning({ id: recommendation.id });
    await deps.service.insert(feedback).values({
      agencyId: ctx.agencyId, clientId: c.id, subjectType: 'recommendation', subjectId: rec!.id, kind: 'created', actor: ctx.userId,
    });
    return { id: rec!.id, url: appLinkFor(deps.appUrl, { t: 'recommendation', clientId: c.id, id: rec!.id }) };
  },
});

export const addRecommendationTools = [addRecommendation];
