import { canAccessClient, toolkit, ToolError } from '@cs/core';
import { brief, briefItem, client, withTenant } from '@cs/db';
import { approveBrief, dropBriefItem, editBriefItem, isUntouched, rateBriefItem, reorderBriefItems, sendBriefNow, updateClientDelivery } from '@cs/engine';
import { asc, eq, gte, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { enqueueOf, packsOf, type ToolDeps } from '../deps';
import { briefDetail } from './briefs';
import { BriefQueueRow, BriefReview } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const text = z.string().max(2000);
const ok = z.object({ ok: z.literal(true) });
const reviewDeps = (deps: ToolDeps) => ({ service: deps.service, app: deps.app, packs: packsOf(deps) });

export const listBriefQueue = defineTool({
  name: 'list_brief_queue',
  description: 'This week’s brief per client (plus any older brief still waiting), ready-for-review first.',
  input: z.object({}),
  output: z.object({ items: z.array(BriefQueueRow) }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const rows = await withTenant(deps.app, ctx, async (tx) => {
      const briefs = await tx
        .select({ b: brief, clientName: client.name, autoSend: client.briefAutoSend })
        .from(brief).innerJoin(client, eq(client.id, brief.clientId))
        .where(or(gte(brief.deliveryDate, since), eq(brief.status, 'ready')))
        .orderBy(asc(client.name), asc(brief.deliveryDate));
      const ids = briefs.map((r) => r.b.id);
      const items = ids.length ? await tx.select({ briefId: briefItem.briefId, status: briefItem.status }).from(briefItem).where(inArray(briefItem.briefId, ids)) : [];
      return { briefs, items };
    });
    // Decision 12: newest brief per client, plus older ones still `ready`.
    const newest = new Map<string, string>();
    for (const r of rows.briefs) newest.set(r.b.clientId, r.b.id);
    const keep = rows.briefs.filter((r) => newest.get(r.b.clientId) === r.b.id || r.b.status === 'ready');
    const out = [];
    for (const r of keep) {
      const its = rows.items.filter((i) => i.briefId === r.b.id);
      out.push({
        briefId: r.b.id, clientId: r.b.clientId, clientName: r.clientName, deliveryDate: r.b.deliveryDate, status: r.b.status, kind: r.b.kind,
        activeItems: its.filter((i) => i.status === 'active').length, droppedItems: its.filter((i) => i.status === 'dropped').length,
        touched: !(await isUntouched(deps.service, r.b.id)), autoSend: r.autoSend,
      });
    }
    out.sort((a, b) => Number(b.status === 'ready') - Number(a.status === 'ready') || a.clientName.localeCompare(b.clientName));
    return { items: out };
  },
});

export const getBriefReview = defineTool({
  name: 'get_brief_review',
  description: 'A brief as the agency reviews it: every item including dropped ones, fact-check counts and auto-send.',
  input: z.object({ briefId: uuid }),
  output: BriefReview,
  permission: 'agency',
  async handler(ctx, { briefId }, deps) {
    const detail = await briefDetail(deps, ctx, briefId);
    const [row] = await withTenant(deps.app, ctx, (tx) =>
      tx.select({ dropped: brief.dropped, clientName: client.name, autoSend: client.briefAutoSend }).from(brief).innerJoin(client, eq(client.id, brief.clientId)).where(eq(brief.id, briefId)));
    if (!row) throw new ToolError('not_found', 'Brief not found');
    return { ...detail, clientName: row.clientName, autoSend: row.autoSend, touched: !(await isUntouched(deps.service, briefId)), factCheck: row.dropped };
  },
});

export const editBriefItemTool = defineTool({
  name: 'edit_brief_item',
  description: 'Edit an item of a brief that is ready for review. Returns non-blocking fact-check warnings.',
  input: z.object({ itemId: uuid, headline: text.optional(), whatChanged: text.optional(), whyItMatters: text.optional(), recommendedAction: text.optional() }),
  output: z.object({ warnings: z.array(z.string()) }),
  permission: 'agency',
  async handler(ctx, { itemId, ...patch }, deps) {
    return editBriefItem(reviewDeps(deps), ctx, itemId, patch);
  },
});

export const dropBriefItemTool = defineTool({
  name: 'drop_brief_item',
  description: 'Remove an item from a brief that is ready for review.',
  input: z.object({ itemId: uuid, reason: z.string().max(500).optional() }),
  output: ok,
  permission: 'agency',
  async handler(ctx, { itemId, reason }, deps) {
    await dropBriefItem(reviewDeps(deps), ctx, itemId, reason?.trim() || undefined);
    return { ok: true as const };
  },
});

export const reorderBriefItemsTool = defineTool({
  name: 'reorder_brief_items',
  description: 'Set the order of a ready brief’s active items (all of them, first to last).',
  input: z.object({ briefId: uuid, itemIds: z.array(uuid).min(1).max(20) }),
  output: ok,
  permission: 'agency',
  async handler(ctx, { briefId, itemIds }, deps) {
    await reorderBriefItems(reviewDeps(deps), ctx, briefId, itemIds);
    return { ok: true as const };
  },
});

export const rateBriefItemTool = defineTool({
  name: 'rate_brief_item',
  description: 'Rate whether a brief item is useful (feeds the pilot’s usefulness metric).',
  input: z.object({ itemId: uuid, useful: z.boolean(), reason: z.string().max(500).optional() }),
  output: ok,
  permission: 'agency',
  async handler(ctx, { itemId, useful, reason }, deps) {
    await rateBriefItem(reviewDeps(deps), ctx, itemId, useful, reason?.trim() || undefined);
    return { ok: true as const };
  },
});

export const approveBriefTool = defineTool({
  name: 'approve_brief',
  description: 'Approve a ready brief for Monday delivery; its items become recommendations.',
  input: z.object({ briefId: uuid }),
  output: z.object({ recommendations: z.number().int() }),
  permission: 'agency',
  async handler(ctx, { briefId }, deps) {
    return approveBrief(reviewDeps(deps), ctx, briefId);
  },
});

export const sendBriefNowTool = defineTool({
  name: 'send_brief_now',
  description: 'Approve (if needed) and send a brief to the client now, then render its PDF.',
  input: z.object({ briefId: uuid }),
  output: z.object({ notifications: z.number().int(), pdf: z.enum(['queued', 'later']) }),
  permission: 'agency',
  async handler(ctx, { briefId }, deps) {
    if (!deps.delivery) throw new ToolError('invalid_input', 'Sending is not configured on this server (APP_URL and LINK_SIGNING_SECRET)');
    const { notifications } = await sendBriefNow({ service: deps.service, app: deps.app, delivery: deps.delivery }, ctx, briefId);
    try {
      await enqueueOf(deps)('brief-pdf', { briefId }, briefId); // same singletonKey as /files/brief (5a)
      return { notifications, pdf: 'queued' as const };
    } catch (e) {
      // The worker's missing-PDF catch-up renders it within the hour (4b I3), so a failed enqueue never fails the send.
      console.warn('[send_brief_now] brief-pdf enqueue failed', briefId, e);
      return { notifications, pdf: 'later' as const };
    }
  },
});

export const setBriefAutoSend = defineTool({
  name: 'set_brief_auto_send',
  description: 'Send this client’s untouched briefs automatically on Monday 07:00 local time.',
  input: z.object({ clientId: uuid, enabled: z.boolean() }),
  output: ok,
  permission: 'agency',
  async handler(ctx, { clientId, enabled }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    await updateClientDelivery({ service: deps.service, app: deps.app }, ctx, clientId, { briefAutoSend: enabled });
    return { ok: true as const };
  },
});

export const reviewTools = [listBriefQueue, getBriefReview, editBriefItemTool, dropBriefItemTool, reorderBriefItemsTool, rateBriefItemTool, approveBriefTool, sendBriefNowTool, setBriefAutoSend];
