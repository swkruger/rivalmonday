import { canAccessClient, toolkit, ToolError } from '@cs/core';
import { acceptSuggestion } from '@cs/collectors';
import { client, clientCompetitor, competitor, competitorSuggestion, trackedPage, type Tx, withTenant } from '@cs/db';
import { and, count, desc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { enqueueOf, type ToolDeps } from '../deps';
import { COMPETITOR_LIMIT } from '../limits';
import { SuggestionView } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();

export type Discovery = 'queued' | 'disabled' | 'not_needed';

/** Decision 7: page discovery crawls the competitor's site, so it only runs with website monitoring switched on. */
export async function startDiscovery(deps: ToolDeps, competitorId: string): Promise<Discovery> {
  if (!deps.webMonitoring) return 'disabled';
  const [c] = await deps.service.select({ domain: competitor.domain }).from(competitor).where(eq(competitor.id, competitorId));
  if (!c?.domain) return 'not_needed';
  const [pages] = await deps.service.select({ n: count() }).from(trackedPage).where(eq(trackedPage.competitorId, competitorId));
  if ((pages?.n ?? 0) > 0) return 'not_needed';
  await enqueueOf(deps)('discover-pages', { competitorId }, `discover:${competitorId}`);
  return 'queued';
}

/** Decision 5. Call inside the caller's tenant transaction; a competitor already linked to the client doesn't count twice. */
export async function assertRoomForCompetitor(tx: Tx, clientId: string, competitorId: string | null): Promise<void> {
  const where = competitorId ? and(eq(clientCompetitor.clientId, clientId), ne(clientCompetitor.competitorId, competitorId)) : eq(clientCompetitor.clientId, clientId);
  const [row] = await tx.select({ n: count() }).from(clientCompetitor).where(where);
  if ((row?.n ?? 0) >= COMPETITOR_LIMIT) throw new ToolError('invalid_input', `A client can track at most ${COMPETITOR_LIMIT} competitors — remove one first`);
}

export const listCompetitorSuggestions = defineTool({
  name: 'list_competitor_suggestions',
  description: 'List open competitor suggestions for a client, strongest overlap first.',
  input: z.object({ clientId: uuid }),
  output: z.object({ items: z.array(SuggestionView) }),
  permission: 'manage',
  feature: 'manage_competitors',
  async handler(ctx, { clientId }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx.select().from(competitorSuggestion).where(and(eq(competitorSuggestion.clientId, clientId), eq(competitorSuggestion.status, 'suggested'))).orderBy(desc(competitorSuggestion.overlapScore), desc(competitorSuggestion.appearances)).limit(50));
    return { items: rows.map((s) => ({ id: s.id, name: s.name, domain: s.domain, placeId: s.placeId, rating: s.rating, votes: s.votes, appearances: s.appearances, bestRank: s.bestRank, overlapScore: s.overlapScore })) };
  },
});

export const requestCompetitorSuggestions = defineTool({
  name: 'request_competitor_suggestions',
  description: 'Search Google Maps around the client’s service area for likely competitors (paid; runs in the background).',
  input: z.object({ clientId: uuid }),
  output: z.object({ queued: z.literal(true) }),
  permission: 'agency',
  async handler(ctx, { clientId }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const [c] = await withTenant(deps.app, ctx, (tx) => tx.select({ keywords: client.keywords, serviceArea: client.serviceArea }).from(client).where(eq(client.id, clientId)));
    if (!c) throw new ToolError('not_found', 'Client not found');
    if (c.keywords.length === 0 || !c.serviceArea) throw new ToolError('invalid_input', 'Add at least one keyword and a service area to the client profile first');
    await enqueueOf(deps)('suggest-competitors', { clientId }, `suggest:${clientId}`);
    return { queued: true as const };
  },
});

export const acceptCompetitorSuggestion = defineTool({
  name: 'accept_competitor_suggestion',
  description: 'Start tracking a suggested competitor for its client.',
  input: z.object({ suggestionId: uuid }),
  output: z.object({ competitorId: uuid, discovery: z.enum(['queued', 'disabled', 'not_needed']) }),
  permission: 'manage',
  feature: 'manage_competitors',
  async handler(ctx, { suggestionId }, deps) {
    await withTenant(deps.app, ctx, async (tx) => {
      const [s] = await tx.select().from(competitorSuggestion).where(eq(competitorSuggestion.id, suggestionId));
      if (!s || !canAccessClient(ctx, s.clientId)) throw new ToolError('not_found', 'Suggestion not found');
      const existing = s.placeId ? (await tx.select({ id: competitor.id }).from(competitor).where(eq(competitor.placeId, s.placeId)))[0] : undefined;
      await assertRoomForCompetitor(tx, s.clientId, existing?.id ?? null);
    });
    const { competitorId } = await acceptSuggestion({ service: deps.service, app: deps.app }, ctx, suggestionId);
    return { competitorId, discovery: await startDiscovery(deps, competitorId) };
  },
});

export const dismissCompetitorSuggestion = defineTool({
  name: 'dismiss_competitor_suggestion',
  description: 'Hide a competitor suggestion.',
  input: z.object({ suggestionId: uuid }),
  output: z.object({ dismissed: z.literal(true) }),
  permission: 'manage',
  feature: 'manage_competitors',
  async handler(ctx, { suggestionId }, deps) {
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx.update(competitorSuggestion).set({ status: 'dismissed' }).where(and(eq(competitorSuggestion.id, suggestionId), eq(competitorSuggestion.status, 'suggested'))).returning({ clientId: competitorSuggestion.clientId }));
    if (!rows[0] || !canAccessClient(ctx, rows[0].clientId)) throw new ToolError('not_found', 'Suggestion not found');
    return { dismissed: true as const };
  },
});

export const competitorTools = [listCompetitorSuggestions, requestCompetitorSuggestions, acceptCompetitorSuggestion, dismissCompetitorSuggestion];
