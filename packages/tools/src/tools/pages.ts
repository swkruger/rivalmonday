import { type AccessContext, canAccessClient, PAGE_TYPES, toolkit, ToolError } from '@cs/core';
import { clientCompetitor, competitor, type Db, trackedPage, withTenant } from '@cs/db';
import { and, asc, count, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { MAX_ACTIVE_PAGES } from '../limits';
import { TrackedPageView, toIso } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const DAILY = new Set(['home', 'pricing', 'promo']);

/** Same split as discovery's `selectPages`: home/pricing/promo daily, everything else weekly. */
export const defaultCadence = (pageType: string): 'daily' | 'weekly' => (DAILY.has(pageType) ? 'daily' : 'weekly');

/** RLS proof that the caller's client tracks this competitor (Review Focus 1) — global rows are then written with the service Db. */
async function requireTracked(app: Db, ctx: AccessContext, clientId: string, competitorId: string): Promise<void> {
  if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Competitor not found');
  const [link] = await withTenant(app, ctx, (tx) =>
    tx.select({ id: clientCompetitor.competitorId }).from(clientCompetitor).where(and(eq(clientCompetitor.clientId, clientId), eq(clientCompetitor.competitorId, competitorId))));
  if (!link) throw new ToolError('not_found', 'Competitor not found');
}

const view = (p: typeof trackedPage.$inferSelect): TrackedPageView => ({
  id: p.id, url: p.url, pageType: p.pageType, source: p.source, pinned: p.pinned, active: p.active, cadence: p.cadence, lastCapturedAt: toIso(p.lastCapturedAt),
});

export const listTrackedPages = defineTool({
  name: 'list_tracked_pages',
  description: 'List the website pages monitored for one of the client’s competitors.',
  input: z.object({ clientId: uuid, competitorId: uuid }),
  output: z.object({ items: z.array(TrackedPageView) }),
  permission: 'read',
  async handler(ctx, { clientId, competitorId }, deps) {
    await requireTracked(deps.app, ctx, clientId, competitorId);
    const rows = await deps.service.select().from(trackedPage).where(eq(trackedPage.competitorId, competitorId)).orderBy(asc(trackedPage.pageType), asc(trackedPage.url));
    return { items: rows.map(view) };
  },
});

export const setPagePin = defineTool({
  name: 'set_page_pin',
  description: 'Pin a page (always monitored, daily) or unpin it (back to its normal cadence).',
  input: z.object({ clientId: uuid, pageId: uuid, pinned: z.boolean() }),
  output: z.object({ pageId: uuid }),
  permission: 'agency',
  async handler(ctx, { clientId, pageId, pinned }, deps) {
    const [p] = await deps.service.select().from(trackedPage).where(eq(trackedPage.id, pageId));
    if (!p) throw new ToolError('not_found', 'Page not found');
    await requireTracked(deps.app, ctx, clientId, p.competitorId);
    await deps.service.update(trackedPage).set({ pinned, cadence: pinned ? 'daily' : defaultCadence(p.pageType) }).where(eq(trackedPage.id, pageId));
    return { pageId };
  },
});

export const addTrackedPage = defineTool({
  name: 'add_tracked_page',
  description: 'Monitor an extra page of a competitor’s own website (pinned, daily).',
  input: z.object({ clientId: uuid, competitorId: uuid, url: z.string().max(2000), pageType: z.enum(PAGE_TYPES) }),
  output: z.object({ pageId: uuid }),
  permission: 'agency',
  async handler(ctx, { clientId, competitorId, url, pageType }, deps) {
    if (!deps.webMonitoring) throw new ToolError('invalid_input', 'Website monitoring is switched off, so pages can’t be added yet');
    await requireTracked(deps.app, ctx, clientId, competitorId);
    const [c] = await deps.service.select({ domain: competitor.domain }).from(competitor).where(eq(competitor.id, competitorId));
    if (!c?.domain) throw new ToolError('invalid_input', 'Add the competitor’s website first');
    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      throw new ToolError('invalid_input', 'That isn’t a web address');
    }
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || host !== c.domain) throw new ToolError('invalid_input', `Pages must be on ${c.domain}`);
    parsed.hash = '';
    const [active] = await deps.service.select({ n: count() }).from(trackedPage).where(and(eq(trackedPage.competitorId, competitorId), eq(trackedPage.active, true)));
    if ((active?.n ?? 0) >= MAX_ACTIVE_PAGES) throw new ToolError('invalid_input', `A competitor can have at most ${MAX_ACTIVE_PAGES} monitored pages`);
    const [row] = await deps.service
      .insert(trackedPage)
      .values({ competitorId, url: parsed.toString(), pageType, source: 'manual', pinned: true, active: true, cadence: 'daily' })
      .onConflictDoUpdate({ target: [trackedPage.competitorId, trackedPage.url], set: { pinned: true, active: true, cadence: 'daily' } })
      .returning({ id: trackedPage.id });
    return { pageId: row!.id };
  },
});

export const pageTools = [listTrackedPages, setPagePin, addTrackedPage];
