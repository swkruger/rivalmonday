import { type AccessContext, ToolError } from '@cs/core';
import { clientCompetitor, competitor, withTenant } from '@cs/db';
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

/**
 * The client's own business first (its self row, or just `client.place_id`), then tracked competitors by name.
 * Tracked rows come through RLS; the self row is a global row admitted by `client.self_competitor_id`, which
 * `workspaceClient` already read through RLS.
 */
export async function workspaceBusinesses(deps: ToolDeps, ctx: AccessContext, c: WorkspaceClient): Promise<Business[]> {
  const cols = { id: competitor.id, name: competitor.name, placeId: competitor.placeId, cid: competitor.cid, domain: competitor.domain };
  const tracked = await withTenant(deps.app, ctx, (tx) =>
    tx.select(cols).from(clientCompetitor).innerJoin(competitor, eq(competitor.id, clientCompetitor.competitorId))
      .where(eq(clientCompetitor.clientId, c.id)).orderBy(asc(competitor.name)));
  let self: Business | null = null;
  if (c.selfCompetitorId) {
    const [s] = await deps.service.select(cols).from(competitor).where(eq(competitor.id, c.selfCompetitorId));
    if (s) self = { key: 'self', competitorId: s.id, name: c.name, self: true, placeId: s.placeId ?? c.placeId, cid: s.cid, domain: s.domain };
  }
  if (!self && c.placeId) self = { key: 'self', competitorId: null, name: c.name, self: true, placeId: c.placeId, cid: null, domain: null };
  const others = tracked.filter((t) => t.id !== c.selfCompetitorId)
    .map((t) => ({ key: t.id, competitorId: t.id, name: t.name, self: false, placeId: t.placeId, cid: t.cid, domain: t.domain }));
  return self ? [self, ...others] : others;
}

/** A `business` input (`'self'` or a competitor id) → its entry; anything else is `not_found` (Review Focus 2). */
export function pickBusiness(list: Business[], key: string): Business {
  const b = list.find((x) => x.key === key);
  if (!b) throw new ToolError('not_found', key === 'self' ? 'Your business is not set up yet' : 'Competitor not found');
  return b;
}
