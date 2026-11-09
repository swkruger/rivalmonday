import {
  type ChangeLine,
  GRADES,
  type Grade,
  gradeFor,
  type GradedChanges,
  type GradedChangesView,
  REPORT_TOPICS,
  type ReportTopic,
  topicOf,
  totalsOf,
} from '@cs/core';
import { changeEvent, clientCompetitor, competitor, type Db, detectedChange, eventChange, eventScore, evidence, type Tx } from '@cs/db';
import { changeTypeLabel, groupPhrase } from '@cs/email';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import type { z } from 'zod';
import { clientEvents, eventJoin } from '../workspace/scope';
import { type BriefClient, periodWindow } from './gather';

export {
  capTopic,
  ChangeLine,
  GRADE_LABEL,
  GRADES,
  GradedChanges,
  GradedChangesView,
  GradeTotals,
  gradeFor,
  REPORT_CAPS,
  REPORT_TOPICS,
  TOPIC_LABEL,
  topicOf,
  totalsOf,
} from '@cs/core';
export type { Grade, ReportTopic } from '@cs/core';

/** One scored event as the grouping sees it (rows come from the event/score join). */
export interface GradableEvent {
  eventId: string;
  competitorId: string;
  competitorName: string;
  changeType: string;
  channel: string | null;
  score: number;
  summary: string;
  occurredAt: Date;
  evidenceIds: string[];
}

const SUMMARY_MAX = 140;
const clip = (s: string) => {
  const cp = [...s.replace(/\s+/g, ' ').trim()];
  return cp.length > SUMMARY_MAX ? `${cp.slice(0, SUMMARY_MAX - 1).join('')}…` : cp.join('');
};

export function groupChanges(rows: GradableEvent[], threshold: number): ChangeLine[] {
  const groups = new Map<string, { grade: Grade; rows: GradableEvent[] }>();
  for (const r of rows) {
    const grade = gradeFor(r.score, threshold);
    const k = `${grade}|${r.competitorId}|${r.changeType}|${r.channel ?? ''}`;
    const g = groups.get(k) ?? { grade, rows: [] };
    g.rows.push(r);
    groups.set(k, g);
  }
  const lines = [...groups.values()].map(({ grade, rows: rs }) => {
    const sorted = [...rs].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.eventId.localeCompare(b.eventId));
    const first = sorted[0]!,
      last = sorted[sorted.length - 1]!;
    const text =
      rs.length === 1
        ? `${first.competitorName}: ${changeTypeLabel(first.changeType)} — ${clip(first.summary)}`
        : `${first.competitorName}: ${groupPhrase(first.changeType, first.channel, rs.length)}`;
    return {
      line: {
        grade,
        topic: topicOf(first.changeType),
        competitorId: first.competitorId,
        competitorName: first.competitorName,
        changeType: first.changeType,
        channel: first.channel,
        count: rs.length,
        text,
        firstAt: first.occurredAt.toISOString(),
        lastAt: last.occurredAt.toISOString(),
        eventIds: sorted.map((r) => r.eventId),
        evidenceIds: [...new Set(sorted.flatMap((r) => r.evidenceIds))].sort(),
      } satisfies ChangeLine,
      max: Math.max(...rs.map((r) => r.score)),
    };
  });
  const gi = (g: Grade) => GRADES.indexOf(g),
    ti = (t: ReportTopic) => REPORT_TOPICS.indexOf(t);
  return lines
    .sort(
      (a, b) =>
        gi(a.line.grade) - gi(b.line.grade) ||
        ti(a.line.topic) - ti(b.line.topic) ||
        b.max - a.max ||
        b.line.lastAt.localeCompare(a.line.lastAt) ||
        a.line.competitorName.localeCompare(b.line.competitorName, 'en') ||
        a.line.changeType.localeCompare(b.line.changeType),
    )
    .map((x) => x.line);
}

