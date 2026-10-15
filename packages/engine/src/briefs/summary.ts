import type { BriefKind } from '@cs/db';
import { QUIET_SUMMARY } from './generate';

export const countSummary = (n: number) => `${n} competitor update${n === 1 ? '' : 's'} this week.`;

/**
 * Phase 4a binding obligation (decision 10): the verified summary may describe an item that was later dropped, so once
 * any item is dropped the summary becomes the count line, and a brief with no active item becomes quiet. A starting point keeps its
 * kind and summary (Phase 12b Q3): its summary describes the scorecard, not the items, and the scorecard ships either way.
 */
export function finalBriefSummary(b: { kind: BriefKind; summary: string }, items: { status: string }[]): { kind: BriefKind; summary: string } {
  if (b.kind === 'starting_point') return { kind: b.kind, summary: b.summary };
  const active = items.filter((i) => i.status === 'active').length;
  if (active === 0) return { kind: 'quiet', summary: QUIET_SUMMARY };
  if (items.some((i) => i.status === 'dropped')) return { kind: 'standard', summary: countSummary(active) };
  return { kind: b.kind, summary: b.summary };
}
