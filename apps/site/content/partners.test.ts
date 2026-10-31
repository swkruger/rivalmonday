// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { breakEvenClients, PARTNER_COPY, PARTNER_EXAMPLE, partnerExample, partnerUpsell } from './partners';
import { PRICING } from './pricing';

describe('partnerExample', () => {
  it('10 × 199 = cost 922, revenue 1990, margin 1068', () => {
    expect(partnerExample(10, 199)).toEqual({ clients: 10, clientPriceUsd: 199, extraSeats: 7, costUsd: 922, revenueUsd: 1990, marginUsd: 1068 });
    expect(PRICING.agency.monthlyUsd + 7 * PRICING.agency.extraSeatUsd).toBe(922);
  });
  it('no extra seats at or below the included seats', () => {
    expect(partnerExample(PRICING.agency.seatsIncluded, 100).extraSeats).toBe(0);
    expect(partnerExample(1, 100).costUsd).toBe(PRICING.agency.monthlyUsd);
    expect(partnerExample(PRICING.agency.seatsIncluded + 1, 100).costUsd).toBe(PRICING.agency.monthlyUsd + PRICING.agency.extraSeatUsd);
  });
  it('rejects zero clients', () => {
    expect(() => partnerExample(0, 199)).toThrow();
    expect(() => partnerExample(1.5, 199)).toThrow();
  });
  it('the starting example: 50 clients at $199, 20% buying a $999 upsell', () => {
    const e = partnerExample(PARTNER_EXAMPLE.clients, PARTNER_EXAMPLE.clientPriceUsd);
    expect(e).toMatchObject({ clients: 50, extraSeats: 47, costUsd: 4882, revenueUsd: 9950, marginUsd: 5068 });
    expect(partnerUpsell(e, PARTNER_EXAMPLE.upsellSharePct, PARTNER_EXAMPLE.upsellPriceUsd)).toEqual({ upsellClients: 10, upsellRevenueUsd: 9990, totalUsd: 15058 });
  });
  it('upsell clients round to whole clients, and no share means no upsell revenue', () => {
    expect(partnerUpsell(partnerExample(7, 199), 25, 999).upsellClients).toBe(2);
    expect(partnerUpsell(partnerExample(50, 199), 0, 999)).toMatchObject({ upsellRevenueUsd: 0, totalUsd: 5068 });
  });
  it('break-even is the first client count with no loss', () => {
    expect(partnerExample(1, 199).marginUsd).toBeLessThan(0);
    expect(breakEvenClients(199)).toBe(2);
    expect(breakEvenClients(300)).toBe(1);
  });
  it('no affiliate or commission wording', () => {
    expect(JSON.stringify(PARTNER_COPY)).not.toMatch(/affiliate|commission|referral fee/i);
  });
});