/** The period's gradable events for a client (�4.1): any route, scored in the window, not written into an item. */
export async function gradedChanges(
  deps: { db: Db },
  c: BriefClient,
  period: { start: Date; end: Date },
  writtenEventIds: Set<string>,
): Promise<GradedChanges> {
  const rows = await deps.db
    .select({ e: changeEvent, name: competitor.name, score: eventScore.score })
    .from(eventScore)
    .innerJoin(changeEvent, eventJoin.change)
    .innerJoin(clientCompetitor, eventJoin.tracked)
    .innerJoin(competitor, eq(competitor.id, changeEvent.competitorId))
    .where(and(clientEvents(c.id), ne(changeEvent.changeType, 'cosmetic'), periodWindow(c.id, period)))
    .orderBy(desc(eventScore.score), changeEvent.id);
  const fresh = rows.filter((r) => !writtenEventIds.has(r.e.id));
  const evidenceByEvent = new Map<string, string[]>();
  if (fresh.length > 0) {
    const links = await deps.db
      .select({ eventId: eventChange.eventId, evidenceId: evidence.id })
      .from(eventChange)
      .innerJoin(detectedChange, eq(detectedChange.id, eventChange.changeId))
      .innerJoin(evidence, eq(evidence.captureId, detectedChange.afterCaptureId))
      .where(inArray(eventChange.eventId, fresh.map((r) => r.e.id)));
    for (const l of links) evidenceByEvent.set(l.eventId, [...(evidenceByEvent.get(l.eventId) ?? []), l.evidenceId]);
  }
  const lines = groupChanges(
    fresh.map((r) => ({
      eventId: r.e.id, competitorId: r.e.competitorId, competitorName: r.name, changeType: r.e.changeType,
      channel: r.e.channels[0] ?? null, score: r.score, summary: r.e.summary, occurredAt: r.e.occurredAt,
      evidenceIds: evidenceByEvent.get(r.e.id) ?? [],
    })),
    c.briefThreshold,
  );
  return { v: 1, threshold: c.briefThreshold, lines, totals: totalsOf(lines, writtenEventIds.size) };
}

type Conn = Db | Tx;

/** n >= 2: the group phrase; n = 1: label only (a dropped event's summary is never reused). */
const regroupText = (l: ChangeLine, n: number): string =>
  n >= 2 ? `${l.competitorName}: ${groupPhrase(l.changeType, l.channel, n)}` : `${l.competitorName}: ${changeTypeLabel(l.changeType)}`;

/** Read/delivery-time filter of stored lines (C2): drops retracted, untracked and dropped-item events; one query.
 * Works on a service tx and inside `withTenant` (RLS narrows further). */
export async function liveChanges(
  conn: Conn,
  clientId: string,
  changes: GradedChanges,
  opts: { activeItemEventIds: string[]; droppedItemEventIds: string[] },
): Promise<z.infer<typeof GradedChangesView>> {
  const ids = [...new Set([...changes.lines.flatMap((l) => l.eventIds), ...opts.activeItemEventIds])];
  const live =
    ids.length === 0
      ? new Set<string>()
      : new Set(
          (
            await conn
              .select({ id: changeEvent.id })
              .from(eventScore)
              .innerJoin(changeEvent, eventJoin.change)
              .innerJoin(clientCompetitor, eventJoin.tracked)
              .where(and(clientEvents(clientId), inArray(changeEvent.id, ids)))
          ).map((r) => r.id),
        );
  const dropped = new Set(opts.droppedItemEventIds);
  const lines = changes.lines.flatMap((l) => {
    const keep = l.eventIds.filter((id) => live.has(id) && !dropped.has(id));
    return keep.length === 0 ? [] : [keep.length === l.eventIds.length ? l : { ...l, count: keep.length, eventIds: keep, text: regroupText(l, keep.length) }];
  });
  return { lines, totals: totalsOf(lines, opts.activeItemEventIds.filter((id) => live.has(id)).length) };
}
