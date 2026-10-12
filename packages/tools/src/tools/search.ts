import { redactForModel } from '@cs/collectors';
import { type AccessContext, appLinkFor, type AppTarget, hasFeature, isAgencyRole, toolkit } from '@cs/core';
import { alert, brief, briefItem, changeEvent, clientCompetitor, competitor, eventScore, recommendation, review, withTenant } from '@cs/db';
import { changeTypeLabel } from '@cs/email';
import { and, type AnyColumn, asc, cosineDistance, desc, eq, inArray, isNotNull, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { rrfMerge } from '../search/rrf';
import { AGENCY_BRIEF_STATUSES, CLIENT_BRIEF_STATUSES, DASHBOARD_ITEM_TYPES, searchClient } from '../search/scope';
import { workspaceBusinesses } from '../workspace/business';
import { clientEvents, eventJoin, type WorkspaceClient } from '../workspace/scope';

const { defineTool } = toolkit<ToolDeps>();

export const SEARCH_TYPES = ['event', 'brief_item', 'recommendation', 'alert', 'review', 'page'] as const;
type SearchType = (typeof SEARCH_TYPES)[number];
const FTS_PER_TYPE = 30;
const VECTOR_PER_KIND = 20;
const SNIPPET_CHARS = 300;
const HEADLINE_OPTS = 'StartSel="",StopSel="",MaxWords=35,MinWords=15';

/** One ranked candidate; `snippet` is raw text, redacted only when the result is shaped. */
interface Hit {
  key: string;
  title: string;
  snippet: string;
  /** Business names never mistaken for people by the redactor. */
  names: string[];
  target: AppTarget;
}

const SearchResult = z.object({ id: z.string(), title: z.string(), snippet: z.string(), url: z.string() });

const tsv = (table: string): SQL => sql.raw(`"${table}".search_tsv`);
const pathOf = (url: string): string => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

/** FTS candidates of every enabled type, each type's top 30 by `ts_rank_cd`, merged into one list by rank. */
async function ftsHits(deps: ToolDeps, ctx: AccessContext, c: WorkspaceClient, types: ReadonlySet<SearchType>, query: string): Promise<Hit[]> {
  const q = sql`websearch_to_tsquery('english', ${query})`;
  const headline = (text: SQL | AnyColumn) => sql<string>`ts_headline('english', ${text}, ${q}, ${HEADLINE_OPTS})`;
  const rank = (table: string) => sql<number>`ts_rank_cd(${tsv(table)}, ${q})`;
  const matches = (table: string) => sql`${tsv(table)} @@ ${q}`;
  const ranked: { hit: Hit; rank: number }[] = [];
  const agency = isAgencyRole(ctx.role);

  if (types.has('event')) {
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx.select({ id: changeEvent.id, name: competitor.name, changeType: changeEvent.changeType, snippet: headline(changeEvent.summary), rank: rank('event') })
        .from(eventScore).innerJoin(changeEvent, eventJoin.change).innerJoin(clientCompetitor, eventJoin.tracked)
        .innerJoin(competitor, eq(competitor.id, changeEvent.competitorId))
        .where(and(clientEvents(c.id), matches('event'))).orderBy(desc(rank('event')), asc(changeEvent.id)).limit(FTS_PER_TYPE));
    for (const r of rows) ranked.push({ rank: r.rank, hit: { key: `event:${r.id}`, title: `${r.name}: ${changeTypeLabel(r.changeType)}`, snippet: r.snippet, names: [r.name], target: { t: 'event', clientId: c.id, id: r.id } } });
  }

  if (types.has('brief_item')) {
    const text = sql`${briefItem.headline} || ' ' || ${briefItem.whatChanged} || ' ' || ${briefItem.whyItMatters} || ' ' || ${briefItem.recommendedAction}`;
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx.select({ id: briefItem.id, headline: briefItem.headline, name: competitor.name, snippet: headline(text), rank: rank('brief_item') })
        .from(briefItem).innerJoin(brief, eq(brief.id, briefItem.briefId)).leftJoin(competitor, eq(competitor.id, briefItem.competitorId))
        .where(and(eq(briefItem.clientId, c.id), eq(brief.clientId, c.id), eq(briefItem.status, 'active'),
          inArray(brief.status, agency ? AGENCY_BRIEF_STATUSES : CLIENT_BRIEF_STATUSES), matches('brief_item')))
        .orderBy(desc(rank('brief_item')), asc(briefItem.id)).limit(FTS_PER_TYPE));
    for (const r of rows) ranked.push({ rank: r.rank, hit: { key: `brief_item:${r.id}`, title: r.headline, snippet: r.snippet, names: r.name ? [r.name] : [], target: { t: 'brief_item', id: r.id } } });
  }

  if (types.has('recommendation')) {
    const text = sql`${recommendation.title} || ' ' || ${recommendation.rationale}`;
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx.select({ id: recommendation.id, title: recommendation.title, snippet: headline(text), rank: rank('recommendation') })
        .from(recommendation).where(and(eq(recommendation.clientId, c.id), matches('recommendation')))
        .orderBy(desc(rank('recommendation')), asc(recommendation.id)).limit(FTS_PER_TYPE));
    for (const r of rows) ranked.push({ rank: r.rank, hit: { key: `recommendation:${r.id}`, title: r.title, snippet: r.snippet, names: [], target: { t: 'recommendation', clientId: c.id, id: r.id } } });
  }

  if (types.has('alert')) {
    const text = sql`${alert.headline} || ' ' || ${alert.body}`;
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx.select({ id: alert.id, headline: alert.headline, name: competitor.name, snippet: headline(text), rank: rank('alert') })
        .from(alert).leftJoin(competitor, eq(competitor.id, alert.competitorId))
        .where(and(eq(alert.clientId, c.id), ...(agency ? [] : [eq(alert.status, 'delivered')]), matches('alert')))
        .orderBy(desc(rank('alert')), asc(alert.id)).limit(FTS_PER_TYPE));
    for (const r of rows) ranked.push({ rank: r.rank, hit: { key: `alert:${r.id}`, title: r.headline, snippet: r.snippet, names: r.name ? [r.name] : [], target: { t: 'alert', id: r.id } } });
  }

  if (types.has('review')) {
    // Global review rows: visibility proved by workspaceBusinesses (RLS); reviewer_hash is never selected (spec 4.5).
    const byId = new Map((await workspaceBusinesses(deps, ctx, c)).filter((b) => b.competitorId !== null).map((b) => [b.competitorId!, b]));
    if (byId.size > 0) {
      const rows = await deps.service
        .select({ id: review.id, competitorId: review.competitorId, rating: review.rating, snippet: headline(sql`coalesce(${review.text}, '')`), rank: rank('review') })
        .from(review).where(and(inArray(review.competitorId, [...byId.keys()]), matches('review')))
        .orderBy(desc(rank('review')), asc(review.id)).limit(FTS_PER_TYPE);
      for (const r of rows) {
        const name = byId.get(r.competitorId)!.name;
        ranked.push({ rank: r.rank, hit: { key: `review:${r.id}`, title: `${name} review${r.rating ? `, ${r.rating}★` : ''}`, snippet: r.snippet, names: [name], target: { t: 'review', clientId: c.id, id: r.id } } });
      }
    }
  }

  return ranked.sort((a, b) => b.rank - a.rank || a.hit.key.localeCompare(b.hit.key)).map((x) => x.hit);
}

