import { type AccessContext, appLinkFor, canAccessClient, isAgencyRole, toolkit, ToolError } from '@cs/core';
import { brief, briefItem, client, competitor, withTenant } from '@cs/db';
import { getBrief, Scorecard } from '@cs/engine';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { detailOf, pageOf, pageResult } from '../paging';
import type { ToolDeps } from '../registry';
import { BriefDetail, BriefSummary, pagedItems, pagedListInput, toIso } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const CLIENT_VISIBLE = ['approved', 'sent'];

const summary = (b: typeof brief.$inferSelect): BriefSummary => ({
  id: b.id, clientId: b.clientId, deliveryDate: b.deliveryDate, status: b.status, kind: b.kind, summary: b.summary, sentAt: toIso(b.sentAt), hasPdf: b.pdfKey !== null,
});

export const listBriefs = defineTool({
  name: 'list_briefs',
  access: 'read',
  description: 'List weekly briefs for a client, newest delivery date first.',
  input: pagedListInput(52),
  output: z.object({ items: pagedItems(BriefSummary), nextCursor: z.string().nullable().optional() }),
  permission: 'read',
  channels: ['web', 'mcp', 'ask'],
  async handler(ctx, input, deps, meta) {
    const { clientId } = input;
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const { offset, limit } = pageOf(input, meta, 20);
    const where = isAgencyRole(ctx.role) ? eq(brief.clientId, clientId) : and(eq(brief.clientId, clientId), inArray(brief.status, CLIENT_VISIBLE));
    const fetched = await withTenant(deps.app, ctx, (tx) => tx.select().from(brief).where(where).orderBy(desc(brief.deliveryDate), desc(brief.id)).offset(offset).limit(limit + 1));
    const { rows, nextCursor } = pageResult(fetched, limit, offset);
    if (detailOf(input, meta) === 'full') return { items: rows.map(summary), nextCursor };
    // Active items only: dropped items never reach the reader (same rule as get_brief).
    const items = rows.length
      ? await withTenant(deps.app, ctx, (tx) =>
        tx.select({ briefId: briefItem.briefId, evidenceIds: briefItem.evidenceIds }).from(briefItem).where(and(inArray(briefItem.briefId, rows.map((b) => b.id)), eq(briefItem.status, 'active'))).orderBy(asc(briefItem.ord)))
      : [];
    const evidenceOf = new Map<string, string[]>();
    for (const i of items) {
      const list = evidenceOf.get(i.briefId) ?? [];
      for (const id of i.evidenceIds) if (!list.includes(id)) list.push(id);
      evidenceOf.set(i.briefId, list);
    }
    return {
      items: rows.map((b) => ({ id: b.id, title: `Weekly brief ${b.deliveryDate}`, date: b.deliveryDate, evidenceIds: evidenceOf.get(b.id) ?? [], url: appLinkFor(deps.appUrl, { t: 'brief', id: b.id }) })),
      nextCursor,
    };
  },
});

export async function briefDetail(deps: ToolDeps, ctx: AccessContext, briefId: string): Promise<BriefDetail> {
  const view = await getBrief({ app: deps.app }, ctx, briefId); // 4a: visibility, status gate and upsell stripping
  const competitorIds = [...new Set(view.items.flatMap((i) => (i.competitorId ? [i.competitorId] : [])))];
  const names = competitorIds.length
    ? await withTenant(deps.app, ctx, (tx) => tx.select({ id: competitor.id, name: competitor.name }).from(competitor).where(inArray(competitor.id, competitorIds)))
    : [];
  const nameOf = new Map(names.map((n) => [n.id, n.name]));
  // Self items (Phase 12b) have no competitor: fall back to the client's name until the UI renders them (Task 7).
  const clientName = view.items.some((i) => !i.competitorId)
    ? (await withTenant(deps.app, ctx, (tx) => tx.select({ name: client.name }).from(client).where(eq(client.id, view.brief.clientId))))[0]?.name
    : undefined;
  const agency = isAgencyRole(ctx.role);
  return {
    ...summary(view.brief), periodStart: view.brief.periodStart.toISOString(), periodEnd: view.brief.periodEnd.toISOString(), approvedAt: toIso(view.brief.approvedAt),
    scorecard: Scorecard.safeParse(view.brief.scorecard).data ?? null, trend: view.brief.trend ?? null,
    items: view.items.map((i) => ({
      id: i.id, ord: i.ord, competitorId: i.competitorId, subject: i.subject, competitorName: (i.competitorId ? nameOf.get(i.competitorId) : clientName) ?? 'Competitor', headline: i.headline, whatChanged: i.whatChanged,
      whyItMatters: i.whyItMatters, recommendedAction: i.recommendedAction, confidence: i.confidence, effort: i.effort, impact: i.impact, evidenceIds: i.evidenceIds,
      status: i.status, upsellTag: agency ? i.upsellTag : null,
    })),
  };
}

export const getBriefTool = defineTool({
  name: 'get_brief',
  access: 'read',
  description: 'Get one weekly brief with its items. Client roles see approved or sent briefs only, without agency-only tags.',
  input: z.object({ briefId: z.string().uuid() }),
  output: BriefDetail,
  permission: 'read',
  channels: ['web', 'mcp', 'ask'],
  async handler(ctx, { briefId }, deps) {
    return briefDetail(deps, ctx, briefId);
  },
});

export const briefTools = [listBriefs, getBriefTool];
