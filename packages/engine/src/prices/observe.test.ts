import { describe, expect, it } from 'vitest';
import { pricesInBlock } from './observe';

const amounts = (text: string) => pricesInBlock(text).map((p) => [p.amount, p.unit, p.qualifier, p.promo]);

describe('pricesInBlock', () => {
  it('keeps service prices with their unit and qualifier', () => {
    expect(amounts('AC tune-up starting at $89 per system')).toEqual([[89, 'USD/system', 'from', false]]);
    expect(amounts('Water heaters up to $2,400 installed')).toEqual([[2400, 'USD', 'up_to', false]]);
    expect(amounts('Tune-up $89, repairs from $149')).toEqual([[89, 'USD', 'exact', false], [149, 'USD', 'from', false]]);
    expect(amounts('Spring special: AC tune-up only $69!')).toEqual([[69, 'USD', 'exact', true]]);
  });

  it('never treats a discount, rebate, credit or deposit as a price', () => {
    expect(amounts('$50 off any repair this month')).toEqual([]);
    expect(amounts('Save $25 on your first visit')).toEqual([]);
    expect(amounts('Save up to $500 on a new system')).toEqual([]);
    expect(amounts('Up to $1,500 rebate on new systems')).toEqual([]);
    expect(amounts('$0 down financing available')).toEqual([]);
    expect(amounts('Get a $100 credit toward installation')).toEqual([]);
  });

  it('ignores non-prices, absurd amounts and repeats within a block', () => {
    expect(amounts('Call (972) 555-0100 — 25 years in business')).toEqual([]);
    expect(amounts('Commercial projects over $250,000')).toEqual([]);
    expect(amounts('Drain cleaning $129 — yes, $129 flat')).toEqual([[129, 'USD', 'exact', false]]);
  });
});
