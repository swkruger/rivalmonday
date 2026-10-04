import { canAccessClient, isAgencyRole, toolkit, ToolError } from '@cs/core';
import { alert, competitor, withTenant } from '@cs/db';
import { getAlert } from '@cs/engine';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../registry';
import { AlertDetail, AlertSummary, listInput, toIso } from './schemas';

const { defineTool } = toolkit<ToolDeps>();

export const listAlerts = defineTool({
  name: 'list_alerts',
  description: 'List instant alerts for a client, newest first. Client roles see delivered alerts only.',
  input: listInput(100),
  output: z.object({ items: z.array(AlertSummary) }),
  permission: 'read',
  async handler(ctx, { clientId, limit }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const where = isAgencyRole(ctx.role) ? eq(alert.clientId, clientId) : and(eq(alert.clientId, clientId), eq(alert.status, 'delivered'));
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx.select({ a: alert, competitorName: competitor.name }).from(alert).innerJoin(competitor, eq(competitor.id, alert.competitorId)).where(where).orderBy(desc(alert.createdAt)).limit(limit));
    return {
      items: rows.map(({ a, competitorName }) => ({
        id: a.id, clientId: a.clientId, competitorName, headline: a.headline, score: a.score, status: a.status, createdAt: a.createdAt.toISOString(), deliveredAt: toIso(a.deliveredAt),
      })),
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
