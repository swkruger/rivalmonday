import { client, clientSetup, competitorSuggestion, discoveryRun, type Tx } from '@cs/db';
import { and, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { latestDoneRun } from '../rival-search';

/** Phase 11a §4. The service Db or a tenant/service tx both fit. */
type Db = Pick<Tx, 'select' | 'update'>;

export type StepStatus = 'todo' | 'running' | 'done' | 'skipped' | 'blocked';
export type SetupState = {
  /** A setup row exists, and neither completed nor dismissed. */
  open: boolean;
  /** False for clients without a row (old clients, tests): treated as fully set up. */
  exists: boolean;
  steps: { profile: StepStatus; search: StepStatus; competitors: StepStatus };
  /** The failed discovery run's reason, if the search is blocked. */
  searchRefusal: string | null;
  waitingOn: 'agency' | 'client' | 'system' | null;
  /** `suggested` rows of the latest done run (or newer runs) are waiting to be picked. */
  pendingSuggestions: boolean;
  completedAt: Date | null;
  dismissedAt: Date | null;
};

export type SetupStateInput = {
  client: { keywords: string[]; serviceArea: unknown | null; placeId: string | null; status: string };
  setup: { skipped: string[]; competitorsDoneAt: Date | null; completedAt: Date | null; dismissedAt: Date | null } | null;
  latestRun: { status: string; error?: string | null } | null;
  hasPendingSuggestions: boolean;
};

const RUNNING = new Set(['queued', 'searching', 'checking', 'finalising']);

/** Pure (spec §4). A client with no setup row reads as complete: closed, every step done. */
export function deriveSetupState({ client: c, setup, latestRun, hasPendingSuggestions }: SetupStateInput): SetupState {
  if (!setup) {
    return { open: false, exists: false, steps: { profile: 'done', search: 'done', competitors: 'done' }, searchRefusal: null, waitingOn: null, pendingSuggestions: false, completedAt: null, dismissedAt: null };
  }
  // The `startFirstAutoSearch` rule.
  const profile: StepStatus = c.keywords.length > 0 && c.serviceArea != null && !!c.placeId ? 'done' : 'todo';

  let search: StepStatus;
  let searchRefusal: string | null = null;
  if (setup.skipped.includes('search')) search = 'skipped';
  else if (!latestRun) search = 'todo'; // refusals of the auto start aren't stored (R1): the wizard offers "Find competitors"
  else if (RUNNING.has(latestRun.status)) search = 'running';
  else if (latestRun.status === 'done') search = 'done';
  else {
    search = 'blocked';
    searchRefusal = latestRun.error ?? null;
  }

  const competitors: StepStatus = setup.skipped.includes('competitors') ? 'skipped' : setup.competitorsDoneAt ? 'done' : 'todo';

  const open = setup.completedAt == null && setup.dismissedAt == null;
  let waitingOn: SetupState['waitingOn'] = null;
  if (open) {
    if (profile === 'todo') waitingOn = 'agency';
    else if (search === 'running') waitingOn = 'system';
    else if (search === 'todo' || search === 'blocked') waitingOn = 'agency';
    // Picking (or "Done picking" on zero rivals) is the agency's move, open suggestions or not, so idle reminders fire.
    else if (competitors === 'todo') waitingOn = 'agency';
  }
  return { open, exists: true, steps: { profile, search, competitors }, searchRefusal, waitingOn, pendingSuggestions: hasPendingSuggestions, completedAt: setup.completedAt, dismissedAt: setup.dismissedAt };
}

/** Loads the client, its setup row, latest discovery run and open suggestions, then derives. */
export async function getSetupState(db: Db, clientId: string): Promise<SetupState> {
  const [[c], [setup], [latestRun]] = await Promise.all([
    db.select({ keywords: client.keywords, serviceArea: client.serviceArea, placeId: client.placeId, status: client.status }).from(client).where(eq(client.id, clientId)),
    db.select().from(clientSetup).where(eq(clientSetup.clientId, clientId)),
    db.select({ status: discoveryRun.status, error: discoveryRun.error }).from(discoveryRun).where(eq(discoveryRun.clientId, clientId)).orderBy(desc(discoveryRun.startedAt)).limit(1),
  ]);
  if (!c || !setup) return deriveSetupState({ client: c ?? { keywords: [], serviceArea: null, placeId: null, status: 'active' }, setup: null, latestRun: null, hasPendingSuggestions: false });
  return deriveSetupState({ client: c, setup, latestRun: latestRun ?? null, hasPendingSuggestions: await hasPending(db, clientId) });
}

/** Same notion as `list_competitor_suggestions`: `suggested` rows of the latest done run and of runs started after it. */
async function hasPending(db: Db, clientId: string): Promise<boolean> {
  const run = await latestDoneRun(db, clientId);
  if (!run) return false;
  const newer = (await db.select({ id: discoveryRun.id }).from(discoveryRun).where(and(eq(discoveryRun.clientId, clientId), gt(discoveryRun.startedAt, run.startedAt)))).map((x) => x.id);
  const [row] = await db.select({ id: competitorSuggestion.id }).from(competitorSuggestion)
    .where(and(eq(competitorSuggestion.clientId, clientId), inArray(competitorSuggestion.runId, [run.id, ...newer]), eq(competitorSuggestion.status, 'suggested')))
    .limit(1);
  return !!row;
}

/**
 * Sets `completed_at` once profile, search and competitors are each done or skipped. Guarded UPDATE: never overwrites
 * or clears an existing `completed_at`, and never completes a dismissed row (its starting-point clock must not move to
 * activation, spec §9). Pass a service-role tx (`app_user` can't write). Returns true if it just closed.
 */
export async function completeIfDone(tx: Db, clientId: string, now: Date): Promise<boolean> {
  const s = await getSetupState(tx, clientId);
  if (!s.exists || s.completedAt) return false;
  if (!Object.values(s.steps).every((v) => v === 'done' || v === 'skipped')) return false;
  const done = await tx.update(clientSetup).set({ completedAt: now }).where(and(eq(clientSetup.clientId, clientId), isNull(clientSetup.completedAt), isNull(clientSetup.dismissedAt))).returning({ id: clientSetup.clientId });
  return done.length > 0;
}
