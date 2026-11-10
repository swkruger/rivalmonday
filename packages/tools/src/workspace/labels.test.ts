import { describe, expect, it } from 'vitest';
import { toEventRow } from './events-read';
import { changeChannelLabel, changeTypeOptions, channelLabel, detailLines, factView, sourceLabel } from './labels';

describe('workspace labels', () => {
  it('labels channels and falls back to a humanised key', () => {
    expect(channelLabel('meta_ads')).toBe('Meta ads');
    expect(channelLabel('some_new_thing')).toBe('Some new thing');
  });
  it('labels a review topic "Topic", never "Theme"', () => {
    expect(detailLines({ topicName: 'Response time' })).toEqual([{ label: 'Topic', value: 'Response time' }]);
  });
  it('turns structured details into readable lines', () => {
    expect(detailLines({ count: 6, items: [{ id: '1', label: '$79 Tune-Up' }], ratingBefore: 4.4, ratingAfter: 4.1, keyword: 'ac repair' })).toEqual([
      { label: 'Count', value: '6' },
      { label: 'Items', value: '$79 Tune-Up' },
      { label: 'Rating', value: '4.4 → 4.1' },
      { label: 'Keyword', value: 'ac repair' },
    ]);
    expect(detailLines(null)).toEqual([]);
    expect(detailLines({ offer: true })).toEqual([{ label: 'Offer', value: 'Yes' }]);
    expect(detailLines({ offer: false })).toEqual([]);
  });
  it('shows a Google page-one change as keyword, direction and position', () => {
    expect(detailLines({ changeType: 'rank_change', surface: 'organic', keyword: 'ac repair', direction: 'entered', position: 4 })).toEqual([
      { label: 'Keyword', value: 'ac repair' }, { label: 'Page one', value: 'Entered' }, { label: 'Position', value: '4' },
    ]);
    expect(detailLines({ surface: 'organic', keyword: 'ac repair', direction: 'left' })).toEqual([
      { label: 'Keyword', value: 'ac repair' }, { label: 'Page one', value: 'Left' },
    ]);
  });
  it('shows facts by their raw text', () => {
    expect(factView({ kind: 'price', before: { kind: 'price', value: 99, unit: 'USD', raw: '$99', context: '' }, after: { kind: 'price', value: 79, unit: 'USD', raw: '$79', context: '' }, pct: -20.2 }))
      .toEqual({ kind: 'price', before: '$99', after: '$79', pct: -20.2 });
  });
  it('labels Google posts as a source', () => {
    expect(sourceLabel('gbp_posts')).toBe('Google posts');
  });
  it('offers every change type but cosmetic as a filter', () => {
    const ids = changeTypeOptions().map((o) => o.id);
    expect(ids).toContain('price_change');
    expect(ids).not.toContain('cosmetic');
  });
});

describe('page-one Google changes read "Google search" (18b-2)', () => {
  it('labels a change by its surface, and a feed row maps its rank channel to google_search', () => {
    expect(changeChannelLabel('rank', { changeType: 'rank_change', surface: 'organic', keyword: 'ac repair', direction: 'entered' })).toBe('Google search');
    expect(changeChannelLabel('rank', { changeType: 'rank_change', keyword: 'ac repair' })).toBe('Local rankings');
    const base = {
      eventId: 'e', competitorId: 'c', competitorName: 'Smith HVAC', changeType: 'rank_change', channels: ['rank'], services: null, summary: 's', score: 50, route: 'brief',
      occurredAt: new Date('2026-11-08T06:00:00Z'), scoredAt: new Date('2026-11-08T06:00:00Z'), evidenceCount: 1,
    };
    expect(toEventRow({ ...base, surface: 'organic' }, 'hvac_plumbing', new Map()).channels).toEqual(['google_search']);
    expect(toEventRow({ ...base, surface: null }, 'hvac_plumbing', new Map()).channels).toEqual(['rank']);
    expect(channelLabel('google_search')).toBe('Google search');
  });
});
