import type { BriefCandidate, EventCandidate, MoveCandidate } from './gather';

/** Spec §9.1.2: top 3–5 by score, ≤ 2 items per competitor. */
export const BRIEF_MAX_ITEMS = 5;
export const BRIEF_MAX_PER_COMPETITOR = 2;

const key = (c: BriefCandidate) => (c.kind === 'event' ? c.eventId : c.moveId);

export function selectBriefItems(input: { events: EventCandidate[]; moves: MoveCandidate[] }): BriefCandidate[] {
  const absorbed = new Set(input.moves.flatMap((m) => m.events.map((e) => e.eventId)));
  const pool: BriefCandidate[] = [...input.moves, ...input.events.filter((e) => !absorbed.has(e.eventId))];
  pool.sort((a, b) =>
    b.score - a.score
    || (a.kind === b.kind ? 0 : a.kind === 'move' ? -1 : 1)
    || b.occurredAt.getTime() - a.occurredAt.getTime()
    || key(a).localeCompare(key(b)));
  const perCompetitor = new Map<string, number>();
  const out: BriefCandidate[] = [];
  for (const c of pool) {
    if (out.length >= BRIEF_MAX_ITEMS) break;
    const n = perCompetitor.get(c.competitorId) ?? 0;
    if (n >= BRIEF_MAX_PER_COMPETITOR) continue;
    perCompetitor.set(c.competitorId, n + 1);
    out.push(c);
  }
  return out;
}
