import { canAccessClient, toolkit, ToolError } from '@cs/core';
import { acceptSuggestion, ensureCompetitorSources, findExistingCompetitor, patchReusedCompetitor } from '@cs/collectors';
import { client, clientCompetitor, competitor, competitorSuggestion, trackedPage, type Tx, withTenant } from '@cs/db';
import { and, asc, count, desc, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { enqueueOf, type JobState, jobStatusOf, type ToolDeps } from '../deps';
import { SUGGEST_COOLDOWN_MINUTES } from '../limits';
import { SuggestionView, TrackedCompetitor } from './schemas';

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

/** Decision 6 (5b-2): the client's own `competitor_limit`. Call inside the caller's tenant transaction; a competitor already linked doesn't count twice. */
export async function assertRoomForCompetitor(tx: Tx, clientId: string, competitorId: string | null): Promise<void> {
  const [c] = await tx.select({ limit: client.competitorLimit }).from(client).where(eq(client.id, clientId));
  if (!c) throw new ToolError('not_found', 'Client not found');
  const where = competitorId ? and(eq(clientCompetitor.clientId, clientId), ne(clientCompetitor.competitorId, competitorId)) : eq(clientCompetitor.clientId, clientId);
  const [row] = await tx.select({ n: count() }).from(clientCompetitor).where(where);
  if ((row?.n ?? 0) >= c.limit) throw new ToolError('invalid_input', `This client can track at most ${c.limit} competitor${c.limit === 1 ? '' : 's'} — remove one first or raise its limit`);
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
    // 5b-2 decision 17 (5b-1 Minor 1): the UI blocks a second click, but the tool must not start a second paid search either.
    if (deps.jobStatus) {
      const job = await deps.jobStatus('suggest-competitors', `suggest:${clientId}`);
      if (job && (job.state === 'created' || job.state === 'retry' || job.state === 'active')) throw new ToolError('invalid_input', 'A competitor search is already running for this client');
      if (job?.state === 'completed' && job.completedOn && Date.now() - job.completedOn.getTime() < SUGGEST_COOLDOWN_MINUTES * 60_000) {
        throw new ToolError('invalid_input', 'A search just finished — its suggestions are below. You can search again in a few minutes.');
      }
    }
    await enqueueOf(deps)('suggest-competitors', { clientId }, `suggest:${clientId}`);
    return { queued: true as const };
  },
});

const SEARCH_STATE: Record<JobState, 'queued' | 'running' | 'done' | 'failed'> = {
  created: 'queued', retry: 'running', active: 'running', completed: 'done', failed: 'failed', cancelled: 'failed',
};