/** Vector candidates (events and tracked pages), nearest first; throws on any failure (the caller falls back to FTS). */
async function vectorHits(deps: ToolDeps, ctx: AccessContext, c: WorkspaceClient, types: ReadonlySet<SearchType>, query: string): Promise<Hit[]> {
  const embed = deps.embedQuery!;
  const vec = await embed(redactForModel(query), { agencyId: ctx.agencyId, clientId: c.id });
  const ranked: { hit: Hit; distance: number }[] = [];

  if (types.has('event')) {
    const distance = cosineDistance(changeEvent.embedding, vec);
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx.select({ id: changeEvent.id, name: competitor.name, changeType: changeEvent.changeType, summary: changeEvent.summary, distance: sql<number>`${distance}` })
        .from(eventScore).innerJoin(changeEvent, eventJoin.change).innerJoin(clientCompetitor, eventJoin.tracked)
        .innerJoin(competitor, eq(competitor.id, changeEvent.competitorId))
        .where(and(clientEvents(c.id), isNotNull(changeEvent.embedding))).orderBy(distance, asc(changeEvent.id)).limit(VECTOR_PER_KIND));
    for (const r of rows) {
      ranked.push({ distance: Number(r.distance), hit: { key: `event:${r.id}`, title: `${r.name}: ${changeTypeLabel(r.changeType)}`, snippet: r.summary.slice(0, SNIPPET_CHARS), names: [r.name], target: { t: 'event', clientId: c.id, id: r.id } } });
    }
  }

  if (types.has('page')) {
    // Tracked competitors only (RLS), never the client's own business; the global page rows are then read with the service Db.
    const competitorIds = (await workspaceBusinesses(deps, ctx, c)).filter((b) => !b.self && b.competitorId !== null).map((b) => b.competitorId!);
    if (competitorIds.length > 0) {
      const ids = sql`ARRAY[${sql.join(competitorIds.map((id) => sql`${id}`), sql`, `)}]::uuid[]`;
      const v = sql`${JSON.stringify(vec)}::vector`;
      // Latest capture (with extracted blocks) of each active tracked page, then that capture's nearest block: one hit per page.
      const rows = [...(await deps.service.execute<{ tracked_page_id: string; competitor_id: string; text: string; distance: number; url: string; name: string }>(sql`
        WITH latest AS (
          SELECT DISTINCT ON (cap.tracked_page_id) cap.id
          FROM capture cap JOIN tracked_page tp ON tp.id = cap.tracked_page_id
          WHERE tp.competitor_id = ANY(${ids}) AND tp.active
            AND EXISTS (SELECT 1 FROM capture_block b WHERE b.capture_id = cap.id)
          ORDER BY cap.tracked_page_id, cap.captured_at DESC, cap.id DESC
        ), best AS (
          SELECT DISTINCT ON (b.tracked_page_id) b.tracked_page_id, b.competitor_id, b.text, (b.embedding <=> ${v}) AS distance
          FROM capture_block b JOIN latest l ON l.id = b.capture_id
          WHERE b.embedding IS NOT NULL
          ORDER BY b.tracked_page_id, b.embedding <=> ${v}, b.ord
        )
        SELECT best.tracked_page_id, best.competitor_id, best.text, best.distance, tp.url, comp.name
        FROM best JOIN tracked_page tp ON tp.id = best.tracked_page_id JOIN competitor comp ON comp.id = best.competitor_id
        ORDER BY best.distance, best.tracked_page_id
        LIMIT ${VECTOR_PER_KIND}`))];
      for (const r of rows) {
        ranked.push({ distance: Number(r.distance), hit: { key: `page:${r.tracked_page_id}`, title: `${r.name}: ${pathOf(r.url)}`, snippet: r.text.slice(0, SNIPPET_CHARS), names: [r.name], target: { t: 'page', clientId: c.id, competitorId: r.competitor_id } } });
      }
    }
  }

  return ranked.sort((a, b) => a.distance - b.distance || a.hit.key.localeCompare(b.hit.key)).map((x) => x.hit);
}

