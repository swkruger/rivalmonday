import { brief, client, clientCompetitor, type Db, discoveryRun, observation, rankScan, vendorTask } from '@cs/db';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { BRIEF_MAX_ATTEMPTS, BRIEF_STALE_MINUTES } from './generate';

/** Spec § Generation: a starting point waits for onboarding data at most this long after activation, then ships with what is there. */
export const STARTING_POINT_WAIT_HOURS = 48;

export interface StartingPointReadiness {
  ready: boolean;
  /** `null` = not applicable (no keywords / service area for rankings; no discovery run possible for competitors). */
  checks: { profile: boolean; reviews: boolean; rankings: boolean | null; competitors: boolean | null };
  /** Not ready, but `activated_at` (else `created_at`) + 48 h has passed. */
  timedOut: boolean;
}

/**
 * Spec § Generation readiness: the client's own GBP observation exists, the self review backfill finished, the first rank scan
 * finished (when the client has keywords and a service area) and the latest discovery run is done with at least one rival tracked
 * (when one ran or could run).
 */
export async function startingPointReadiness(db: Db, clientId: string, now: Date): Promise<StartingPointReadiness> {
  const [c] = await db.select().from(client).where(eq(client.id, clientId)).limit(1);
  if (!c) throw new Error(`client ${clientId} not found`);
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
  const since = c.activatedAt ?? c.createdAt;
  const timedOut = !ready && now.getTime() - since.getTime() >= STARTING_POINT_WAIT_HOURS * 3_600_000;
  return { ready, checks: { profile, reviews, rankings, competitors }, timedOut };
}

/**
 * Active clients (prospects get none, D10) with no starting point yet — or one that failed with attempts left or went stale while
 * generating — whose readiness is met or whose 48 h wait is over. One lookup per client: fine at pilot scale.
 */
export async function listStartingPointDue(db: Db, now: Date): Promise<string[]> {
  const clients = await db.select({ id: client.id }).from(client).where(eq(client.status, 'active')).orderBy(client.createdAt);
  const due: string[] = [];
  for (const c of clients) {
    const [b] = await db
      .select({ status: brief.status, attempts: brief.attempts, updatedAt: brief.updatedAt })
      .from(brief).where(and(eq(brief.clientId, c.id), sql`${brief.kind} = 'starting_point'`)).limit(1);
    const stale = b?.status === 'generating' && now.getTime() - b.updatedAt.getTime() > BRIEF_STALE_MINUTES * 60_000;
    if (b && !(b.status === 'failed' && b.attempts < BRIEF_MAX_ATTEMPTS) && !stale) continue;
    const r = await startingPointReadiness(db, c.id, now);
    if (r.ready || r.timedOut) due.push(c.id);
  }
  return due;
}
