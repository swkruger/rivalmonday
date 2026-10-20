import { type AccessContext, ToolError, toolkit } from '@cs/core';
import { capture, vendorCall } from '@cs/db';
import { eq, gte, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { requirePlatformOperator } from '../platform';
import { healthStatuses, platformHealthOutput } from '../platform/system-health';

/** Phase 7a1 health page: worker pulse, queue depth, vendor error rates and the freshness of the two data sources. Operators only. */
const { defineTool } = toolkit<ToolDeps>();

const HOUR_MS = 3_600_000;

export const getPlatformHealth = defineTool({
  name: 'get_platform_health',
  access: 'read',
  description: 'Platform operators: worker heartbeat, queue backlog, vendor error rates and data-source freshness.',
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

    const [queue, vendorRows, [okCall], [okCapture]] = await Promise.all([
      // An unreachable queue database is itself the finding: report the worker as down instead of failing the whole page.
      deps.queueStats().catch(() => ({ queues: [], lastHeartbeatAt: null })),
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
    ]);

    return healthStatuses(now, {
      lastHeartbeatAt: queue.lastHeartbeatAt,
      queues: queue.queues,
      vendors: vendorRows,
      lastOkVendorCallAt: okCall?.at ?? null,
      lastOkCaptureAt: okCapture?.at ?? null,
      sentryUrl: deps.sentryIssuesUrl ?? null,
    });
  },
});

export const platformHealthTools = [getPlatformHealth];
