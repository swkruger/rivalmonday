import { agencyServiceable, changeEvent, client, clientWorkAllowed, type Db, eventScore, type ScoreFactors } from '@cs/db';
import { and, asc, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import type { VerticalPack } from '@cs/verticals';
import type { EffectiveRunbook } from '../runbook/state';
import { loadClientRunbook } from '../runbook/store';
import type { PackLoader } from '../tag/tag-stage';
import { type Route, scoreForClient } from './score';
import { scoreInputFor } from './score-stage';

const DAY = 86_400_000;

export interface RescoreOptions { sinceDays: number; clientId?: string; dryRun: boolean; now?: Date }
export interface RescoreResult {
  considered: number; rescored: number; capped: number;
  skipped: { featured: number; alerted: number; current: number };
  transitions: Record<string, number>; // "archive->brief": n, …
}

/**
 * brief-signal D3/P4: re-scores recent, un-featured, un-alerted event × client pairs in place with the current pack.
 * Keeps the stored maxSimilarity and the age at first scoring; thresholds and pack are current. Never writes route
 * `alert` (stored `brief` + `rescoreCap`), never touches a featured or alerted pair, and is idempotent: the UPDATE is
 * guarded on the old scoringVersion, so a second (or concurrent) run changes nothing. `scored_at` moves to `now` only
 * on archive → brief (the event enters the next brief period).
 */
export async function rescoreRecent(
  deps: { db: Db; packs: PackLoader; generic: () => Promise<VerticalPack> },
  opts: RescoreOptions,
): Promise<RescoreResult> {
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - opts.sinceDays * DAY);
  const out: RescoreResult = { considered: 0, rescored: 0, capped: 0, skipped: { featured: 0, alerted: 0, current: 0 }, transitions: {} };

  // Same predicate as the brief gather's `featuredBefore`: the event is in an item of one of the client's non-failed briefs.
  const featured = sql<boolean>`EXISTS (
    SELECT 1 FROM brief_item bi JOIN brief b ON b.id = bi.brief_id
    WHERE b.client_id = ${eventScore.clientId} AND b.status <> 'failed' AND bi.event_ids ? (${eventScore.eventId})::text)`;
  const alerted = sql<boolean>`(${eventScore.route} = 'alert' OR EXISTS (
    SELECT 1 FROM alert_event ae WHERE ae.client_id = ${eventScore.clientId} AND ae.event_id = ${eventScore.eventId}))`;

  const rows = await deps.db
    .select({ s: eventScore, e: changeEvent, verticalId: client.verticalId, services: client.services, serviceArea: client.serviceArea, featured, alerted })
    .from(eventScore)
    .innerJoin(changeEvent, eq(changeEvent.id, eventScore.eventId))
    .innerJoin(client, eq(client.id, eventScore.clientId))
    .where(and(
      gt(eventScore.scoredAt, since),
      isNull(changeEvent.retractedAt),
      ne(changeEvent.changeType, 'tier_change'), // P10: deterministic score, nothing to re-score
      clientWorkAllowed(client), // active, not paused, archived or spend-paused
      agencyServiceable(client.agencyId),
      opts.clientId ? eq(eventScore.clientId, opts.clientId) : undefined,
    ))
    .orderBy(asc(eventScore.scoredAt), asc(eventScore.eventId), asc(eventScore.clientId));

  const runbooks = new Map<string, Promise<EffectiveRunbook>>();
  for (const { s, e, verticalId, services, serviceArea, featured: isFeatured, alerted: isAlerted } of rows) {
    out.considered++;
    if (isFeatured) { out.skipped.featured++; continue; }
    if (isAlerted) { out.skipped.alerted++; continue; }
    const pack = await deps.packs(verticalId);
    const old: ScoreFactors = s.factors;
    const oldVersion = old.scoringVersion ?? 0;
    if (oldVersion >= pack.scoring.version) { out.skipped.current++; continue; }

    if (!runbooks.has(s.clientId)) runbooks.set(s.clientId, loadClientRunbook(deps, s.clientId));
    const runbook = await runbooks.get(s.clientId)!;
    const ageDays = Math.max(0, (s.scoredAt.getTime() - e.occurredAt.getTime()) / DAY);
    const next = scoreForClient(
      scoreInputFor(e, verticalId, old.maxSimilarity ?? null, ageDays),
      { services, zips: serviceArea?.zips ?? [], thresholds: runbook.thresholds },
      pack,
    );
    const capped = next.route === 'alert';
    const route: Route = capped ? 'brief' : next.route;
    const factors: ScoreFactors = {
      ...next.factors,
      ...(capped ? { rescoreCap: true } : {}),
      rescored: { at: now.toISOString(), score: s.score, route: s.route as Route, scoringVersion: oldVersion },
    };

    if (!opts.dryRun) {
      const updated = await deps.db
        .update(eventScore)
        .set({ score: next.score, route, factors, packVersion: pack.version, ...(s.route === 'archive' && route === 'brief' ? { scoredAt: now } : {}) })
        .where(and(
          eq(eventScore.clientId, s.clientId), eq(eventScore.eventId, s.eventId), ne(eventScore.route, 'alert'),
          sql`COALESCE((${eventScore.factors}->>'scoringVersion')::int, 0) = ${oldVersion}::int`,
        ))
        .returning({ eventId: eventScore.eventId });
      if (updated.length === 0) continue; // a concurrent run got there first
    }
    out.rescored++;
    if (capped) out.capped++;
    const key = `${s.route}->${route}`;
    out.transitions[key] = (out.transitions[key] ?? 0) + 1;
  }
  return out;
}
