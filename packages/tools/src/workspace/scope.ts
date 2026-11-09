import { type AccessContext, canAccessClient, ToolError } from '@cs/core';
import { changeEvent, client, clientCompetitor, eventChange, eventScore, withTenant } from '@cs/db';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { clientEvents, eventJoin } from '@cs/engine';
import type { ToolDeps } from '../deps';

// Moved to `@cs/engine`; re-exported so tools importers don't change.
export { clientEvents, eventJoin, liveEventCount } from '@cs/engine';

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

/**
 * 7c1: `not_found` unless the client is in the caller's scope and visible through RLS (same agency, not archived). A
 * client-keyed list must refuse an out-of-scope client, never answer it with an empty list.
 */
export async function requireVisibleClient(deps: ToolDeps, ctx: AccessContext, clientId: string): Promise<void> {
  if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
  const [c] = await withTenant(deps.app, ctx, (tx) => tx.select({ id: client.id }).from(client).where(eq(client.id, clientId)));
  if (!c) throw new ToolError('not_found', 'Client not found');
}

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

/**
 * Launch-gate 6a: `firstVisibleEvent` over the events linked to one change, in one RLS query (the link rows are read
 * through RLS too: `event_change` is visible exactly when its event is, and the join already requires the event to be
 * visible to this client). Same answer as reading the links with the service Db and then calling `firstVisibleEvent`.
 */
export async function firstVisibleEventOfChange(deps: ToolDeps, ctx: AccessContext, clientId: string, changeId: string): Promise<string | null> {
  const [e] = await withTenant(deps.app, ctx, (tx) =>
    tx.select({ id: changeEvent.id }).from(eventScore).innerJoin(changeEvent, eventJoin.change).innerJoin(clientCompetitor, eventJoin.tracked)
      .where(and(clientEvents(clientId), inArray(changeEvent.id, tx.select({ id: eventChange.eventId }).from(eventChange).where(eq(eventChange.changeId, changeId)))))
      .orderBy(desc(changeEvent.occurredAt), desc(changeEvent.id)).limit(1));
  return e?.id ?? null;
}

/**
 * Launch-gate 6a: awaits every read (started together by the caller) and rejects with the first failure in **argument**
 * order, not time order, so a tool that now runs its client check beside its main read keeps the refusal it gave when the
 * reads ran one after another (e.g. `Client not found` before anything the main read would say). Every promise is
 * settled first, so none is left rejecting unhandled.
 */
export async function allInOrder<T extends readonly unknown[] | []>(reads: T): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }> {
  const settled: PromiseSettledResult<unknown>[] = await Promise.allSettled(reads as readonly unknown[]);
  for (const r of settled) if (r.status === 'rejected') throw r.reason;
  return settled.map((r) => (r as PromiseFulfilledResult<unknown>).value) as { -readonly [K in keyof T]: Awaited<T[K]> };
}

export async function requireVisibleEvent(deps: ToolDeps, ctx: AccessContext, clientId: string, eventId: string): Promise<void> {
  if (!(await firstVisibleEvent(deps, ctx, clientId, [eventId]))) throw new ToolError('not_found', 'Change not found');
}

/** Escapes `\`, `%` and `_` for a LIKE/ILIKE pattern (Postgres' default escape character is `\`). */
export const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (m) => `\\${m}`);
