import { changeEvent, competitor, detectedChange, eventChange, eventScore, evidence } from '@cs/db';
import { changeTypeLabel } from '@cs/email';
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import type { ToolDeps } from '../deps';
import type { EventRow } from '../tools/schemas';

/** Select map for one event row; use with decision 3's joins (`eventJoin`) plus `competitor` on `changeEvent.competitorId`. */
export const eventRowSelect = {
  eventId: changeEvent.id, competitorId: changeEvent.competitorId, competitorName: competitor.name, changeType: changeEvent.changeType,
  channels: changeEvent.channels, services: changeEvent.services, summary: changeEvent.summary, score: eventScore.score, route: eventScore.route,
  occurredAt: changeEvent.occurredAt, scoredAt: eventScore.scoredAt,
  /** Live changes only (`detected_change.status = 'event'`), matching what `get_event` lists. */
  evidenceCount: sql<number>`(SELECT count(*)::int FROM event_change ec JOIN detected_change dc ON dc.id = ec.change_id WHERE ec.event_id = ${changeEvent.id} AND dc.status = 'event')`,
};

type Row = {
  eventId: string; competitorId: string; competitorName: string; changeType: string; channels: string[] | null; services: Record<string, string | null> | null;
  summary: string; score: number; route: string; occurredAt: Date; scoredAt: Date; evidenceCount: number;
};

export function toEventRow(r: Row, verticalId: string, serviceNames: Map<string, string>): EventRow {
  const serviceId = r.services?.[verticalId] ?? null;
  return {
    eventId: r.eventId, competitorId: r.competitorId, competitorName: r.competitorName, changeType: r.changeType, typeLabel: changeTypeLabel(r.changeType),
    channels: r.channels ?? [], summary: r.summary, score: Math.round(r.score), route: r.route as EventRow['route'],
    serviceId, serviceName: serviceId ? (serviceNames.get(serviceId) ?? null) : null,
    occurredAt: r.occurredAt.toISOString(), scoredAt: r.scoredAt.toISOString(), evidenceCount: Number(r.evidenceCount),
  };
}

/**
 * MCP summary rows: the text/screenshot evidence ids of each event's live changes (before and after captures), oldest
 * first and de-duplicated. Reads global rows with the service Db, so call it only with ids the caller already proved
 * visible (decision 3's readers).
 */
export async function eventEvidenceIds(deps: ToolDeps, eventIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>(eventIds.map((id) => [id, []]));
  if (eventIds.length === 0) return out;
  const rows = await deps.service
    .select({ eventId: eventChange.eventId, id: evidence.id })
    .from(eventChange)
    .innerJoin(detectedChange, eq(detectedChange.id, eventChange.changeId))
    .innerJoin(evidence, or(eq(evidence.captureId, detectedChange.beforeCaptureId), eq(evidence.captureId, detectedChange.afterCaptureId))!)
    .where(and(inArray(eventChange.eventId, eventIds), eq(detectedChange.status, 'event'), inArray(evidence.kind, ['text', 'screenshot'])))
    .orderBy(asc(detectedChange.detectedAt), asc(evidence.kind), asc(evidence.id));
  for (const r of rows) {
    const list = out.get(r.eventId)!;
    if (!list.includes(r.id)) list.push(r.id);
  }
  return out;
}
