import { changeEvent, type ChangeDetails, client, clientCompetitor, competitor, type Db, eventScore, move, moveEvent, type NumericChange } from '@cs/db';
import { and, desc, eq, gt, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import type { PackLoader } from '../tag/tag-stage';
import { type EvidenceChange, loadEventEvidence } from './evidence';

export const BRIEF_EVENT_MAX_AGE_DAYS = 30;
export const MOVE_EVIDENCE_EVENTS = 5;
const DAY_MS = 86_400_000;

export interface BriefClient {
  id: string; agencyId: string; name: string; verticalId: string; verticalName: string;
  services: string[]; serviceNames: string[]; towns: string[]; zips: string[];
  /** Names of every competitor this client tracks (the rules check sentences naming one of them). */
  competitorNames: string[];
  briefThreshold: number;
}

export interface EventCandidate {
  kind: 'event'; eventId: string; competitorId: string; competitorName: string; changeType: string; score: number; route: string;
  occurredAt: Date; confidence: number; summary: string; facts: NumericChange[]; zips: string[]; details: ChangeDetails;
  serviceId: string | null; serviceName: string | null; changes: EvidenceChange[];
}

export interface MoveCandidate {
  kind: 'move'; moveId: string; competitorId: string; competitorName: string; moveType: string; status: string; confidence: number;
  summary: string; facts: Record<string, number | string>; score: number; occurredAt: Date; events: EventCandidate[];
}

export type BriefCandidate = EventCandidate | MoveCandidate;

export const candidateEvents = (c: BriefCandidate): EventCandidate[] => (c.kind === 'event' ? [c] : c.events);
export const candidateEventIds = (c: BriefCandidate): string[] => candidateEvents(c).map((e) => e.eventId);
export const candidateEvidenceIds = (c: BriefCandidate): string[] =>
  [...new Set(candidateEvents(c).flatMap((e) => e.changes.flatMap((ch) => ch.evidenceIds)))].sort();

export async function loadBriefClient(deps: { db: Db; packs: PackLoader }, clientId: string): Promise<BriefClient> {
  const [c] = await deps.db.select().from(client).where(eq(client.id, clientId)).limit(1);
  if (!c) throw new Error(`client ${clientId} not found`);
  const pack = await deps.packs(c.verticalId);
  const names = await deps.db
    .select({ name: competitor.name })
    .from(clientCompetitor)
    .innerJoin(competitor, eq(competitor.id, clientCompetitor.competitorId))
    .where(eq(clientCompetitor.clientId, clientId));
  return {
    id: c.id, agencyId: c.agencyId, name: c.name, verticalId: c.verticalId, verticalName: pack.name,
    services: c.services, serviceNames: c.services.map((s) => pack.services.find((p) => p.id === s)?.name ?? s),
    towns: c.serviceArea?.towns ?? [], zips: c.serviceArea?.zips ?? [], competitorNames: names.map((n) => n.name).sort(),
    briefThreshold: c.scoreThresholds?.brief ?? pack.scoring.routing.brief,
  };
}

/** Event ids already in an item of this client's non-failed briefs (an event is featured once). */
function featuredBefore(clientId: string) {
  return sql`EXISTS (
    SELECT 1 FROM brief_item bi JOIN brief b ON b.id = bi.brief_id
    WHERE b.client_id = ${clientId} AND b.status <> 'failed' AND bi.event_ids ? (${changeEvent.id})::text)`;
}

export async function gatherBriefCandidates(
  deps: { db: Db; packs: PackLoader },
  c: BriefClient,
  period: { start: Date; end: Date },
): Promise<{ events: EventCandidate[]; moves: MoveCandidate[] }> {
  const pack = await deps.packs(c.verticalId);
  const serviceName = (id: string | null) => (id ? pack.services.find((s) => s.id === id)?.name ?? null : null);
  const toCandidate = (r: { e: typeof changeEvent.$inferSelect; name: string; score: number; route: string }, changes: EvidenceChange[]): EventCandidate => {
    const serviceId = r.e.services[c.verticalId] ?? null;
    return {
      kind: 'event', eventId: r.e.id, competitorId: r.e.competitorId, competitorName: r.name, changeType: r.e.changeType, score: r.score, route: r.route,
      occurredAt: r.e.occurredAt, confidence: r.e.confidence, summary: r.e.summary, facts: r.e.facts, zips: r.e.zips, details: r.e.details,
      serviceId, serviceName: serviceName(serviceId), changes,
    };
  };
  const eventRows = async (where: ReturnType<typeof and>) =>
    deps.db
      .select({ e: changeEvent, name: competitor.name, score: eventScore.score, route: eventScore.route })
      .from(eventScore)
      .innerJoin(changeEvent, eq(changeEvent.id, eventScore.eventId))
      .innerJoin(competitor, eq(competitor.id, changeEvent.competitorId))
      .where(and(eq(eventScore.clientId, c.id), isNull(changeEvent.retractedAt), ne(changeEvent.changeType, 'cosmetic'), where))
      .orderBy(desc(eventScore.score), desc(changeEvent.occurredAt), changeEvent.id);

  const rows = await eventRows(
    and(
      inArray(eventScore.route, ['brief', 'alert']),
      // Windowed on when the event was scored for this client (not created): an event scored after its brief ran
      // (late scoring, a late-linked client) is featured next week instead of never.
      gt(eventScore.scoredAt, period.start), lte(eventScore.scoredAt, period.end),
      gt(changeEvent.occurredAt, new Date(period.end.getTime() - BRIEF_EVENT_MAX_AGE_DAYS * DAY_MS)),
      sql`NOT ${featuredBefore(c.id)}`,
    ),
  );

  const openMoves = await deps.db
    .select({ m: move, name: competitor.name })
    .from(move)
    .innerJoin(competitor, eq(competitor.id, move.competitorId))
    .where(and(eq(move.clientId, c.id), isNull(move.closedAt), inArray(move.status, ['emerging', 'active']),
      or(
        and(gt(move.firstDetectedAt, period.start), lte(move.firstDetectedAt, period.end)),
        and(gt(move.lastEvidenceAt, period.start), lte(move.lastEvidenceAt, period.end)),
      )));
  const moveLinks = openMoves.length === 0 ? [] : await deps.db
    .select({ moveId: moveEvent.moveId, e: changeEvent, name: competitor.name, score: eventScore.score, route: eventScore.route })
    .from(moveEvent)
    .innerJoin(changeEvent, eq(changeEvent.id, moveEvent.eventId))
    .innerJoin(competitor, eq(competitor.id, changeEvent.competitorId))
    .innerJoin(eventScore, and(eq(eventScore.eventId, changeEvent.id), eq(eventScore.clientId, c.id)))
    .where(and(inArray(moveEvent.moveId, openMoves.map((m) => m.m.id)), isNull(changeEvent.retractedAt)))
    .orderBy(desc(changeEvent.occurredAt), changeEvent.id);

  const names = (competitorName: string) => [competitorName, c.name];
  // Evidence text is redacted per competitor; one competitor name per event, so load per competitor.
  const byCompetitor = new Map<string, { name: string; ids: string[] }>();
  for (const r of [...rows, ...moveLinks]) {
    const entry = byCompetitor.get(r.e.competitorId) ?? { name: r.name, ids: [] };
    if (!entry.ids.includes(r.e.id)) entry.ids.push(r.e.id);
    byCompetitor.set(r.e.competitorId, entry);
  }
  const evidenceByEvent = new Map<string, EvidenceChange[]>();
  for (const { name, ids } of byCompetitor.values()) for (const [k, v] of await loadEventEvidence(deps.db, ids, names(name))) evidenceByEvent.set(k, v);

  const events = rows.map((r) => toCandidate(r, evidenceByEvent.get(r.e.id) ?? []));
  const moves: MoveCandidate[] = openMoves.flatMap(({ m, name }): MoveCandidate[] => {
    const support = moveLinks.filter((l) => l.moveId === m.id).slice(0, MOVE_EVIDENCE_EVENTS).map((l) => toCandidate(l, evidenceByEvent.get(l.e.id) ?? []));
    // No evidence, no claim: a move whose supporting events were all retracted (retraction unlinks them; the nightly
    // moves run closes the move later) has only its stale summary left, which is never evidence.
    if (support.length === 0) return [];
    const best = Math.max(c.briefThreshold, ...support.map((s) => s.score));
    return [{
      kind: 'move', moveId: m.id, competitorId: m.competitorId, competitorName: name, moveType: m.moveType, status: m.status, confidence: m.confidence,
      summary: m.summary, facts: m.details.facts, score: Math.round(Math.min(100, best + 10 * m.confidence) * 10) / 10, occurredAt: m.lastEvidenceAt, events: support,
    }];
  });
  return { events, moves };
}
