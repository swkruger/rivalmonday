import { type AccessContext, canAccessClient, ToolError } from '@cs/core';
import { changeEvent, client, clientCompetitor, eventScore, move, withTenant } from '@cs/db';
import { and, desc, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import type { ToolDeps } from '../deps';

export interface WorkspaceClient {
  id: string;
  name: string;
  verticalId: string;
  services: string[];
  zips: number;
  selfCompetitorId: string | null;
  /** 5c-2: the client's own Google place id (the self business falls back to it for rank matching). */
  placeId: string | null;
  /** 5c-2: rank-scan keywords. */
  keywords: string[];
  /** 5c-2: service-area radius; null when no service area is set. */
  radiusKm: number | null;
}

/** The client row through RLS — `not_found` for anything out of scope (spec §11). */
export async function workspaceClient(deps: ToolDeps, ctx: AccessContext, clientId: string): Promise<WorkspaceClient> {
  if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
  const [c] = await withTenant(deps.app, ctx, (tx) =>
    tx.select({ id: client.id, name: client.name, verticalId: client.verticalId, services: client.services, serviceArea: client.serviceArea, selfCompetitorId: client.selfCompetitorId, placeId: client.placeId, keywords: client.keywords })
      .from(client).where(eq(client.id, clientId)));
  if (!c) throw new ToolError('not_found', 'Client not found');
  return { id: c.id, name: c.name, verticalId: c.verticalId, services: c.services ?? [], zips: c.serviceArea?.zips.length ?? 0, selfCompetitorId: c.selfCompetitorId, placeId: c.placeId, keywords: c.keywords ?? [], radiusKm: c.serviceArea?.radiusKm ?? null };
}

/** Decision 3 joins: event_score → event, and the event's competitor still tracked by this client. */
export const eventJoin = {
  change: eq(changeEvent.id, eventScore.eventId),
  tracked: and(eq(clientCompetitor.clientId, eventScore.clientId), eq(clientCompetitor.competitorId, changeEvent.competitorId))!,
};

/** Decision 3 condition — scored for this client and not retracted. Every workspace event reader uses it. */
export const clientEvents = (clientId: string): SQL => and(eq(eventScore.clientId, clientId), isNull(changeEvent.retractedAt))!;

/**
 * Of `eventIds`, the newest one this client may see under decision 3 (one RLS query), or null. Used when a change is
 * linked to several events (merges): the change is visible when any of them is.
 */
export async function firstVisibleEvent(deps: ToolDeps, ctx: AccessContext, clientId: string, eventIds: string[]): Promise<string | null> {
  if (eventIds.length === 0) return null;
  const [e] = await withTenant(deps.app, ctx, (tx) =>
    tx.select({ id: changeEvent.id }).from(eventScore).innerJoin(changeEvent, eventJoin.change).innerJoin(clientCompetitor, eventJoin.tracked)
      .where(and(clientEvents(clientId), inArray(changeEvent.id, eventIds)))
      .orderBy(desc(changeEvent.occurredAt), desc(changeEvent.id)).limit(1));
  return e?.id ?? null;
}

export async function requireVisibleEvent(deps: ToolDeps, ctx: AccessContext, clientId: string, eventId: string): Promise<void> {
  if (!(await firstVisibleEvent(deps, ctx, clientId, [eventId]))) throw new ToolError('not_found', 'Change not found');
}

/** Escapes `\`, `%` and `_` for a LIKE/ILIKE pattern (Postgres' default escape character is `\`). */
export const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (m) => `\\${m}`);

/** Decision 10: live supporting events of a move (the quarterly-report rule). Moves, the profile and pressure
 * count or list a move only while this is > 0. */
export const liveEventCount = sql<number>`(SELECT count(*)::int FROM move_event me JOIN event e ON e.id = me.event_id WHERE me.move_id = ${move.id} AND e.retracted_at IS NULL)`;
