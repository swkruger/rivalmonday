import { describe, expect, it } from 'vitest';
import type { EventCandidate } from './candidates';
import { type ExistingEvent, mergeCandidates, sameEvent } from './merge';
import { eventKey, normaliseEventName } from './normalise';

const cand = (name: string, startDate: string, o: Partial<EventCandidate> = {}): EventCandidate =>
  ({ source: 'web', name, nameNorm: normaliseEventName(name), startDate, startsAt: null, endsAt: null, status: 'scheduled', url: null, venue: null, ticketed: false, ...o });
const existing = (name: string, startDate: string, o: Partial<ExistingEvent> = {}): ExistingEvent => {
  const nameNorm = normaliseEventName(name);
  return { id: 'e1', eventKey: eventKey(nameNorm, startDate), nameNorm, startDate, status: 'scheduled', sources: ['google_panel'], ...o };
};

describe('mergeCandidates', () => {
  it('RF3 panel + JSON-LD +-1 day = one row, sources merged', () => {
    const ops = mergeCandidates([existing('Jason Isbell', '2026-11-13')], [cand('Jason Isbell and the 400 Unit', '2026-11-14')]);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ op: 'update', existing: { id: 'e1' } });
  });
  it('"Party" is not "Halloween Costume Party"', () => {
    expect(sameEvent({ nameNorm: normaliseEventName('Party'), startDate: '2026-11-13' }, { nameNorm: normaliseEventName('Halloween Costume Party'), startDate: '2026-11-13' })).toBe(false);
    expect(mergeCandidates([existing('Party', '2026-11-13')], [cand('Halloween Costume Party', '2026-11-13')])[0]!.op).toBe('insert');
  });
  it('same key twice in one capture gives one insert', () => {
    const ops = mergeCandidates([], [cand('Open Mic', '2026-11-13'), cand('Open Mic', '2026-11-13', { ticketed: true, url: 'https://x' })]);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ op: 'insert', cand: { ticketed: true, url: 'https://x' } });
  });
  it('web flip scheduled to cancelled sets statusFlip; panel never flips', () => {
    const e = existing('Open Mic', '2026-11-13');
    expect(mergeCandidates([e], [cand('Open Mic', '2026-11-13', { status: 'cancelled' })])[0]).toMatchObject({ statusFlip: true });
    expect(mergeCandidates([e], [cand('Open Mic', '2026-11-13', { source: 'google_panel', status: 'cancelled' })])[0]).toMatchObject({ statusFlip: false });
  });
});
