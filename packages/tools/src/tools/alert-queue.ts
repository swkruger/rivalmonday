import { toolkit, ToolError } from '@cs/core';
import { alert, client, competitor, withTenant } from '@cs/db';
import { approveAlert, dismissAlert } from '@cs/engine';
import { and, asc, eq, or } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { AlertQueueRow } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();

export const listAlertQueue = defineTool({
  name: 'list_alert_queue',
  description: 'Alerts waiting for an account manager’s check, and approved alerts held for the 17:00 digest, oldest first.',
  input: z.object({}),
  output: z.object({ items: z.array(AlertQueueRow) }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx
        .select({ a: alert, clientName: client.name, competitorName: competitor.name })
        .from(alert)
        .innerJoin(client, eq(client.id, alert.clientId))
        .leftJoin(competitor, eq(competitor.id, alert.competitorId))
        .where(or(eq(alert.status, 'pending_review'), and(eq(alert.status, 'approved'), eq(alert.delivery, 'digest'))))
        .orderBy(asc(alert.createdAt))
        .limit(200));
    return {
      items: rows.map(({ a, clientName, competitorName }) => ({
        id: a.id, clientId: a.clientId, clientName, competitorName: competitorName ?? 'Competitor', headline: a.headline, body: a.body, score: a.score, status: a.status,
        heldForDigest: a.status === 'approved', written: a.written, evidenceCount: a.evidenceIds.length, createdAt: a.createdAt.toISOString(),
      })),
    };
  },
});

export const approveAlertTool = defineTool({
  name: 'approve_alert',
  description: 'Approve an alert waiting for review: it goes to the client now, or into the 17:00 digest if today’s limit is reached.',
  input: z.object({ alertId: uuid }),
  output: z.object({ outcome: z.enum(['immediate', 'digest', 'withdrawn']) }),
  permission: 'agency',
  async handler(ctx, { alertId }, deps) {
    if (!deps.delivery) throw new ToolError('invalid_input', 'Sending is not configured on this server (APP_URL and LINK_SIGNING_SECRET)');
    return { outcome: await approveAlert({ service: deps.service, app: deps.app, delivery: deps.delivery }, ctx, alertId) };
  },
});

export const dismissAlertTool = defineTool({
  name: 'dismiss_alert',
  description: 'Dismiss an alert waiting for review or for the digest. A reason is required.',
  input: z.object({ alertId: uuid, reason: z.string().max(500) }),
  output: z.object({ ok: z.literal(true) }),
  permission: 'agency',
  async handler(ctx, { alertId, reason }, deps) {
    await dismissAlert({ service: deps.service, app: deps.app }, ctx, alertId, reason);
    return { ok: true as const };
  },
});

export const alertQueueTools = [listAlertQueue, approveAlertTool, dismissAlertTool];
