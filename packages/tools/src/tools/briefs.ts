import { type AccessContext, canAccessClient, isAgencyRole, toolkit, ToolError } from '@cs/core';
import { brief, competitor, withTenant } from '@cs/db';
import { getBrief } from '@cs/engine';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../registry';
import { BriefDetail, BriefSummary, listInput, toIso } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const CLIENT_VISIBLE = ['approved', 'sent'];

const summary = (b: typeof brief.$inferSelect): BriefSummary => ({
  id: b.id, clientId: b.clientId, deliveryDate: b.deliveryDate, status: b.status, kind: b.kind, summary: b.summary, sentAt: toIso(b.sentAt), hasPdf: b.pdfKey !== null,
});

export const listBriefs = defineTool({
  name: 'list_briefs',
  description: 'List weekly briefs for a client, newest delivery date first.',
  input: listInput(52),
  output: z.object({ items: z.array(BriefSummary) }),
  permission: 'read',
  async handler(ctx, { clientId, limit }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const where = isAgencyRole(ctx.role) ? eq(brief.clientId, clientId) : and(eq(brief.clientId, clientId), inArray(brief.status, CLIENT_VISIBLE));
    const rows = await withTenant(deps.app, ctx, (tx) => tx.select().from(brief).where(where).orderBy(desc(brief.deliveryDate)).limit(limit));
    return { items: rows.map(summary) };
  },
});

export async function briefDetail(deps: ToolDeps, ctx: AccessContext, briefId: string): Promise<BriefDetail> {
  const view = await getBrief({ app: deps.app }, ctx, briefId); // 4a: visibility, status gate and upsell stripping
  const competitorIds = [...new Set(view.items.map((i) => i.competitorId))];
  const names = competitorIds.length
    ? await withTenant(deps.app, ctx, (tx) => tx.select({ id: competitor.id, name: competitor.name }).from(competitor).where(inArray(competitor.id, competitorIds)))
    : [];
  const nameOf = new Map(names.map((n) => [n.id, n.name]));
  const agency = isAgencyRole(ctx.role);
  return {
    ...summary(view.brief), periodStart: view.brief.periodStart.toISOString(), periodEnd: view.brief.periodEnd.toISOString(), approvedAt: toIso(view.brief.approvedAt),
    items: view.items.map((i) => ({
      id: i.id, ord: i.ord, competitorId: i.competitorId, competitorName: nameOf.get(i.competitorId) ?? 'Competitor', headline: i.headline, whatChanged: i.whatChanged,
      whyItMatters: i.whyItMatters, recommendedAction: i.recommendedAction, confidence: i.confidence, effort: i.effort, impact: i.impact, evidenceIds: i.evidenceIds,
      status: i.status, upsellTag: agency ? i.upsellTag : null,
    })),
  };
}

export const getBriefTool = defineTool({
  name: 'get_brief',
  description: 'Get one weekly brief with its items. Client roles see approved or sent briefs only, without agency-only tags.',
  input: z.object({ briefId: z.string().uuid() }),
  output: BriefDetail,
  permission: 'read',
  async handler(ctx, { briefId }, deps) {
    return briefDetail(deps, ctx, briefId);
  },
});

export const briefTools = [listBriefs, getBriefTool];
