import { describe, expect, it } from 'vitest';
import { claimViolations } from './claims';

const ev = (text: string, o: { competitorNames?: string[]; bait?: string[] } = {}) => ({ text, competitorNames: o.competitorNames ?? [], bait: o.bait ?? [] });

describe('claimViolations', () => {
  it('$1,299.00 matches 1299 in evidence', () => {
    expect(claimViolations('The new system now costs $1,299.00.', ev('After: "Install from $1299"'))).toEqual([]);
  });

  it('15 % matches 14.6% (rounded percent)', () => {
    expect(claimViolations('Prices fell about 15 % this week.', ev('Numbers: $89 → $76 (-14.6%)'))).toEqual([]);
    expect(claimViolations('Prices fell about 16 % this week.', ev('Numbers: $89 → $76 (-14.6%)'))).toEqual([{ kind: 'number', token: '16 %' }]);
  });

  it('33 % matches 33.7% (truncated percent)', () => {
    expect(claimViolations('They cut the price by 33 %.', ev('Numbers: $89 → $59 (-33.7%)'))).toEqual([]);
  });

  it('32 % does not match 33.7%', () => {
    expect(claimViolations('They cut the price by 32 %.', ev('Numbers: $89 → $59 (-33.7%)'))).toEqual([{ kind: 'number', token: '32 %' }]);
  });

  it("a number only in another candidate's evidence is a violation", () => {
    // Per-item checks pass only that item's own evidence: $49 lives in the other candidate.
    const own = ev('Event: AC tune-up price changed\nBefore: "AC tune-up $89"\nAfter: "AC tune-up $69"');
    expect(claimViolations('Smith HVAC now charges $49 for drain cleaning.', own)).toEqual([{ kind: 'number', token: '49' }]);
  });

  it('Oct 5 matches 2026-10-05', () => {
    expect(claimViolations('The offer started Oct 5.', ev('[web · 2026-10-05 · /]\nAdded: "Fall special"'))).toEqual([]);
    expect(claimViolations('The offer started Oct 6.', ev('[web · 2026-10-05 · /]'))).toEqual([{ kind: 'date', token: '10-06' }]);
    expect(claimViolations('The offer started 10/5.', ev('[web · 2026-10-05 · /]'))).toEqual([]);
  });

  it('competitor name match is case-insensitive', () => {
    const e = ev('Event: Smith HVAC cut prices', { competitorNames: ['Smith HVAC', 'Acme Plumbing'] });
    expect(claimViolations('SMITH hvac cut prices.', e)).toEqual([]);
    expect(claimViolations('acme plumbing cut prices too.', e)).toEqual([{ kind: 'name', token: 'Acme Plumbing' }]);
  });

  it('bait in summary is caught', () => {
    const e = ev('Event: Smith HVAC added duct cleaning', { bait: ['four new branches'] });
    expect(claimViolations('Smith HVAC added duct cleaning and plans Four New Branches.', e)).toEqual([{ kind: 'bait', token: 'four new branches' }]);
  });

  it('a date is not also read as numbers', () => {
    expect(claimViolations('Seen on 2026-10-05 and Oct 5, 2026.', ev('[web · 2026-10-05 · /]'))).toEqual([]);
  });
});
