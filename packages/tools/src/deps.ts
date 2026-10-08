import { ToolError } from '@cs/core';
import type { Db } from '@cs/db';
import { createPackLoader, type DeliveryConfig, type PackLoader } from '@cs/engine';

/** Jobs the web app may enqueue. The worker owns the queues (5a decision 8); `singletonKey` dedupes on `short`-policy queues. */
export type QueueJob = 'brief-pdf' | 'report-pdf' | 'suggest-competitors' | 'discover-pages' | 'prospect-snapshot';
export type EnqueueJob = (job: QueueJob, data: Record<string, string>, singletonKey: string) => Promise<void>;
/** pg-boss job states (v10). */
export type JobState = 'created' | 'retry' | 'active' | 'completed' | 'cancelled' | 'failed';
/** The newest job queued under `singletonKey`, or null when there is none (never queued, or archived). */
export type JobStatusLookup = (job: QueueJob, singletonKey: string) => Promise<{ state: JobState; createdOn: Date; completedOn: Date | null } | null>;

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
  /** Absent: tools that report background progress refuse with `internal`. */
  jobStatus?: JobStatusLookup;
  /** Decision 7: website crawling (page discovery, manual pages) only when true. */
  webMonitoring?: boolean;
  /** 5b-2 decision 2: lower-cased emails allowed to use the platform model-ops queues (PLATFORM_ADMIN_EMAILS). */
  platformAdmins?: readonly string[];
}

let bundledPacks: PackLoader | null = null;
export const packsOf = (deps: ToolDeps): PackLoader => deps.packs ?? (bundledPacks ??= createPackLoader());

export function jobStatusOf(deps: ToolDeps): JobStatusLookup {
  if (!deps.jobStatus) throw new ToolError('internal', 'Background job status is not configured');
  return deps.jobStatus;
}

export function enqueueOf(deps: ToolDeps): EnqueueJob {
  if (!deps.enqueue) throw new ToolError('internal', 'Background jobs are not configured');
  return deps.enqueue;
}
