import { describe, expect, it } from 'vitest';
import type { EventCandidate, MoveCandidate } from './gather';
import { selectBriefItems } from './select';

const at = new Date('2026-10-01T00:00:00Z');
const ev = (id: string, competitorId: string, score: number): EventCandidate => ({
  kind: 'event', eventId: id, competitorId, competitorName: competitorId, changeType: 'price_change', score, route: 'brief', occurredAt: at, confidence: 0.9,
  summary: '', facts: [], zips: [], details: {}, serviceId: null, serviceName: null, changes: [],
});
const mv = (id: string, competitorId: string, score: number, events: EventCandidate[]): MoveCandidate => ({
  kind: 'move', moveId: id, competitorId, competitorName: competitorId, moveType: 'price_war', status: 'active', confidence: 0.6, summary: '', facts: {}, score, occurredAt: at, events,
});

describe('selectBriefItems', () => {
  it('takes the top five by score', () => {
    const events = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => ev(id, `c${i}`, 50 + i));
    expect(selectBriefItems({ events, moves: [] }).map((c) => (c.kind === 'event' ? c.eventId : c.moveId))).toEqual(['f', 'e', 'd', 'c', 'b']);
  });

  it('allows at most two items per competitor', () => {
    const events = [ev('a', 'x', 90), ev('b', 'x', 80), ev('c', 'x', 70), ev('d', 'y', 50)];
    expect(selectBriefItems({ events, moves: [] }).map((c) => (c.kind === 'event' ? c.eventId : ''))).toEqual(['a', 'b', 'd']);
  });

  it('lets a move absorb its own events', () => {
    const a = ev('a', 'x', 60);
    const out = selectBriefItems({ events: [a, ev('b', 'y', 45)], moves: [mv('m', 'x', 66, [a])] });
    expect(out.map((c) => (c.kind === 'event' ? c.eventId : c.moveId))).toEqual(['m', 'b']);
  });

  it('never pads: no candidates, no items', () => {
    expect(selectBriefItems({ events: [], moves: [] })).toEqual([]);
  });

  it('breaks score ties deterministically (move first, then newest, then id)', () => {
    const out = selectBriefItems({ events: [ev('b', 'y', 60), ev('a', 'z', 60)], moves: [mv('m', 'x', 60, [])] });
    expect(out.map((c) => (c.kind === 'event' ? c.eventId : c.moveId))).toEqual(['m', 'a', 'b']);
  });
});
