import {
  type ChangeLine,
  GRADES,
  type Grade,
  gradeFor,
  REPORT_TOPICS,
  type ReportTopic,
  topicOf,
} from '@cs/core';
import { changeTypeLabel, groupPhrase } from '@cs/email';

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
