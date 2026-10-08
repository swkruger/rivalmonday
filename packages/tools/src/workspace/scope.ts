import { type AccessContext, canAccessClient, ToolError } from '@cs/core';
import { changeEvent, client, clientCompetitor, eventScore, withTenant } from '@cs/db';
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import type { ToolDeps } from '../deps';

export interface WorkspaceClient {
  id: string;
  name: string;
  verticalId: string;
  services: string[];
  zips: number;
  selfCompetitorId: string | null;
}

/** The client row through RLS — `not_found` for anything out of scope (spec §11). */
export async function workspaceClient(deps: ToolDeps, ctx: AccessContext, clientId: string): Promise<WorkspaceClient> {
  if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
  const [c] = await withTenant(deps.app, ctx, (tx) =>
    tx.select({ id: client.id, name: client.name, verticalId: client.verticalId, services: client.services, serviceArea: client.serviceArea, selfCompetitorId: client.selfCompetitorId })
      .from(client).where(eq(client.id, clientId)));
  if (!c) throw new ToolError('not_found', 'Client not found');
  return { id: c.id, name: c.name, verticalId: c.verticalId, services: c.services ?? [], zips: c.serviceArea?.zips.length ?? 0, selfCompetitorId: c.selfCompetitorId };
}

/** Decision 3 joins: event_score → event, and the event's competitor still tracked by this client. */
export const eventJoin = {
  change: eq(changeEvent.id, eventScore.eventId),
  tracked: and(eq(clientCompetitor.clientId, eventScore.clientId), eq(clientCompetitor.competitorId, changeEvent.competitorId))!,
};

/** Decision 3 condition — scored for this client and not retracted. Every workspace event reader uses it. */
export const clientEvents = (clientId: string): SQL => and(eq(eventScore.clientId, clientId), isNull(changeEvent.retractedAt))!;

export async function requireVisibleEvent(deps: ToolDeps, ctx: AccessContext, clientId: string, eventId: string): Promise<void> {
  const [e] = await withTenant(deps.app, ctx, (tx) =>
    tx.select({ id: changeEvent.id }).from(eventScore).innerJoin(changeEvent, eventJoin.change).innerJoin(clientCompetitor, eventJoin.tracked)
      .where(and(clientEvents(clientId), eq(changeEvent.id, eventId))));
  if (!e) throw new ToolError('not_found', 'Change not found');
}

/** Escapes `\`, `%` and `_` for a LIKE/ILIKE pattern (Postgres' default escape character is `\`). */
export const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (m) => `\\${m}`);
