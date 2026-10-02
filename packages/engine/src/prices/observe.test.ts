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

  it('handles repeated prices and classifies by correct position in text', () => {
    expect(amounts('AC tune-up $89. Repairs get $89 off this month.')).toEqual([[89, 'USD', 'exact', false]]);
  });

  it('excludes discounts with optional modifiers before discount keywords', () => {
    expect(amounts('$50 instant rebate on heat pumps')).toEqual([]);
    expect(amounts('$500 trade-in credit toward a new system')).toEqual([]);
    expect(amounts('Receive $100 back with a maintenance plan')).toEqual([]);
  });

  it('distinguishes off-peak from off discount', () => {
    expect(amounts('Service calls $75 off-peak, $95 evenings')).toEqual([[75, 'USD', 'exact', false], [95, 'USD', 'exact', false]]);
  });

  it('never treats a coupon, voucher or gift card face value as a price', () => {
    expect(amounts('AC tune-up $89. Print this $25 coupon!')).toEqual([[89, 'USD', 'exact', true]]);
    expect(amounts('use our $50 voucher')).toEqual([]);
    expect(amounts('Get a $100 gift card with any install')).toEqual([]);
    expect(amounts('$50-off coupon')).toEqual([]);
  });

  it('detects promo when discount keyword appears after price', () => {
    expect(amounts('Starting at $89 — book online and save time')).toEqual([[89, 'USD', 'from', true]]);
  });

  it('advances cursor for skipped discounts to avoid re-resolving later prices', () => {
    expect(amounts('$89 off this month. Tune-up $89.')).toEqual([[89, 'USD', 'exact', false]]);
    expect(amounts('Save $89 today. Our tune-up is $89.')).toEqual([[89, 'USD', 'exact', true]]);
  });
});
