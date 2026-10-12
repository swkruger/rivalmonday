import { appLinkFor, canAccessClient, isAgencyRole, toolkit, ToolError } from '@cs/core';
import { alert, competitor, withTenant } from '@cs/db';
import { getAlert } from '@cs/engine';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { detailOf, pageOf, pageResult } from '../paging';
import type { ToolDeps } from '../registry';
import { AlertDetail, AlertSummary, pagedItems, pagedListInput, toIso } from './schemas';

const { defineTool } = toolkit<ToolDeps>();

export const listAlerts = defineTool({
  name: 'list_alerts',
  description: 'List instant alerts for a client, newest first. Client roles see delivered alerts only.',
  input: pagedListInput(100),
  output: z.object({ items: pagedItems(AlertSummary), nextCursor: z.string().nullable().optional() }),
  permission: 'read',
  channels: ['web', 'mcp'],
  async handler(ctx, input, deps, meta) {
    const { clientId } = input;
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const where = isAgencyRole(ctx.role) ? eq(alert.clientId, clientId) : and(eq(alert.clientId, clientId), eq(alert.status, 'delivered'));
    const { offset, limit } = pageOf(input, meta, 20);
    const fetched = await withTenant(deps.app, ctx, (tx) =>
      tx.select({ a: alert, competitorName: competitor.name }).from(alert).leftJoin(competitor, eq(competitor.id, alert.competitorId)).where(where)
        .orderBy(desc(alert.createdAt), desc(alert.id)).offset(offset).limit(limit + 1));
    const { rows, nextCursor } = pageResult(fetched, limit, offset);
    if (detailOf(input, meta) === 'summary') {
      return {
        items: rows.map(({ a }) => ({ id: a.id, title: a.headline, date: (a.deliveredAt ?? a.createdAt).toISOString(), evidenceIds: a.evidenceIds, url: appLinkFor(deps.appUrl, { t: 'alert', id: a.id }) })),
        nextCursor,
      };
    }
    return {
      items: rows.map(({ a, competitorName }) => ({
        id: a.id, clientId: a.clientId, competitorName: competitorName ?? 'Competitor', headline: a.headline, score: a.score, status: a.status, createdAt: a.createdAt.toISOString(), deliveredAt: toIso(a.deliveredAt),
      })),
      nextCursor,
    };
  },
});

export const getAlertTool = defineTool({
  name: 'get_alert',
  description: 'Get one alert with its text and evidence ids.',
  input: z.object({ alertId: z.string().uuid() }),
  output: AlertDetail,
  permission: 'read',
  async handler(ctx, { alertId }, deps) {
    const a = await getAlert({ app: deps.app }, ctx, alertId); // 4b: client roles see delivered only
    const [c] = await withTenant(deps.app, ctx, (tx) => tx.select({ name: competitor.name }).from(competitor).where(eq(competitor.id, a.competitorId)));
    return {
      id: a.id, clientId: a.clientId, competitorName: c?.name ?? 'Competitor', headline: a.headline, body: a.body, score: a.score, status: a.status,
      createdAt: a.createdAt.toISOString(), deliveredAt: toIso(a.deliveredAt), evidenceIds: a.evidenceIds, written: a.written,
    };
  },
});

export const alertTools = [listAlerts, getAlertTool];
