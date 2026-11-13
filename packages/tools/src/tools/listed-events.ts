import { canAccessClient, toolkit, ToolError } from '@cs/core';
import { client, clientCompetitor, competitor, evidence, listedEvent, withTenant } from '@cs/db';
import { localDate, safeTimezone } from '@cs/engine';
import { and, asc, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { packsOf } from '../catalog/access';
import type { ToolDeps } from '../deps';
import { citableEvidenceKinds } from '../workspace/events-read';
import { forChannel } from '../workspace/model-text';
import { ListedEventsView } from './schemas';

const { defineTool } = toolkit<ToolDeps>();

/** `YYYY-MM-DD` plus whole days (UTC arithmetic on the calendar date, so no DST drift). */
const addDays = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const listListedEvents = defineTool({
  name: 'list_listed_events',
  access: 'read',
  description: 'Upcoming events the client and its tracked rivals list, from events listed on Google, websites and ads, for the next days (default 60, up to 90), in date order with the client first on a shared date. '
    + 'Each event has its status (scheduled, cancelled, postponed or sold out), where it was listed and a link. Evidence ids are what to cite: an event\'s evidenceId is the evidence for it.',
  input: z.object({ clientId: z.string().uuid(), days: z.number().int().min(1).max(90).default(60) }),
  output: ListedEventsView,
  permission: 'read',
  channels: ['web', 'mcp', 'ask'],
  feature: 'dashboard',
  async handler(ctx, input, deps, meta) {
    if (!canAccessClient(ctx, input.clientId)) throw new ToolError('not_found', 'Client not found');
    const now = new Date();
    // One tenant transaction: the client (RLS), then its events. `listed_event` rows are global rows admitted by
    // `app_competitor_visible`, so they are narrowed to this client's own business and tracked rivals.
    const { c, rows } = await withTenant(deps.app, ctx, async (tx) => {
      const [row] = await tx.select({ name: client.name, timezone: client.timezone, selfCompetitorId: client.selfCompetitorId }).from(client).where(eq(client.id, input.clientId));
      if (!row) throw new ToolError('not_found', 'Client not found');
      const today = localDate(now, safeTimezone(row.timezone)); // an unknown stored zone falls back to Chicago instead of throwing
      const end = addDays(today, input.days);
      const found = await tx.select({
        id: listedEvent.id, competitorId: listedEvent.competitorId, businessName: competitor.name, name: listedEvent.name, startDate: listedEvent.startDate,
        startsAt: listedEvent.startsAt, status: listedEvent.status, sources: listedEvent.sources, url: listedEvent.url, ticketed: listedEvent.ticketed,
        firstSeenAt: listedEvent.firstSeenAt, lastCaptureId: listedEvent.lastCaptureId,
      }).from(listedEvent).innerJoin(competitor, eq(competitor.id, listedEvent.competitorId))
        .where(and(
          gte(listedEvent.startDate, today), lte(listedEvent.startDate, end),
          or(
            inArray(listedEvent.competitorId, tx.select({ id: clientCompetitor.competitorId }).from(clientCompetitor).where(eq(clientCompetitor.clientId, input.clientId))),
            inArray(listedEvent.competitorId, tx.select({ id: client.selfCompetitorId }).from(client).where(eq(client.id, input.clientId))),
          ),
        ))
        .orderBy(asc(listedEvent.startDate), asc(listedEvent.id));
      return { c: { ...row, today, end }, rows: found };
    });
    const isSelf = (id: string) => id === c.selfCompetitorId;
    const sorted = rows.map((r) => ({ ...r, self: isSelf(r.competitorId), businessName: isSelf(r.competitorId) ? c.name : r.businessName }))
      .sort((a, b) => cmp(a.startDate, b.startDate) || Number(b.self) - Number(a.self) || cmp(a.businessName, b.businessName) || cmp(a.name, b.name) || cmp(a.id, b.id));

    // Evidence of each event's latest capture (`evidence` is a global table; the captures belong to rows proved visible above).
    const captureIds = [...new Set(sorted.map((r) => r.lastCaptureId))];
    const evRows = captureIds.length
      ? await deps.service.select({ id: evidence.id, captureId: evidence.captureId }).from(evidence)
        .where(and(inArray(evidence.captureId, captureIds), inArray(evidence.kind, citableEvidenceKinds(meta)))).orderBy(evidence.kind, evidence.id)
      : [];
    const names = [c.name, ...sorted.map((r) => r.businessName)];
    return {
      events: sorted.map((r) => ({
        id: r.id, competitorId: r.competitorId, businessName: forChannel(meta, r.businessName, names), self: r.self, name: forChannel(meta, r.name, names),
        startDate: r.startDate, startsAt: r.startsAt?.toISOString() ?? null, status: r.status, sources: r.sources, url: r.url, ticketed: r.ticketed,
        firstSeenAt: r.firstSeenAt.toISOString(), evidenceId: evRows.find((e) => e.captureId === r.lastCaptureId)?.id ?? null,
      })),
      windowStart: c.today,
      windowEnd: c.end,
    };
  },
});

export const getClientEventsMenu = defineTool({
  name: 'get_client_events_menu',
  access: 'read',
  description: 'Which of the visible clients show the Events menu: those whose business type lists events, or that have an event the client or a tracked rival listed in the last 30 days or later. With a clientId, that client or none.',
  input: z.object({ clientId: z.string().uuid().optional() }),
  output: z.object({ clientIds: z.array(z.string().uuid()) }),
  permission: 'read',
  feature: 'dashboard',
  audit: 'skip-web', // launch-gate D2: a menu flag (client ids only), read on every client shell render
  async handler(ctx, input, deps) {
    if (input.clientId && !canAccessClient(ctx, input.clientId)) throw new ToolError('not_found', 'Client not found');
    // One tenant query: active visible clients, and whether each has a recent or upcoming event of its own business or a tracked rival.
    const rows = await withTenant(deps.app, ctx, (tx) => tx.select({
      id: client.id,
      verticalId: client.verticalId,
      hasEvents: sql<boolean>`EXISTS (SELECT 1 FROM listed_event le WHERE le.start_date >= current_date - 30 AND (le.competitor_id = client.self_competitor_id
        OR le.competitor_id IN (SELECT cc.competitor_id FROM client_competitor cc WHERE cc.client_id = client.id)))`,
    }).from(client).where(and(eq(client.status, 'active'), input.clientId ? eq(client.id, input.clientId) : undefined)).orderBy(asc(client.name), asc(client.id)));
    if (input.clientId && rows.length === 0) throw new ToolError('not_found', 'Client not found');
    const visible = rows.filter((r) => canAccessClient(ctx, r.id));
    const load = packsOf(deps);
    const menuOf = new Map(await Promise.all([...new Set(visible.map((r) => r.verticalId))].map(async (v) => [v, (await load(v)).events.menu] as const)));
    return { clientIds: visible.filter((r) => r.hasEvents || menuOf.get(r.verticalId)).map((r) => r.id) };
  },
});

export const listedEventTools = [listListedEvents, getClientEventsMenu];
