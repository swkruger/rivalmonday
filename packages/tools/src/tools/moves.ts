import { appLinkFor, toolkit, ToolError } from '@cs/core';
import { changeEvent, clientCompetitor, competitor, eventScore, move, type MoveDetails, moveEvent, withTenant } from '@cs/db';
import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { packsOf, type ToolDeps } from '../deps';
import { MOVE_LABELS } from '../pressure';
import { detailOf, pageOf, pageResult } from '../paging';
import { eventEvidenceIds, eventRowSelect, toEventRow } from '../workspace/events-read';
import { humanise } from '../workspace/labels';
import { summaryForChannel } from '../workspace/model-text';
import { clientEvents, eventJoin, liveEventCount, workspaceClient } from '../workspace/scope';
import { MoveDetail, MoveRow, pageFields, pagedItems, toIso } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();


const moveSelect = {
  id: move.id, competitorId: move.competitorId, competitorName: competitor.name, moveType: move.moveType, status: move.status, confidence: move.confidence,
  summary: move.summary, details: move.details, firstDetectedAt: move.firstDetectedAt, lastEvidenceAt: move.lastEvidenceAt, closedAt: move.closedAt, eventCount: liveEventCount,
};

type MoveSel = {
  id: string; competitorId: string; competitorName: string; moveType: string; status: string; confidence: number; summary: string; details: MoveDetails | null;
  firstDetectedAt: Date; lastEvidenceAt: Date | null; closedAt: Date | null; eventCount: number;
};

const toMoveRow = (m: MoveSel): MoveRow => ({
  id: m.id, competitorId: m.competitorId, competitorName: m.competitorName, moveType: m.moveType, label: MOVE_LABELS[m.moveType] ?? humanise(m.moveType),
  status: (m.closedAt ? 'closed' : m.status) as MoveRow['status'], confidence: m.confidence, summary: m.summary, eventCount: Number(m.eventCount),
  channels: m.details?.channels ?? [], firstDetectedAt: m.firstDetectedAt.toISOString(), lastEvidenceAt: toIso(m.lastEvidenceAt), closedAt: toIso(m.closedAt),
});

/** Only moves of competitors this client currently tracks (decision 10). */
const trackedMove = and(eq(clientCompetitor.clientId, move.clientId), eq(clientCompetitor.competitorId, move.competitorId))!;

export const listMoves = defineTool({
  name: 'list_moves',
  description: 'Competitor moves detected for a client (territory expansion, price war, …) with status, confidence and how many live changes support each.',
  input: z.object({ clientId: uuid, status: z.enum(['open', 'closed', 'all']).default('open'), competitorId: uuid.optional(), limit: z.number().int().min(1).max(200).optional(), ...pageFields }),
  output: z.object({ items: pagedItems(MoveRow), nextCursor: z.string().nullable().optional() }),
  permission: 'read',
  channels: ['web', 'mcp'],
  feature: 'dashboard',
  async handler(ctx, input, deps, meta) {
    const c = await workspaceClient(deps, ctx, input.clientId);
    const { offset, limit } = pageOf(input, meta, 200);
    const conds = [eq(move.clientId, c.id), sql`${liveEventCount} > 0`];
    if (input.status === 'open') conds.push(isNull(move.closedAt));
    if (input.status === 'closed') conds.push(isNotNull(move.closedAt));
    if (input.competitorId) conds.push(eq(move.competitorId, input.competitorId));
    const fetched = await withTenant(deps.app, ctx, (tx) =>
      tx.select(moveSelect).from(move).innerJoin(clientCompetitor, trackedMove).innerJoin(competitor, eq(competitor.id, move.competitorId))
        .where(and(...conds)).orderBy(desc(sql`coalesce(${move.lastEvidenceAt}, ${move.firstDetectedAt})`), desc(move.id)).offset(offset).limit(limit + 1));
    const { rows, nextCursor } = pageResult(fetched, limit, offset);
    if (detailOf(input, meta) === 'full') return { items: rows.map((m) => toMoveRow(summaryForChannel(meta, m))), nextCursor };
    // Evidence of the move's live events only (decision 3 joins, RLS), at most 10 ids per move.
    const links = rows.length
      ? await withTenant(deps.app, ctx, (tx) =>
        tx.select({ moveId: moveEvent.moveId, eventId: changeEvent.id }).from(moveEvent)
          .innerJoin(eventScore, and(eq(eventScore.eventId, moveEvent.eventId), eq(eventScore.clientId, c.id)))
          .innerJoin(changeEvent, eventJoin.change).innerJoin(clientCompetitor, eventJoin.tracked)
          .where(and(inArray(moveEvent.moveId, rows.map((m) => m.id)), clientEvents(c.id))).orderBy(desc(changeEvent.occurredAt), desc(changeEvent.id)))
      : [];
    const evidence = await eventEvidenceIds(deps, [...new Set(links.map((l) => l.eventId))]);
    const evidenceOf = (moveId: string): string[] => {
      const ids: string[] = [];
      for (const l of links) if (l.moveId === moveId) for (const id of evidence.get(l.eventId) ?? []) if (!ids.includes(id)) ids.push(id);
      return ids.slice(0, 10);
    };
    return {
      items: rows.map((m) => ({
        id: m.id, title: MOVE_LABELS[m.moveType] ?? humanise(m.moveType), date: (m.lastEvidenceAt ?? m.firstDetectedAt).toISOString(), evidenceIds: evidenceOf(m.id),
        url: appLinkFor(deps.appUrl, { t: 'move', clientId: c.id, id: m.id }),
      })),
      nextCursor,
    };
  },
});

export const getMove = defineTool({
  name: 'get_move',
  description: 'One competitor move with its detected facts and the chain of live changes that support it.',
  input: z.object({ clientId: uuid, moveId: uuid }),
  output: MoveDetail,
  permission: 'read',
  channels: ['web', 'mcp'],
  feature: 'dashboard',
  async handler(ctx, { clientId, moveId }, deps, meta) {
    const c = await workspaceClient(deps, ctx, clientId);
    const pack = await packsOf(deps)(c.verticalId);
    const names = new Map(pack.services.map((s) => [s.id, s.name]));
    return withTenant(deps.app, ctx, async (tx) => {
      const [m] = await tx.select(moveSelect).from(move).innerJoin(clientCompetitor, trackedMove).innerJoin(competitor, eq(competitor.id, move.competitorId))
        .where(and(eq(move.clientId, c.id), eq(move.id, moveId)));
      if (!m || Number(m.eventCount) === 0) throw new ToolError('not_found', 'Move not found');
      const events = await tx.select(eventRowSelect).from(moveEvent).innerJoin(eventScore, and(eq(eventScore.eventId, moveEvent.eventId), eq(eventScore.clientId, c.id)))
        .innerJoin(changeEvent, eventJoin.change).innerJoin(clientCompetitor, eventJoin.tracked).innerJoin(competitor, eq(competitor.id, changeEvent.competitorId))
        .where(and(eq(moveEvent.moveId, moveId), clientEvents(c.id))).orderBy(desc(changeEvent.occurredAt));
      const facts = Object.entries(m.details?.facts ?? {}).map(([k, v]) => ({ label: humanise(k), value: String(v) }));
      return { ...toMoveRow(summaryForChannel(meta, m)), facts, events: events.map((e) => toEventRow(summaryForChannel(meta, e), c.verticalId, names)) };
    });
  },
});

export const moveTools = [listMoves, getMove];
