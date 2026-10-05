import { ToolError } from '@cs/core';
import type { Db } from '@cs/db';
import { createPackLoader, type DeliveryConfig, type PackLoader } from '@cs/engine';

/** Jobs the web app may enqueue. The worker owns the queues (5a decision 8); `singletonKey` dedupes on `short`-policy queues. */
export type QueueJob = 'brief-pdf' | 'report-pdf' | 'suggest-competitors' | 'discover-pages';
export type EnqueueJob = (job: QueueJob, data: Record<string, string>, singletonKey: string) => Promise<void>;

export interface ToolDeps {
  /** app_user connection: tenant reads go through withTenant + RLS. */
  app: Db;
  /** Service role: audit, global tables, and engine functions that need it. */
  service: Db;
  /** Vertical packs; defaults to the bundled YAML packs. */
  packs?: PackLoader;
  /** Null or absent when APP_URL / LINK_SIGNING_SECRET are missing — sending tools refuse with a clear message. */
  delivery?: DeliveryConfig | null;
  /** Absent: tools that start background work refuse with `internal`. */
  enqueue?: EnqueueJob;
  /** Decision 7: website crawling (page discovery, manual pages) only when true. */
  webMonitoring?: boolean;
}

let bundledPacks: PackLoader | null = null;
export const packsOf = (deps: ToolDeps): PackLoader => deps.packs ?? (bundledPacks ??= createPackLoader());

export function enqueueOf(deps: ToolDeps): EnqueueJob {
  if (!deps.enqueue) throw new ToolError('internal', 'Background jobs are not configured');
  return deps.enqueue;
}