export const getCompetitorSearchStatus = defineTool({
  name: 'get_competitor_search_status',
  description: 'Whether the client’s latest competitor search is queued, running, done or failed — the web page polls it after "Find competitors".',
  input: z.object({ clientId: uuid }),
  output: z.object({ state: z.enum(['idle', 'queued', 'running', 'done', 'failed']), finishedAt: z.string().nullable() }),
  permission: 'agency',
  async handler(ctx, { clientId }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const job = await jobStatusOf(deps)('suggest-competitors', `suggest:${clientId}`);
    if (!job) return { state: 'idle' as const, finishedAt: null };
    const state = SEARCH_STATE[job.state];
    return { state, finishedAt: state === 'done' || state === 'failed' ? (job.completedOn?.toISOString() ?? null) : null };
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

const HOST = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** "https://www.Smith.com/x" → "smith.com"; null when it isn't a host name. */
export function normalizeDomain(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  let host: string;
  try {
    host = new URL(/^https?:\/\//.test(s) ? s : `https://${s}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, '');
  return HOST.test(host) ? host : null;
}

export const listClientCompetitors = defineTool({
  name: 'list_client_competitors',
  description: 'List the competitors a client tracks, with their number of active tracked pages.',
  input: z.object({ clientId: uuid }),
  output: z.object({ items: z.array(TrackedCompetitor), limit: z.number().int() }),
  permission: 'read',
  async handler(ctx, { clientId }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const { c, rows } = await withTenant(deps.app, ctx, async (tx) => {
      const [c] = await tx.select({ limit: client.competitorLimit }).from(client).where(eq(client.id, clientId));
      const rows = await tx
        .select({
          id: competitor.id, name: competitor.name, domain: competitor.domain, placeId: competitor.placeId, addedAt: clientCompetitor.createdAt,
          activePages: sql<number>`(select count(*)::int from tracked_page tp where tp.competitor_id = ${competitor.id} and tp.active)`,
        })
        .from(clientCompetitor)
        .innerJoin(competitor, eq(competitor.id, clientCompetitor.competitorId))
        .where(eq(clientCompetitor.clientId, clientId))
        .orderBy(asc(competitor.name));
      return { c, rows };
    });
    if (!c) throw new ToolError('not_found', 'Client not found');
    return { items: rows.map((r) => ({ ...r, addedAt: r.addedAt.toISOString() })), limit: c.limit };
  },
});

export const addCompetitor = defineTool({
  name: 'add_competitor',
  description: 'Track a competitor by website and/or Google place id.',
  input: z.object({ clientId: uuid, name: z.string().min(1).max(120), domain: z.string().max(300).optional(), placeId: z.string().max(300).optional() }),
  output: z.object({ competitorId: uuid, discovery: z.enum(['queued', 'disabled', 'not_needed']) }),
  permission: 'manage',
  feature: 'manage_competitors',
  async handler(ctx, input, deps) {
    if (!canAccessClient(ctx, input.clientId)) throw new ToolError('not_found', 'Client not found');
    const domain = input.domain?.trim() ? normalizeDomain(input.domain) : null;
    if (input.domain?.trim() && !domain) throw new ToolError('invalid_input', 'That website doesn’t look like a domain (e.g. smithhvac.com)');
    const placeId = input.placeId?.trim() || null;
    if (placeId && !/^[A-Za-z0-9_-]{10,200}$/.test(placeId)) throw new ToolError('invalid_input', 'Google place id looks wrong');
    if (!domain && !placeId) throw new ToolError('invalid_input', 'Give the competitor’s website or Google place id');
    const [visible] = await withTenant(deps.app, ctx, (tx) => tx.select({ id: client.id }).from(client).where(eq(client.id, input.clientId)));
    if (!visible) throw new ToolError('not_found', 'Client not found');

    // Reuse a global row by place/cid first; for a typed website, the exact domain owner is that business.
    let row = await findExistingCompetitor(deps.service, { placeId, cid: null, domain });
    if (!row && domain) row = (await deps.service.select().from(competitor).where(eq(competitor.domain, domain)).limit(1))[0];
    await withTenant(deps.app, ctx, (tx) => assertRoomForCompetitor(tx, input.clientId, row?.id ?? null));
    let competitorId = row?.id;
    // Final review: if the reused row is any client's self business (named from that client's private client.name),
    // rename it to the name typed here. No identifier backfill: typed place ids/domains are unverified and must not
    // be written onto a shared row another agency already collects for.
    if (row) await patchReusedCompetitor(deps.service, row, { placeId, cid: null, domain, name: input.name.trim() }, { backfill: false });
    if (!competitorId) {
      const inserted = await deps.service.insert(competitor).values({ name: input.name.trim(), domain, placeId }).onConflictDoNothing().returning({ id: competitor.id });
      competitorId = inserted[0]?.id ?? (await findExistingCompetitor(deps.service, { placeId, cid: null, domain }))?.id;
      if (!competitorId) throw new ToolError('internal', 'That competitor could not be added — try again');
    }
    await withTenant(deps.app, ctx, (tx) => tx.insert(clientCompetitor).values({ agencyId: ctx.agencyId, clientId: input.clientId, competitorId: competitorId! }).onConflictDoNothing());
    await ensureCompetitorSources(deps.service, competitorId);
    return { competitorId, discovery: await startDiscovery(deps, competitorId) };
  },
});

export const removeCompetitor = defineTool({
  name: 'remove_competitor',
  description: 'Stop tracking a competitor for a client. History is kept; collection stops once no client tracks it.',
  input: z.object({ clientId: uuid, competitorId: uuid }),
  output: z.object({ removed: z.literal(true) }),
  permission: 'manage',
  feature: 'manage_competitors',
  async handler(ctx, { clientId, competitorId }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Competitor not found');
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx.delete(clientCompetitor).where(and(eq(clientCompetitor.clientId, clientId), eq(clientCompetitor.competitorId, competitorId))).returning({ id: clientCompetitor.competitorId }));
    if (rows.length === 0) throw new ToolError('not_found', 'Competitor not found');
    return { removed: true as const };
  },
});

export const competitorTools = [listCompetitorSuggestions, requestCompetitorSuggestions, getCompetitorSearchStatus, acceptCompetitorSuggestion, dismissCompetitorSuggestion, listClientCompetitors, addCompetitor, removeCompetitor];