export const search = defineTool({
  name: 'search',
  description: 'Search one client\'s competitor changes, brief items, recommendations, alerts, reviews and competitor pages by keywords. Returns ids to pass to fetch.',
  input: z.object({
    query: z.string().trim().min(1).max(200),
    clientId: z.string().uuid().optional(),
    types: z.array(z.enum(SEARCH_TYPES)).min(1).max(6).refine((t) => new Set(t).size === t.length, 'Types must be unique').optional(),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  output: z.object({ results: z.array(SearchResult) }),
  permission: 'read',
  channels: ['web', 'mcp', 'ask'],
  async handler(ctx, input, deps) {
    const c = await searchClient(deps, ctx, input.clientId);
    const dashboard = hasFeature(ctx, 'dashboard');
    const types = new Set((input.types ?? SEARCH_TYPES).filter((t) => dashboard || !DASHBOARD_ITEM_TYPES.has(t)));
    if (types.size === 0) return { results: [] };
    const fts = await ftsHits(deps, ctx, c, types, input.query);
    let vector: Hit[] = [];
    if (deps.embedQuery && (types.has('event') || types.has('page'))) {
      try {
        vector = await vectorHits(deps, ctx, c, types, input.query);
      } catch {
        console.warn('[search] embeddings unavailable'); // never the query or the error text (it may echo the query)
      }
    }
    return {
      results: rrfMerge([fts, vector], 60, input.limit).map((h) => ({
        id: h.key, title: h.title, url: appLinkFor(deps.appUrl, h.target),
        // d12 on every channel: snippets are captured or model-written text.
        snippet: redactForModel(h.snippet, { businessNames: [...h.names, c.name] }),
      })),
    };
  },
});

export const searchTools = [search];
