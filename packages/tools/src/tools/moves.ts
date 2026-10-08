import { toolkit, ToolError } from '@cs/core';
import { changeEvent, clientCompetitor, competitor, eventScore, move, type MoveDetails, moveEvent, withTenant } from '@cs/db';
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { packsOf, type ToolDeps } from '../deps';
import { MOVE_LABELS } from '../pressure';
import { eventRowSelect, toEventRow } from '../workspace/events-read';
import { humanise } from '../workspace/labels';
import { clientEvents, eventJoin, workspaceClient } from '../workspace/scope';
import { MoveDetail, MoveRow, toIso } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();

/** Decision 10: live supporting events only (the quarterly-report rule). */
export const liveEventCount = sql<number>`(SELECT count(*)::int FROM move_event me JOIN event e ON e.id = me.event_id WHERE me.move_id = ${move.id} AND e.retracted_at IS NULL)`;

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
  input: z.object({ clientId: uuid, status: z.enum(['open', 'closed', 'all']).default('open'), competitorId: uuid.optional() }),
  output: z.object({ items: z.array(MoveRow) }),
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, input, deps) {
    const c = await workspaceClient(deps, ctx, input.clientId);
    const conds = [eq(move.clientId, c.id), sql`${liveEventCount} > 0`];
    if (input.status === 'open') conds.push(isNull(move.closedAt));
    if (input.status === 'closed') conds.push(isNotNull(move.closedAt));
    if (input.competitorId) conds.push(eq(move.competitorId, input.competitorId));
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx.select(moveSelect).from(move).innerJoin(clientCompetitor, trackedMove).innerJoin(competitor, eq(competitor.id, move.competitorId))
        .where(and(...conds)).orderBy(desc(sql`coalesce(${move.lastEvidenceAt}, ${move.firstDetectedAt})`)).limit(200));
    return { items: rows.map(toMoveRow) };
  },
});

export const getMove = defineTool({
  name: 'get_move',
  description: 'One competitor move with its detected facts and the chain of live changes that support it.',
  input: z.object({ clientId: uuid, moveId: uuid }),
  output: MoveDetail,
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, { clientId, moveId }, deps) {
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
      return { ...toMoveRow(m), facts, events: events.map((e) => toEventRow(e, c.verticalId, names)) };
    });
  },
});

export const moveTools = [listMoves, getMove];
