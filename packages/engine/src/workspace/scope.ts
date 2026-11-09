import { changeEvent, clientCompetitor, eventScore, move } from '@cs/db';
import { and, eq, isNull, type SQL, sql } from 'drizzle-orm';

/** Decision 3 joins: event_score → event, and the event's competitor still tracked by this client. */
export const eventJoin = {
  change: eq(changeEvent.id, eventScore.eventId),
  tracked: and(eq(clientCompetitor.clientId, eventScore.clientId), eq(clientCompetitor.competitorId, changeEvent.competitorId))!,
};

/** Decision 3 condition — scored for this client and not retracted. Every workspace event reader uses it. */
export const clientEvents = (clientId: string): SQL => and(eq(eventScore.clientId, clientId), isNull(changeEvent.retractedAt))!;

/** Decision 10: live supporting events of a move (the quarterly-report rule). Moves, the profile and pressure
 * count or list a move only while this is > 0. */
export const liveEventCount = sql<number>`(SELECT count(*)::int FROM move_event me JOIN event e ON e.id = me.event_id WHERE me.move_id = ${move.id} AND e.retracted_at IS NULL)`;
