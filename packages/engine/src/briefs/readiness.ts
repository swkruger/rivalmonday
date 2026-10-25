import { agencyServiceable, brief, briefItem, client, clientWorkAllowed, clientSetup, clientCompetitor, type Db, discoveryRun, observation, rankScan, recommendation, vendorTask } from '@cs/db';
import { and, desc, eq, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { BRIEF_MAX_ATTEMPTS, BRIEF_STALE_MINUTES } from './generate';
import { startingPointClockStart } from './setup-clock';

/** Spec § Generation: a starting point waits for onboarding data at most this long after activation, then ships with what is there. */
export const STARTING_POINT_WAIT_HOURS = 48;

export interface StartingPointReadiness {
  ready: boolean;
  /** `null` = not applicable (no keywords / service area for rankings; no discovery run possible for competitors). */
  checks: { profile: boolean; reviews: boolean; rankings: boolean | null; competitors: boolean | null };
  /** Not ready, but the starting-point clock start (`activated_at`/`created_at`, or the setup clock) + 48 h has passed. */
  timedOut: boolean;
  /** An open client setup (11a) has not yet reached its competitors step (and is < 14 days old): never ready, never timed out. */
  setupHold: boolean;
}

/**
 * Spec § Generation readiness: the client's own GBP observation exists, the self review backfill finished, the first rank scan
 * finished (when the client has keywords and a service area) and the latest discovery run is done with at least one rival tracked
 * (when one ran or could run).
 */
export async function startingPointReadiness(db: Db, clientId: string, now: Date): Promise<StartingPointReadiness> {
  const [c] = await db.select().from(client).where(eq(client.id, clientId)).limit(1);
  if (!c) throw new Error(`client ${clientId} not found`);
  const [setup] = await db.select().from(clientSetup).where(eq(clientSetup.clientId, clientId)).limit(1);
  const clockStart = startingPointClockStart(c, setup ?? null, now);
  if (!clockStart) return { ready: false, timedOut: false, setupHold: true, checks: { profile: false, reviews: false, rankings: null, competitors: null } };
  const selfId = c.selfCompetitorId;

  const profile = selfId
    ? (await db.select({ id: observation.id }).from(observation).where(and(eq(observation.competitorId, selfId), eq(observation.kind, 'gbp_profile'), eq(observation.key, 'profile'))).limit(1)).length > 0
    : false;
  const reviews = selfId
    ? (await db.select({ id: vendorTask.id }).from(vendorTask).where(and(eq(vendorTask.competitorId, selfId), eq(vendorTask.kind, 'google_reviews'), eq(vendorTask.status, 'done'))).limit(1)).length > 0
    : false;

  const ranksApply = c.keywords.length > 0 && c.serviceArea !== null;
  const rankings = ranksApply
    ? (await db.select({ id: rankScan.id }).from(rankScan).where(and(eq(rankScan.clientId, clientId), eq(rankScan.status, 'done'))).limit(1)).length > 0
    : null;

  // Discovery is possible once the search profile is complete (startCompetitorSearch's own precondition); a run that already exists counts either way.
  const [run] = await db.select({ status: discoveryRun.status }).from(discoveryRun).where(eq(discoveryRun.clientId, clientId)).orderBy(desc(discoveryRun.startedAt)).limit(1);
  const discoveryPossible = c.keywords.length > 0 && c.serviceArea !== null && c.placeId !== null;
  // A failed discovery run is not applicable (nothing will complete it), so it must not hold the starting point back. A done run
  // only pre-ticks suggestions: competitors are ready once the agency tracked at least one rival (else the 48 h timeout applies).
  let competitors: boolean | null = run ? (run.status === 'failed' ? null : run.status === 'done') : discoveryPossible ? false : null;
  if (competitors === true) {
    const tracked = await db.select({ id: clientCompetitor.competitorId }).from(clientCompetitor)
      .where(and(eq(clientCompetitor.clientId, clientId), ...(selfId ? [ne(clientCompetitor.competitorId, selfId)] : []))).limit(1);
    competitors = tracked.length > 0;
  }

  const ready = profile && reviews && rankings !== false && competitors !== false;
  const timedOut = !ready && now.getTime() - clockStart.getTime() >= STARTING_POINT_WAIT_HOURS * 3_600_000;
  return { ready, checks: { profile, reviews, rankings, competitors }, timedOut, setupHold: false };
}

/**
 * Serviceable active clients (prospects get none, D10; nor do paused clients or read_only/suspended agencies, 9a/9b) with no starting point yet — or one that failed with attempts left or went stale while
 * generating — whose readiness is met or whose 48 h wait is over. One set-based query finds the candidates (no starting point / retryable / stale);
 * the per-client readiness check runs only for those.
 */
export async function listStartingPointDue(db: Db, now: Date): Promise<string[]> {
  // 9a/9b: a read_only/suspended agency or a paused client gets no starting point (generation costs model calls).
  const staleBefore = new Date(now.getTime() - BRIEF_STALE_MINUTES * 60_000);
  const candidates = await db.select({ id: client.id }).from(client)
    .leftJoin(brief, and(eq(brief.clientId, client.id), sql`${brief.kind} = 'starting_point'`))
    .where(and(
      clientWorkAllowed(client), agencyServiceable(client.agencyId),
      or(
        isNull(brief.id),
        and(eq(brief.status, 'failed'), lt(brief.attempts, BRIEF_MAX_ATTEMPTS)),
        and(eq(brief.status, 'generating'), lt(brief.updatedAt, staleBefore)),
      ),
    ))
    .orderBy(client.createdAt);
  const due: string[] = [];
  for (const c of candidates) {
    const r = await startingPointReadiness(db, c.id, now);
    if (r.ready || r.timedOut) due.push(c.id);
  }
  return due;
}

/**
 * `brief-once --starting-point --force`: delete the client's not-yet-approved starting point (ready / failed / generating) with its
 * items and any recommendations made from them, so it can be regenerated. An approved or sent one is refused (it reached, or is
 * about to reach, the client). Nothing to delete is fine.
 */
export async function resetStartingPoint(db: Db, clientId: string): Promise<{ deleted: boolean } | { refused: string }> {
  return db.transaction(async (tx) => {
    const [b] = await tx.select({ id: brief.id, status: brief.status }).from(brief)
      .where(and(eq(brief.clientId, clientId), sql`${brief.kind} = 'starting_point'`)).for('update');
    if (!b) return { deleted: false };
    if (b.status === 'approved' || b.status === 'sent') {
      return { refused: `The starting point for client ${clientId} is already ${b.status}; it cannot be regenerated.` };
    }
    const items = tx.select({ id: briefItem.id }).from(briefItem).where(eq(briefItem.briefId, b.id));
    await tx.delete(recommendation).where(inArray(recommendation.briefItemId, items));
    await tx.delete(brief).where(eq(brief.id, b.id)); // brief_item cascades
    return { deleted: true };
  });
}
