import { toolkit, ToolError } from '@cs/core';
import { alert, client, competitor, type Tx, withTenant } from '@cs/db';
import { approveAlert, dismissAlert } from '@cs/engine';
import { and, asc, count, eq, or } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { requireVisibleClient } from '../workspace/scope';
import { AlertQueueClient, AlertQueueRow } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();

/** The alert rows `list_alert_queue` shows: waiting for the AM's check, or approved and held for the 17:00 digest. */
export const alertQueueWhere = () => or(eq(alert.status, 'pending_review'), and(eq(alert.status, 'approved'), eq(alert.delivery, 'digest')));

/** The Alert review badge: queue rows still waiting for a check (digest-held ones need nothing), under the caller's RLS scope. */
export async function countAlertsAwaitingReview(tx: Tx): Promise<number> {
  const [row] = await tx.select({ n: count() }).from(alert).innerJoin(client, eq(client.id, alert.clientId)).where(and(alertQueueWhere(), eq(alert.status, 'pending_review')));
  return row?.n ?? 0;
}

/** The most queue rows `list_alert_queue` returns; one more is fetched to tell whether the list was cut. */
export const ALERT_QUEUE_CAP = 200;

export const listAlertQueue = defineTool({
  name: 'list_alert_queue',
  access: 'read',
  description: 'Alerts waiting for an account manager’s check, and approved alerts held for the 17:00 digest, oldest first (at most 200; `capped` says more exist). Optional clientId narrows to one client; `clients` lists every client with queue rows and its count.',
  input: z.object({ clientId: uuid.optional() }),
  output: z.object({ items: z.array(AlertQueueRow), capped: z.boolean(), clients: z.array(AlertQueueClient) }),
  permission: 'agency',
  async handler(ctx, { clientId }, deps) {
    if (clientId) await requireVisibleClient(deps, ctx, clientId);
    const { rows, clients } = await withTenant(deps.app, ctx, async (tx) => {
      const rows = await tx
        .select({ a: alert, clientName: client.name, competitorName: competitor.name })
        .from(alert)
        .innerJoin(client, eq(client.id, alert.clientId))
        .leftJoin(competitor, eq(competitor.id, alert.competitorId))
        .where(clientId ? and(alertQueueWhere(), eq(alert.clientId, clientId)) : alertQueueWhere())
        .orderBy(asc(alert.createdAt))
        .limit(ALERT_QUEUE_CAP + 1);
      const clients = await tx
        .select({ id: client.id, name: client.name, count: count() })
        .from(alert)
        .innerJoin(client, eq(client.id, alert.clientId))
        .where(alertQueueWhere())
        .groupBy(client.id, client.name)
        .orderBy(asc(client.name));
      return { rows, clients };
    });
    return {
      items: rows.slice(0, ALERT_QUEUE_CAP).map(({ a, clientName, competitorName }) => ({
        id: a.id, clientId: a.clientId, clientName, competitorName: competitorName ?? 'Competitor', headline: a.headline, body: a.body, score: a.score, status: a.status,
        heldForDigest: a.status === 'approved', written: a.written, evidenceCount: a.evidenceIds.length, createdAt: a.createdAt.toISOString(),
      })),
      capped: rows.length > ALERT_QUEUE_CAP,
      clients,
    };
  },
});

export const approveAlertTool = defineTool({
  name: 'approve_alert',
  access: 'write',
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
  access: 'write',
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
