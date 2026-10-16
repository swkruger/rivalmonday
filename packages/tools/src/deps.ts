import type { BillingGateway } from '@cs/billing';
import { type CallScope, ToolError } from '@cs/core';
import type { Db } from '@cs/db';
import { createPackLoader, type DeliveryConfig, type PackLoader } from '@cs/engine';

/** Jobs the web app may enqueue. The worker owns the queues (5a decision 8); `singletonKey` dedupes on `short`-policy queues. */
export type QueueJob = 'brief-pdf' | 'report-pdf' | 'rival-search' | 'discover-pages' | 'prospect-snapshot' | 'kb-embed' | 'kb-import' | 'platform-costs-snapshot';
export type EnqueueJob = (job: QueueJob, data: Record<string, string>, singletonKey: string) => Promise<void>;
/** pg-boss job states (v10). */
export type JobState = 'created' | 'retry' | 'active' | 'completed' | 'cancelled' | 'failed';
/** The newest job queued under `singletonKey`, or null when there is none (never queued, or archived). */
export type JobStatusLookup = (job: QueueJob, singletonKey: string) => Promise<{ state: JobState; createdOn: Date; completedOn: Date | null; output: unknown } | null>;

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
  /** Phase 6c: KB_IMPORT_ENABLED. Off or absent: the URL-import tools refuse with `not_found`. */
  kbImportEnabled?: boolean;
  /** 5b-2 decision 2: lower-cased emails allowed to use the platform model-ops queues (PLATFORM_ADMIN_EMAILS). */
  platformAdmins?: readonly string[];
  /** P11: public app origin; makes MCP row `url`s absolute (absent: root-relative paths). */
  appUrl?: string;
  /** P16: query embedding for `search` (dev environment with an OpenRouter key only); absent: full-text search only. */
  embedQuery?: (text: string, scope: CallScope) => Promise<number[]>;
  /** Phase 9a: billing gateway (`gatewayFor`): fake in DEMO/TEST, Stripe with a key, absent when billing is not configured (R27: Stripe-backed tools refuse, reads degrade, seat sync is skipped and the daily job reconciles). */
  billing?: BillingGateway;
  /** Object storage (evidence adapter, `ObjectStore` shape): `get` for `fetch` and the MCP evidence resources; `put` for agency logos (Phase 10 R9). */
  evidenceStore?: {
    get(key: string): Promise<Uint8Array | null>;
    put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  };
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
