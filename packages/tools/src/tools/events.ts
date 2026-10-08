import { CHANGE_TYPES, toolkit, ToolError } from '@cs/core';
import { changeEvent, clientCompetitor, competitor, detectedChange, eventChange, eventScore, feedback, move, moveEvent, trackedPage, withTenant } from '@cs/db';
import { and, asc, desc, eq, gte, ilike, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { packsOf, type ToolDeps } from '../deps';
import { MOVE_LABELS } from '../pressure';
import { eventRowSelect, toEventRow } from '../workspace/events-read';
import { channelLabel, detailLines, factView } from '../workspace/labels';
import { clientEvents, escapeLike, eventJoin, requireVisibleEvent, workspaceClient } from '../workspace/scope';
import { EventDetail, EventRow, FEEDBACK_VERDICTS } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const DAY = 86_400_000;

export const searchEvents = defineTool({
  name: 'search_events',
  description: 'Competitor changes scored for a client, newest first, filterable by competitor, type, service, route, period, score and text.',
  input: z.object({
    clientId: uuid,
    competitorId: uuid.optional(),
    changeType: z.enum(CHANGE_TYPES).optional(),
    serviceId: z.string().min(1).max(80).optional(),
    route: z.enum(['flagged', 'all', 'archive']).default('flagged'),
    days: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)]).default(30),
    minScore: z.number().int().min(0).max(100).optional(),
    query: z.string().trim().min(1).max(100).optional(),
    limit: z.number().int().min(1).max(100).default(50),
    offset: z.number().int().min(0).max(5000).default(0),
  }),
  output: z.object({ items: z.array(EventRow), hasMore: z.boolean() }),
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, input, deps) {
    const c = await workspaceClient(deps, ctx, input.clientId);
    const pack = await packsOf(deps)(c.verticalId);
    const names = new Map(pack.services.map((s) => [s.id, s.name]));
    const conds = [clientEvents(c.id), gte(changeEvent.occurredAt, new Date(Date.now() - input.days * DAY))];
    if (input.competitorId) conds.push(eq(changeEvent.competitorId, input.competitorId));
    if (input.changeType) conds.push(eq(changeEvent.changeType, input.changeType));
    if (input.serviceId) conds.push(sql`${changeEvent.services} ->> ${c.verticalId} = ${input.serviceId}`);
    if (input.route === 'flagged') conds.push(inArray(eventScore.route, ['alert', 'brief']));
    if (input.route === 'archive') conds.push(eq(eventScore.route, 'archive'));
    if (input.minScore !== undefined) conds.push(gte(eventScore.score, input.minScore));
    if (input.query) conds.push(ilike(changeEvent.summary, `%${escapeLike(input.query)}%`));
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx.select(eventRowSelect).from(eventScore).innerJoin(changeEvent, eventJoin.change).innerJoin(clientCompetitor, eventJoin.tracked)
        .innerJoin(competitor, eq(competitor.id, changeEvent.competitorId))
        .where(and(...conds)).orderBy(desc(changeEvent.occurredAt), desc(changeEvent.id)).limit(input.limit + 1).offset(input.offset));
    return { items: rows.slice(0, input.limit).map((r) => toEventRow(r, c.verticalId, names)), hasMore: rows.length > input.limit };
  },
});

