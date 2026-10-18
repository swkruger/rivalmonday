import type { BillingGateway } from '@cs/billing';
import type { MapsPlace } from '@cs/collectors';
import { type CallScope, ToolError } from '@cs/core';
import type { Db } from '@cs/db';
import type { DeliveryConfig, PackLoader } from '@cs/engine';
import type { Catalog, VerticalDraft } from '@cs/verticals';
import type { LeadEmailDeps } from './intake/emails';

/** Jobs the web app may enqueue. The worker owns the queues (5a decision 8); `singletonKey` dedupes on `short`-policy queues. */
export type QueueJob = 'brief-pdf' | 'report-pdf' | 'rival-search' | 'discover-pages' | 'prospect-snapshot' | 'kb-embed' | 'kb-import' | 'platform-costs-snapshot' | 'setup-suggestions' | 'lead-preview' | 'rank-scan' | 'rank-map-refresh';
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
  /** Vertical packs; defaults to the DB catalogue's loader. */
  packs?: PackLoader;
  /** Vertical catalogue; absent: a per-service-connection DB catalogue (see catalog/access.ts). */
  catalog?: Catalog;
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
  /** Phase 14a: drafts a new business type from a Google profile with one AI call (web builds it; a fixture under SETUP_FAKE_LOOKUP). Absent: `draft_vertical` answers `draft: null` and the UI shows the manual form. */
  verticalDrafter?: (input: { placeId: string; nearbyCategories: string[] }, scope: CallScope) => Promise<{ draft: VerticalDraft | null; similar: { id: string; name: string }[] }>;
  /** Phase 11a: free-text Maps search for `find_business` (web builds it from DataForSEO, or a fixture under SETUP_FAKE_LOOKUP). Absent: the tool refuses with a user-facing `internal`. */
  setupLookup?: (q: { keyword: string; locationName: string }, scope: CallScope) => Promise<MapsPlace[]>;
  /** Phase 11c (plan R1): direct lead mail after commit (`decline_lead`, `assign_lead`). Null or absent: the decision still commits and the send is skipped with a log line (the leads-cleanup job retries guarded pool/agency notices). */
  leadEmail?: Omit<LeadEmailDeps, 'service'> | null;
  /** Object storage (evidence adapter, `ObjectStore` shape): `get` for `fetch` and the MCP evidence resources; `put` for agency logos (Phase 10 R9). */
  evidenceStore?: {
    get(key: string): Promise<Uint8Array | null>;
    put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  };
}

export { packsOf } from './catalog/access';

export function jobStatusOf(deps: ToolDeps): JobStatusLookup {
  if (!deps.jobStatus) throw new ToolError('internal', 'Background job status is not configured');
  return deps.jobStatus;
}

export function enqueueOf(deps: ToolDeps): EnqueueJob {
  if (!deps.enqueue) throw new ToolError('internal', 'Background jobs are not configured');
  return deps.enqueue;
}
