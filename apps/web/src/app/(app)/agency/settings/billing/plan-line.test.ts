import { describe, expect, it } from 'vitest';
import { planLine } from './plan-line';

const plan = { basePriceCents: 22900, basePriceYearCents: 229000, includedSeats: 3 };

describe('planLine', () => {
  it('renders ranged, single-client and open tiers', () => {
    const tiers = [{ fromClient: 4, toClient: 4, unitCents: 9900 }, { fromClient: 5, toClient: 10, unitCents: 7900 }, { fromClient: 11, toClient: null, unitCents: 5900 }];
    expect(planLine(plan, tiers, 'month')).toBe('$229/mo · 3 clients included · clients 4: $99 each · clients 5–10: $79 each · clients 11+: $59 each');
  });
  it('yearly replaces the base with the yearly price', () => {
    expect(planLine(plan, [{ fromClient: 4, toClient: null, unitCents: 9900 }], 'year')).toBe('$2,290/yr · 3 clients included · clients 4+: $99 each');
  });
});
