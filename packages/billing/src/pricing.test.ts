import { describe, expect, it } from 'vitest';
import { describeTiers, monthlyEquivalentCents, planCents, seatCents, seatTiersSchema, STANDARD_V2, type SeatTier } from './pricing';

const v2 = STANDARD_V2;
const v1 = { basePriceCents: 22900, basePriceYearCents: null, includedSeats: 3, seatTiers: [{ upTo: null, unitCents: 9900 }] as SeatTier[] };

describe('seatCents', () => {
  it('is graduated', () => {
    expect(seatCents(v2.seatTiers, 0)).toBe(0);
    expect(seatCents(v2.seatTiers, 7)).toBe(55300);
    expect(seatCents(v2.seatTiers, 8)).toBe(61200);
  });
});

describe('planCents', () => {
  it('monthly', () => {
    expect(planCents(v2, 3, 'month')).toBe(22900);
    expect(planCents(v2, 10, 'month')).toBe(78200);
    expect(planCents(v2, 11, 'month')).toBe(84100);
    expect(planCents(v1, 10, 'month')).toBe(92200);
  });
  it('yearly', () => {
    expect(planCents(v2, 1, 'year')).toBe(229000);
    expect(planCents(v2, 4, 'year')).toBe(229000 + 94800);
  });
  it('throws for year without a yearly base', () => {
    expect(() => planCents(v1, 4, 'year')).toThrow();
  });
});

describe('monthlyEquivalentCents', () => {
  it('divides yearly by 12', () => {
    expect(monthlyEquivalentCents(229000, 'year')).toBe(19083);
    expect(monthlyEquivalentCents(22900, 'month')).toBe(22900);
  });
});

describe('describeTiers', () => {
  it('lists client ranges', () => {
    expect(describeTiers(3, v2.seatTiers)).toEqual([
      { fromClient: 4, toClient: 10, unitCents: 7900 },
      { fromClient: 11, toClient: null, unitCents: 5900 },
    ]);
  });
});

describe('seatTiersSchema', () => {
  it('accepts v2', () => expect(seatTiersSchema.safeParse(v2.seatTiers).success).toBe(true));
  it('caps a tier at 8,333,333 cents (12 x stays within Stripe 99,999,999)', () => {
    expect(seatTiersSchema.safeParse([{ upTo: null, unitCents: 8_333_333 }]).success).toBe(true);
    expect(seatTiersSchema.safeParse([{ upTo: null, unitCents: 8_333_334 }]).success).toBe(false);
  });
  it('rejects bad lists', () => {
    expect(seatTiersSchema.safeParse([{ upTo: 7, unitCents: 1 }, { upTo: 5, unitCents: 1 }, { upTo: null, unitCents: 1 }]).success).toBe(false);
    expect(seatTiersSchema.safeParse([{ upTo: null, unitCents: 1 }, { upTo: null, unitCents: 1 }]).success).toBe(false);
    expect(seatTiersSchema.safeParse([]).success).toBe(false);
    const six = [1, 2, 3, 4, 5].map((n) => ({ upTo: n, unitCents: 1 })).concat([{ upTo: null as never, unitCents: 1 }]);
    expect(seatTiersSchema.safeParse(six).success).toBe(false);
  });
});
