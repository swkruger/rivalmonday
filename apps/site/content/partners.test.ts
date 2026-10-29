// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PARTNER_COPY, partnerExample } from './partners';
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
  it('no affiliate or commission wording', () => {
    expect(JSON.stringify(PARTNER_COPY)).not.toMatch(/affiliate|commission|referral fee/i);
  });
});
