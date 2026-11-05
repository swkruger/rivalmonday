// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { breakEvenClients, PARTNER_COPY, PARTNER_EXAMPLE, partnerExample, partnerUpsell } from './partners';
import { agencyCostParts, PRICING } from './pricing';

describe('partnerExample', () => {
  it('10 × 199 = cost 782, revenue 1990, margin 1208', () => {
    expect(partnerExample(10, 199)).toEqual({ clients: 10, clientPriceUsd: 199, extraSeats: 7, costUsd: 782, revenueUsd: 1990, marginUsd: 1208 });
  });
  it('graduated cost: 3 → 229, 10 → 782, 11 → 841, 50 → 3,142', () => {
    expect([1, 3, 10, 11, 50].map((n) => partnerExample(n, 100).costUsd)).toEqual([229, 229, 782, 841, 3142]);
  });
  it('no extra seats at or below the included seats', () => {
    expect(partnerExample(PRICING.agency.seatsIncluded, 100).extraSeats).toBe(0);
    expect(partnerExample(PRICING.agency.seatsIncluded + 1, 100).costUsd).toBe(PRICING.agency.monthlyUsd + 79);
  });
  it('cost breakdown lists each tier used', () => {
    expect(agencyCostParts(2)).toEqual([]);
    expect(agencyCostParts(11)).toEqual([{ count: 7, usd: 79 }, { count: 1, usd: 59 }]);
    expect(agencyCostParts(50)).toEqual([{ count: 7, usd: 79 }, { count: 40, usd: 59 }]);
  });
  it('rejects zero clients', () => {
    expect(() => partnerExample(0, 199)).toThrow();
    expect(() => partnerExample(1.5, 199)).toThrow();
  });
  it('the starting example: 50 clients at $199, 20% buying a $999 upsell', () => {
    const e = partnerExample(PARTNER_EXAMPLE.clients, PARTNER_EXAMPLE.clientPriceUsd);
    expect(e).toMatchObject({ clients: 50, extraSeats: 47, costUsd: 3142, revenueUsd: 9950, marginUsd: 6808 });
    expect(partnerUpsell(e, PARTNER_EXAMPLE.upsellSharePct, PARTNER_EXAMPLE.upsellPriceUsd)).toEqual({ upsellClients: 10, upsellRevenueUsd: 9990, totalUsd: 16798 });
  });
  it('upsell clients round to whole clients, and no share means no upsell revenue', () => {
    expect(partnerUpsell(partnerExample(7, 199), 25, 999).upsellClients).toBe(2);
    expect(partnerUpsell(partnerExample(50, 199), 0, 999)).toMatchObject({ upsellRevenueUsd: 0, totalUsd: 6808 });
  });
  it('break-even is the first client count with no loss', () => {
    expect(partnerExample(1, 199).marginUsd).toBeLessThan(0);
    expect(breakEvenClients(199)).toBe(2);
    expect(partnerExample(2, 199).marginUsd).toBe(169);
    expect(breakEvenClients(300)).toBe(1);
  });
  it('no affiliate or commission wording', () => {
    expect(JSON.stringify(PARTNER_COPY)).not.toMatch(/affiliate|commission|referral fee/i);
  });
});
