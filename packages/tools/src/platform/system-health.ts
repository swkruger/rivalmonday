import { z } from 'zod';
import type { QueueStat } from '../deps';

const Status = z.enum(['ok', 'warn', 'down']);
export type HealthStatus = z.infer<typeof Status>;

const count = z.number().int().nonnegative();

/** 7c2: live counts for the current brief cycle plus the open `brief_readiness` ops alerts (newest first, at most 20). */
export const briefReadinessOutput = z.object({
  checkedAt: z.string(),
  deliveryDate: z.string(),
  due: count, ready: count, approved: count, sent: count, missing: count, failed: count, awaitingApproval: count, startingPointsLate: count,
  issues: z.array(z.object({
    checkpoint: z.string(),
    severity: z.enum(['warning', 'critical']),
    deliveryDate: z.string(),
    /** How many clients the alert lists. */
    clients: count,
    firstSeenAt: z.string(),
    emailedAt: z.string().nullable(),
  })),
});
export type BriefReadiness = z.infer<typeof briefReadinessOutput>;

export const platformHealthOutput = z.object({
  generatedAt: z.string(),
  worker: z.object({ lastHeartbeatAt: z.string().nullable(), status: Status }),
  queues: z.array(z.object({ name: z.string(), queued: z.number(), active: z.number(), failed24h: z.number(), oldestQueuedAgeS: z.number().nullable(), status: Status })),
  vendors: z.array(z.object({ vendor: z.string(), calls24h: z.number(), errors24h: z.number(), lastOkAt: z.string().nullable(), status: Status })),
  sources: z.array(z.object({ kind: z.enum(['vendor_call', 'capture']), lastOkAt: z.string().nullable(), status: Status })),
  sentryUrl: z.string().nullable(),
  /** True when the queue database could not be read (worker then shows down, queues empty). */
  queueError: z.boolean(),
  briefReadiness: briefReadinessOutput,
});
export type PlatformHealth = z.infer<typeof platformHealthOutput>;

export interface RawHealth {
  lastHeartbeatAt: Date | null;
  queues: QueueStat[];
  /** One row per vendor with a call in the last 48 h; `lastOkAt` is the newest ok call in that window. */
  vendors: { vendor: string; calls24h: number; errors24h: number; lastOkAt: Date | null }[];
  lastOkVendorCallAt: Date | null;
  lastOkCaptureAt: Date | null;
  sentryUrl: string | null;
  queueError?: boolean;
}

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;

/** Parked §3.4 thresholds + plan decision 7. Pure: all clock reads come from `now`. */
export function healthStatuses(now: Date, raw: RawHealth): Omit<PlatformHealth, 'briefReadiness'> {
  const age = (d: Date) => now.getTime() - d.getTime();
  const iso = (d: Date | null) => (d ? d.toISOString() : null);

  const workerStatus: HealthStatus = raw.lastHeartbeatAt === null || age(raw.lastHeartbeatAt) > 30 * MIN_MS ? 'down' : age(raw.lastHeartbeatAt) > 11 * MIN_MS ? 'warn' : 'ok';

  const queues = raw.queues.map((q) => {
    const oldestMs = q.oldestQueuedAt ? age(q.oldestQueuedAt) : null;
    const status: HealthStatus = oldestMs !== null && oldestMs > 2 * HOUR_MS ? 'down' : (oldestMs !== null && oldestMs > 30 * MIN_MS) || q.failed24h > 0 ? 'warn' : 'ok';
    return { name: q.name, queued: q.queued, active: q.active, failed24h: q.failed24h, oldestQueuedAgeS: oldestMs === null ? null : Math.max(0, Math.round(oldestMs / 1000)), status };
  });

  const vendors = raw.vendors.map((v) => {
    const errorRate = v.calls24h > 0 ? v.errors24h / v.calls24h : 0;
    const status: HealthStatus = errorRate >= 0.5 || (v.calls24h > 0 && v.lastOkAt === null) ? 'down' : errorRate >= 0.2 ? 'warn' : 'ok';
    return { vendor: v.vendor, calls24h: v.calls24h, errors24h: v.errors24h, lastOkAt: iso(v.lastOkAt), status };
  });

  const source = (kind: 'vendor_call' | 'capture', at: Date | null) => ({
    kind,
    lastOkAt: iso(at),
    status: (at === null || age(at) > 72 * HOUR_MS ? 'down' : age(at) > 26 * HOUR_MS ? 'warn' : 'ok') as HealthStatus,
  });

  return {
    generatedAt: now.toISOString(),
    worker: { lastHeartbeatAt: iso(raw.lastHeartbeatAt), status: workerStatus },
    queues,
    vendors,
    sources: [source('vendor_call', raw.lastOkVendorCallAt), source('capture', raw.lastOkCaptureAt)],
    sentryUrl: raw.sentryUrl,
    queueError: raw.queueError ?? false,
  };
}