export const getEvent = defineTool({
  name: 'get_event',
  description: 'One scored competitor change: why it scored as it did, the evidence behind it and the moves it belongs to.',
  input: z.object({ clientId: uuid, eventId: uuid }),
  output: EventDetail,
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, { clientId, eventId }, deps) {
    const c = await workspaceClient(deps, ctx, clientId);
    const pack = await packsOf(deps)(c.verticalId);
    const names = new Map(pack.services.map((s) => [s.id, s.name]));
    const [r] = await withTenant(deps.app, ctx, (tx) =>
      tx.select({ ...eventRowSelect, facts: changeEvent.facts, details: changeEvent.details, factors: eventScore.factors })
        .from(eventScore).innerJoin(changeEvent, eventJoin.change).innerJoin(clientCompetitor, eventJoin.tracked)
        .innerJoin(competitor, eq(competitor.id, changeEvent.competitorId))
        .where(and(clientEvents(c.id), eq(changeEvent.id, eventId))));
    if (!r) throw new ToolError('not_found', 'Change not found');
    // Visibility proved above — global change rows are read with the service Db (Global Constraints).
    const changes = await deps.service
      .select({ changeId: detectedChange.id, channel: detectedChange.source, kind: detectedChange.kind, pageUrl: trackedPage.url, beforeCaptureId: detectedChange.beforeCaptureId,
        afterCaptureId: detectedChange.afterCaptureId, detectedAt: detectedChange.detectedAt, beforeText: detectedChange.beforeText, afterText: detectedChange.afterText })
      .from(eventChange).innerJoin(detectedChange, eq(detectedChange.id, eventChange.changeId)).leftJoin(trackedPage, eq(trackedPage.id, detectedChange.trackedPageId))
      .where(and(eq(eventChange.eventId, eventId), eq(detectedChange.status, 'event'))).orderBy(asc(detectedChange.detectedAt));
    const moves = await withTenant(deps.app, ctx, (tx) =>
      tx.select({ id: move.id, moveType: move.moveType, status: move.status, closedAt: move.closedAt }).from(moveEvent).innerJoin(move, eq(move.id, moveEvent.moveId))
        .where(and(eq(moveEvent.eventId, eventId), eq(move.clientId, c.id))));
    const [fb] = await withTenant(deps.app, ctx, (tx) =>
      tx.select({ after: feedback.after }).from(feedback)
        .where(and(eq(feedback.clientId, c.id), eq(feedback.subjectType, 'event'), eq(feedback.subjectId, eventId), eq(feedback.actor, ctx.userId)))
        .orderBy(desc(feedback.createdAt)).limit(1));
    const verdict = fb?.after?.verdict;
    const f = r.factors;
    return {
      ...toEventRow(r, c.verticalId, names),
      facts: (r.facts ?? []).map(factView),
      details: detailLines(r.details),
      factors: { typeWeight: f.typeWeight, size: f.size, relevance: f.relevance, serviceOverlap: f.serviceOverlap, territoryOverlap: f.territoryOverlap, novelty: f.novelty, thresholds: f.thresholds },
      changes: changes.map((ch) => ({
        changeId: ch.changeId, channel: ch.channel, channelLabel: channelLabel(ch.channel), kind: ch.kind, pageUrl: ch.pageUrl ?? null,
        beforeCaptureId: ch.beforeCaptureId, afterCaptureId: ch.afterCaptureId, detectedAt: ch.detectedAt.toISOString(), hasTextDiff: ch.beforeText !== null || ch.afterText !== null,
      })),
      moves: moves.map((m) => ({ id: m.id, label: MOVE_LABELS[m.moveType] ?? m.moveType, status: m.closedAt ? 'closed' : m.status })),
      myFeedback: FEEDBACK_VERDICTS.includes(verdict as never) ? (verdict as (typeof FEEDBACK_VERDICTS)[number]) : null,
    };
  },
});

export const submitFeedback = defineTool({
  name: 'submit_feedback',
  description: 'Rate a detected competitor change as useful, not relevant or wrong (optionally with a reason).',
  input: z.object({ clientId: uuid, eventId: uuid, verdict: z.enum(FEEDBACK_VERDICTS), reason: z.string().trim().max(500).optional() }),
  output: z.object({ ok: z.literal(true) }),
  permission: 'feedback',
  feature: 'dashboard',
  async handler(ctx, input, deps) {
    // Guests are client_viewers (no `feedback` permission) — this is a second barrier for any future guest role.
    if (ctx.userId.startsWith('contact:')) throw new ToolError('permission_denied', 'Sign in to give feedback');
    const c = await workspaceClient(deps, ctx, input.clientId);
    await requireVisibleEvent(deps, ctx, c.id, input.eventId);
    await deps.service.insert(feedback).values({
      agencyId: ctx.agencyId, clientId: c.id, subjectType: 'event', subjectId: input.eventId, kind: 'rating',
      after: { verdict: input.verdict }, reason: input.reason || null, actor: ctx.userId,
    });
    return { ok: true as const };
  },
});

export const eventTools = [searchEvents, getEvent, submitFeedback];
