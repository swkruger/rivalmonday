import { type AccessContext, ToolError, toolkit } from '@cs/core';
import { capture, opsAlert, vendorCall } from '@cs/db';
import { summarizeBriefReadiness } from '@cs/engine';
import { and, desc, eq, gte, isNull, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { requirePlatformOperator } from '../platform';
import { type BriefReadiness, healthStatuses, platformHealthOutput } from '../platform/system-health';

/** Phase 7a1 health page: worker pulse, queue depth, vendor error rates and the freshness of the two data sources. Operators only. */
const { defineTool } = toolkit<ToolDeps>();

const HOUR_MS = 3_600_000;
const READINESS_ISSUES_MAX = 20;

/** 7c2: open `brief_readiness` ops alerts (service-only table), newest first. */
async function readinessIssues(deps: ToolDeps): Promise<BriefReadiness['issues']> {
  const rows = await deps.service
    .select()
    .from(opsAlert)
    .where(and(eq(opsAlert.kind, 'brief_readiness'), isNull(opsAlert.resolvedAt)))
    .orderBy(desc(opsAlert.firstSeenAt), opsAlert.dedupeKey)
    .limit(READINESS_ISSUES_MAX);
  return rows.map((r) => {
    const s = r.summary as { clients?: unknown; deliveryDate?: unknown; checkpoint?: unknown };
    return {
      checkpoint: String(s.checkpoint ?? ''),
      severity: r.severity as 'warning' | 'critical',
      deliveryDate: String(s.deliveryDate ?? ''),
      clients: Array.isArray(s.clients) ? s.clients.length : 0,
      firstSeenAt: r.firstSeenAt.toISOString(),
      emailedAt: r.emailedAt ? r.emailedAt.toISOString() : null,
    };
  });
}

export const getPlatformHealth = defineTool({
  name: 'get_platform_health',
  access: 'read',
  description: 'Platform operators: worker heartbeat, queue backlog, vendor error rates, data-source freshness and brief readiness.',
  input: z.object({}),
  output: platformHealthOutput,
  permission: 'agency',
  supportHidden: true,
  async handler(ctx: AccessContext, _input, deps) {
    await requirePlatformOperator(deps, ctx);
    if (!deps.queueStats) throw new ToolError('internal', 'Queue status is not configured');
    const now = new Date();
    const since48 = new Date(now.getTime() - 48 * HOUR_MS);
    const since24 = new Date(now.getTime() - 24 * HOUR_MS);

    let queueError = false;
    const [queue, vendorRows, [okCall], [okCapture], summary, issues] = await Promise.all([
      // An unreachable queue database must not fail the page: flag it and show the worker as down. The web wrapper logs and reports the cause.
      deps.queueStats().catch(() => {
        queueError = true;
        return { queues: [], lastHeartbeatAt: null };
      }),
      deps.service
        .select({
          vendor: vendorCall.vendor,
          calls24h: sql<number>`count(*) FILTER (WHERE ${vendorCall.createdAt} >= ${since24.toISOString()}::timestamptz)::int`,
          errors24h: sql<number>`count(*) FILTER (WHERE ${vendorCall.createdAt} >= ${since24.toISOString()}::timestamptz AND NOT ${vendorCall.ok})::int`,
          lastOkAt: sql<Date | null>`max(${vendorCall.createdAt}) FILTER (WHERE ${vendorCall.ok})`.mapWith((v) => (v == null ? null : new Date(v as string | Date))),
        })
        .from(vendorCall)
        .where(gte(vendorCall.createdAt, since48))
        .groupBy(vendorCall.vendor)
        .orderBy(vendorCall.vendor),
      deps.service.select({ at: max(vendorCall.createdAt) }).from(vendorCall).where(eq(vendorCall.ok, true)),
      deps.service.select({ at: max(capture.capturedAt) }).from(capture).where(eq(capture.status, 'ok')),
      summarizeBriefReadiness(deps.service, now),
      readinessIssues(deps),
    ]);

    const statuses = healthStatuses(now, {
      lastHeartbeatAt: queue.lastHeartbeatAt,
      queues: queue.queues,
      vendors: vendorRows,
      lastOkVendorCallAt: okCall?.at ?? null,
      lastOkCaptureAt: okCapture?.at ?? null,
      sentryUrl: deps.sentryIssuesUrl ?? null,
      queueError,
    });
    return { ...statuses, briefReadiness: { ...summary, issues } };
  },
});

export const platformHealthTools = [getPlatformHealth];
