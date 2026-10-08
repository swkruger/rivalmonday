import { describe, expect, it } from 'vitest';
import { changeTypeOptions, channelLabel, detailLines, factView } from './labels';

describe('workspace labels', () => {
  it('labels channels and falls back to a humanised key', () => {
    expect(channelLabel('meta_ads')).toBe('Meta ads');
    expect(channelLabel('some_new_thing')).toBe('Some new thing');
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
  it('shows facts by their raw text', () => {
    expect(factView({ kind: 'price', before: { kind: 'price', value: 99, unit: 'USD', raw: '$99', context: '' }, after: { kind: 'price', value: 79, unit: 'USD', raw: '$79', context: '' }, pct: -20.2 }))
      .toEqual({ kind: 'price', before: '$99', after: '$79', pct: -20.2 });
  });
  it('offers every change type but cosmetic as a filter', () => {
    const ids = changeTypeOptions().map((o) => o.id);
    expect(ids).toContain('price_change');
    expect(ids).not.toContain('cosmetic');
  });
});
