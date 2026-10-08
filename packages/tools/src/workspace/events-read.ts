import { changeEvent, competitor, eventScore } from '@cs/db';
import { changeTypeLabel } from '@cs/email';
import { sql } from 'drizzle-orm';
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
