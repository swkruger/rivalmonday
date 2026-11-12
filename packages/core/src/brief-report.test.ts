import { describe, expect, it } from 'vitest';
import { CHANGE_TYPES, TOPIC_LABEL, capTopic, gradeFor, topicOf, totalsOf, type ChangeLine } from './index';

const line = (o: Partial<ChangeLine>): ChangeLine => ({
  grade: 'notable', topic: 'offers', competitorId: '11111111-1111-4111-8111-111111111111', competitorName: 'Acme',
  changeType: 'price_change', channel: null, count: 1, text: 't', firstAt: '2026-11-03T10:00:00.000Z', lastAt: '2026-11-03T10:00:00.000Z',
  eventIds: ['22222222-2222-4222-8222-222222222222'], evidenceIds: [], ...o,
});

describe('gradeFor', () => {
  it('boundaries', () => {
    expect(gradeFor(40, 40)).toBe('major');
    expect(gradeFor(39.9, 40)).toBe('notable');
    expect(gradeFor(20, 40)).toBe('notable');
    expect(gradeFor(19.9, 40)).toBe('minor');
    expect(gradeFor(15, 30)).toBe('notable');
  });
});

describe('TOPIC_LABEL (18c)', () => {
  it('labels rankings as Rankings & listings', () => expect(TOPIC_LABEL.rankings).toBe('Rankings & listings'));
});

describe('topicOf', () => {
  it('maps the known types and falls back to offers', () => {
    expect(topicOf('rating_change')).toBe('reviews');
    expect(topicOf('review_spike')).toBe('reviews');
    expect(topicOf('ad_started')).toBe('ads');
    expect(topicOf('ad_stopped')).toBe('ads');
    expect(topicOf('rank_change')).toBe('rankings');
    expect(topicOf('citation_added')).toBe('rankings');
    expect(topicOf('event_listed')).toBe('offers');
    for (const t of CHANGE_TYPES) expect(['reviews', 'ads', 'rankings', 'offers']).toContain(topicOf(t));
    expect(topicOf('whatever_new')).toBe('offers');
  });
});

describe('capTopic', () => {
  it('splits shown/more per grade, majors before notable', () => {
    const lines = [
      line({ grade: 'notable', text: 'n1' }), line({ grade: 'major', text: 'm1' }), line({ grade: 'notable', text: 'n2' }),
      line({ grade: 'major', text: 'm2' }), line({ grade: 'minor', text: 'x1' }), line({ grade: 'minor', text: 'x2' }),
      line({ grade: 'minor', text: 'x3' }), line({ grade: 'notable', topic: 'ads', text: 'other' }),
    ];
    const r = capTopic(lines, 'offers', { lines: 3, minor: 2 });
    expect(r.lines.map((l) => l.text)).toEqual(['m1', 'm2', 'n1']);
    expect(r.moreLines).toBe(1);
    expect(r.minor.map((l) => l.text)).toEqual(['x1', 'x2']);
    expect(r.moreMinor).toBe(1);
  });
});

describe('totalsOf', () => {
  it('counts events and adds written majors', () => {
    const t = totalsOf([line({ grade: 'major', count: 2 }), line({ grade: 'notable', count: 3 }), line({ grade: 'minor', count: 4 }), line({ grade: 'minor' })], 5);
    expect(t).toEqual({ major: 7, notable: 3, minor: 5 });
  });
});
