import { type GradedChangesView } from '@cs/core';
import { briefItem, type BriefKind, type Tx } from '@cs/db';
import { eq } from 'drizzle-orm';
import { QUIET_SUMMARY } from './generate';
import { GradedChanges, liveChanges } from './graded';

export const countSummary = (n: number) => `${n} competitor update${n === 1 ? '' : 's'} this week.`;
/** Decided copy: the summary of a week with no written item but live Major changes. */
export const majorSummary = (n: number) => `${n} major competitor change${n === 1 ? '' : 's'} this week.`;

/** Total events behind the live Major lines of a stored report (0 for none). */
export const liveMajorCount = (view: GradedChangesView | null): number => (view ? view.lines.filter((l) => l.grade === 'major').reduce((n, l) => n + l.count, 0) : 0);

/**
 * The brief's stored graded changes, filtered to what is still live (C2): retracted, untracked and AM/system-dropped
 * items' events leave. Null when the brief has no report or it does not parse (old briefs): callers treat that as no live Major line.
 */
export async function loadLiveChanges(tx: Tx, b: { id: string; clientId: string; report: unknown }): Promise<GradedChangesView | null> {
  const report = (b.report ?? null) as { changes?: unknown } | null;
  const parsed = GradedChanges.safeParse(report?.changes);
  if (!parsed.success) return null;
  const items = await tx.select({ status: briefItem.status, eventIds: briefItem.eventIds }).from(briefItem).where(eq(briefItem.briefId, b.id));
  return liveChanges(tx, b.clientId, parsed.data, {
    activeItemEventIds: items.filter((i) => i.status === 'active').flatMap((i) => i.eventIds),
    droppedItemEventIds: items.filter((i) => i.status === 'dropped').flatMap((i) => i.eventIds),
  });
}

/**
 * Phase 4a binding obligation (decision 10): the verified summary may describe an item that was later dropped, so once
 * any item is dropped the summary becomes the count line. A brief is quiet only with no active item AND no live Major
 * line; with Majors but no item it reads as the major line. A starting point keeps its kind and summary (Phase 12b Q3):
 * its summary describes the scorecard, not the items, and the scorecard ships either way.
 */
export function finalBriefSummary(b: { kind: BriefKind; summary: string }, items: { status: string }[], liveMajorEvents: number): { kind: BriefKind; summary: string } {
  if (b.kind === 'starting_point') return { kind: b.kind, summary: b.summary };
  const active = items.filter((i) => i.status === 'active').length;
  if (active === 0) return liveMajorEvents > 0 ? { kind: 'standard', summary: majorSummary(liveMajorEvents) } : { kind: 'quiet', summary: QUIET_SUMMARY };
  if (items.some((i) => i.status === 'dropped')) return { kind: 'standard', summary: countSummary(active) };
  return { kind: b.kind, summary: b.summary };
}
