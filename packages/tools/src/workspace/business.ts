import { type AccessContext, ToolError } from '@cs/core';
import { clientCompetitor, competitor, type Tx, withTenant } from '@cs/db';
import { asc, eq } from 'drizzle-orm';
import type { ToolDeps } from '../deps';
import type { WorkspaceClient } from './scope';

/** A business a 5c-2 module compares: the client's own (`key: 'self'`) or a tracked competitor (`key` = its id). */
export interface Business {
  key: string;
  /** null only for a self business known by `client.place_id` alone (no self row yet — no reviews or GBP data). */
  competitorId: string | null;
  name: string;
  self: boolean;
  placeId: string | null;
  cid: string | null;
  domain: string | null;
}

const businessCols = { id: competitor.id, name: competitor.name, placeId: competitor.placeId, cid: competitor.cid, domain: competitor.domain };
export type TrackedRow = { id: string; name: string; placeId: string | null; cid: string | null; domain: string | null };

/**
 * The client's tracked competitors by name, read in the caller's tenant transaction (RLS). Launch-gate 6b: lets a tool
 * read them beside its own tenant reads and hand them to `workspaceBusinesses`.
 */
export function trackedRows(tx: Tx, clientId: string): Promise<TrackedRow[]> {
  return tx.select(businessCols).from(clientCompetitor).innerJoin(competitor, eq(competitor.id, clientCompetitor.competitorId))
    .where(eq(clientCompetitor.clientId, clientId)).orderBy(asc(competitor.name));
}

/**
 * The client's own business first (its self row, or just `client.place_id`), then tracked competitors by name.
 * Tracked rows come through RLS; the self row is a global row admitted by `client.self_competitor_id`, which
 * `workspaceClient` already read through RLS. `tracked`: the rows of `trackedRows(tx, c.id)`, when the caller read them.
 */
export async function workspaceBusinesses(deps: ToolDeps, ctx: AccessContext, c: WorkspaceClient, tracked?: TrackedRow[]): Promise<Business[]> {
  // Launch-gate 6a: the tracked list (RLS) and the self business (service; `c` is already the checked client) together.
  const [rows, [s]] = await Promise.all([
    tracked ?? withTenant(deps.app, ctx, (tx) => trackedRows(tx, c.id)),
    c.selfCompetitorId ? deps.service.select(businessCols).from(competitor).where(eq(competitor.id, c.selfCompetitorId)) : Promise.resolve([]),
  ]);
  let self: Business | null = null;
  if (s) self = { key: 'self', competitorId: s.id, name: c.name, self: true, placeId: s.placeId ?? c.placeId, cid: s.cid, domain: s.domain };
  if (!self && c.placeId) self = { key: 'self', competitorId: null, name: c.name, self: true, placeId: c.placeId, cid: null, domain: null };
  const others = rows.filter((t) => t.id !== c.selfCompetitorId)
    .map((t) => ({ key: t.id, competitorId: t.id, name: t.name, self: false, placeId: t.placeId, cid: t.cid, domain: t.domain }));
  return self ? [self, ...others] : others;
}

/** A `business` input (`'self'` or a competitor id) → its entry; anything else is `not_found` (Review Focus 2). */
export function pickBusiness(list: Business[], key: string): Business {
  const b = list.find((x) => x.key === key);
  if (!b) throw new ToolError('not_found', key === 'self' ? 'Your business is not set up yet' : 'Competitor not found');
  return b;
}
