import type { ListedEventSource, ListedEventStatus } from '@cs/db';
import type { EventCandidate } from './candidates';
import { eventKey, nameTokens } from './normalise';

export interface ExistingEvent { id: string; eventKey: string; nameNorm: string; startDate: string; status: ListedEventStatus; sources: ListedEventSource[] }
export type MergeOp =
  | { op: 'insert'; key: string; cand: EventCandidate }
  | { op: 'update'; existing: ExistingEvent; cand: EventCandidate; statusFlip: boolean };

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

/** D5/P4: dates within one day and the shorter name's tokens inside the longer's (and at least half its length). */
export function sameEvent(a: { nameNorm: string; startDate: string }, b: { nameNorm: string; startDate: string }): boolean {
  if (dayDiff(a.startDate, b.startDate) > 1) return false;
  const [s, l] = [nameTokens(a.nameNorm), nameTokens(b.nameNorm)].sort((x, y) => x.length - y.length) as [string[], string[]];
  return s.length > 0 && s.length * 2 >= l.length && s.every((t) => l.includes(t));
}

export function mergeCandidates(existing: ExistingEvent[], cands: EventCandidate[]): MergeOp[] {
  const ops: MergeOp[] = [];
  const pool = [...existing];
  const fresh: { key: string; cand: EventCandidate }[] = [];
  for (const c of cands) {
    const key = eventKey(c.nameNorm, c.startDate);
    const hit = pool.find((e) => e.eventKey === key) ?? pool.filter((e) => sameEvent(e, c)).sort((x, y) => dayDiff(x.startDate, c.startDate) - dayDiff(y.startDate, c.startDate))[0];
    if (hit) {
      ops.push({ op: 'update', existing: hit, cand: c, statusFlip: c.source === 'web' && hit.status === 'scheduled' && c.status !== 'scheduled' });
      continue;
    }
    const dup = fresh.find((f) => sameEvent({ nameNorm: f.cand.nameNorm, startDate: f.cand.startDate }, c));
    if (dup) {
      dup.cand = { ...dup.cand, ticketed: dup.cand.ticketed || c.ticketed, url: dup.cand.url ?? c.url };
      continue;
    }
    fresh.push({ key, cand: c });
  }
  return [...ops, ...fresh.map((f) => ({ op: 'insert' as const, key: f.key, cand: f.cand }))];
}
