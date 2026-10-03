import { describe, expect, it } from 'vitest';
import { checkSentence, dateTokens, numberTokens, splitSentences } from './rules';

const ev = {
  text: '[web · 2026-09-30 · /pricing]\nBefore: "AC tune-up $89"\nAfter: "AC tune-up $69, offer ends Oct 31"\nNumbers: $89 → $69 (-22.5%)\nItems: 3 new Google ads',
  captureDates: [new Date('2026-09-30T06:00:00Z')], zips: ['75034'], competitorNames: ['Smith HVAC'],
};
const ctx = { trackedCompetitorNames: ['Smith HVAC', 'Bright Air'], clientTowns: ['Frisco', 'Plano'], year: 2026 };
const ok = (s: string) => checkSentence(s, ev, ctx).ok;

describe('splitSentences', () => {
  it('splits on sentence ends but not on decimals or abbreviations like "St."', () => {
    expect(splitSentences('Smith HVAC cut to $69.99. It runs 24/7! Visit 12 Main St. today?')).toEqual(['Smith HVAC cut to $69.99.', 'It runs 24/7!', 'Visit 12 Main St. today?']);
  });
});

describe('numbers', () => {
  it('normalises money, percents and plain numbers, ignoring dates and 24/7', () => {
    expect(numberTokens('$1,299.00 and 15% off, 3 ads, 24/7, on 9/28')).toEqual([{ kind: 'money', value: 1299 }, { kind: 'percent', value: 15 }, { kind: 'plain', value: 3 }]);
  });

  it('accepts numbers present in the evidence and honest percent rounding', () => {
    expect(ok('Smith HVAC cut its AC tune-up from $89 to $69.')).toBe(true);
    expect(ok('That is a 22% cut.')).toBe(true);
    expect(ok('That is a 23% cut.')).toBe(true);
    expect(ok('They launched 3 new Google ads.')).toBe(true);
  });

  it('rejects invented numbers', () => {
    expect(checkSentence('Smith HVAC now charges $59.', ev, ctx)).toEqual({ ok: false, reasons: ['number $59 is not in the evidence'] });
    expect(ok('That is a 30% cut.')).toBe(false);
    expect(ok('They launched 4 new ads.')).toBe(false);
  });

  it('allows the current year', () => {
    expect(ok('It is their first price cut of 2026.')).toBe(true);
  });
});

describe('dates', () => {
  it('reads month-day, numeric and ISO dates', () => {
    expect(dateTokens('Sept 28, 9/29 and 2026-10-01; Oct. 31st')).toEqual(['09-28', '09-29', '10-01', '10-31']);
  });

  it('accepts evidence dates and capture dates ±1 day, rejects others', () => {
    expect(ok('The offer ends Oct 31.')).toBe(true);
    expect(ok('The change appeared on Sept 30.')).toBe(true);
    expect(ok('The change appeared on October 1.')).toBe(true);
    expect(ok('The change appeared on Sept 20.')).toBe(false);
  });
});

describe('geography and names', () => {
  it('requires geographic evidence for ZIPs, client towns and targeting claims', () => {
    expect(ok('They now mention 75034.')).toBe(true);
    expect(ok('They now mention 75035.')).toBe(false);
    expect(ok('The ads target Frisco homeowners.')).toBe(false);
    expect(ok('They are expanding into Plano.')).toBe(false);
  });

  it('rejects a sentence naming a tracked competitor that is not cited', () => {
    expect(ok('Smith HVAC is undercutting you.')).toBe(true);
    expect(ok('Bright Air did the same last month.')).toBe(false);
  });
});
