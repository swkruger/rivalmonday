import { describe, expect, it } from 'vitest';
import { eventKey, localDate, nameTokens, normaliseEventName, panelDate } from './normalise';

const CHICAGO = 'America/Chicago';

describe('normaliseEventName', () => {
  it('drops dates, times, years, stop words and punctuation', () => {
    expect(normaliseEventName('Jason Isbell & The 400 Unit — Fri Nov 13, 2026 8:00 PM')).toBe('jason isbell 400 unit');
  });

  it('drops marketing filler words', () => {
    expect(normaliseEventName('LIVE: Trivia Night!')).toBe('trivia');
  });

  it('strips apostrophes and accents', () => {
    expect(normaliseEventName("Chef’s Table café")).toBe('chefs table cafe');
  });

  it('falls back to the alphanumeric original when every word is a stop word', () => {
    expect(normaliseEventName('Live & Show!')).toBe('live and show');
  });

  it('returns an empty string for an empty name', () => {
    expect(normaliseEventName('')).toBe('');
  });
});

describe('nameTokens and eventKey', () => {
  it('returns unique tokens of a normalised name', () => {
    expect(nameTokens('jason isbell 400 unit')).toEqual(['jason', 'isbell', '400', 'unit']);
    expect(nameTokens('trivia trivia')).toEqual(['trivia']);
  });

  it('builds a stable key from the start date and normalised name', () => {
    expect(eventKey('trivia', '2026-11-13')).toBe('2026-11-13:trivia');
    expect(eventKey(normaliseEventName('LIVE: Trivia Night!'), '2026-11-13')).toBe(eventKey('trivia', '2026-11-13'));
  });

  it('truncates the name part of the key to 120 characters', () => {
    const long = 'a'.repeat(200);
    expect(eventKey(long, '2026-11-13')).toBe(`2026-11-13:${'a'.repeat(120)}`);
  });
});

describe('localDate', () => {
  it('gives the calendar date of an instant in a zone', () => {
    expect(localDate(new Date('2027-01-01T05:30:00Z'), CHICAGO)).toBe('2026-12-31');
    expect(localDate(new Date('2026-11-14T02:00:00Z'), CHICAGO)).toBe('2026-11-13');
  });
});

describe('panelDate', () => {
  // 2026-11-11 13:00 Chicago (CST, UTC-6)
  const nov11 = new Date('2026-11-11T19:00:00Z');

  it('resolves a weekday, month, day and time in the capture zone', () => {
    expect(panelDate('Fri, Nov 13, 8:00 PM', nov11, CHICAGO)).toEqual({
      startDate: '2026-11-13',
      startsAt: '2026-11-14T02:00:00.000Z',
    });
  });

  it('returns startsAt null when the subtitle has no time', () => {
    expect(panelDate('Fri, Nov 13', nov11, CHICAGO)).toEqual({ startDate: '2026-11-13', startsAt: null });
  });

  it('rolls a past month/day into the next year', () => {
    const dec28 = new Date('2026-12-28T18:00:00Z');
    expect(panelDate('Sat, Jan 2', dec28, CHICAGO)).toEqual({ startDate: '2027-01-02', startsAt: null });
  });

  it('returns null when the weekday does not match either candidate year', () => {
    expect(panelDate('Fri, Jan 2', nov11, CHICAGO)).toBeNull();
  });

  it('keeps the local date near midnight in the capture zone', () => {
    // 2026-12-31 23:30 Chicago is 2027-01-01 05:30 UTC
    const lateNye = new Date('2027-01-01T05:30:00Z');
    expect(panelDate('Thu, Dec 31', lateNye, CHICAGO)).toEqual({ startDate: '2026-12-31', startsAt: null });
  });

  it('moves Feb 29 to the next leap year when the candidate year is not a leap year', () => {
    const mar2027 = new Date('2027-03-01T18:00:00Z');
    expect(panelDate('Tue, Feb 29', mar2027, CHICAGO)).toEqual({ startDate: '2028-02-29', startsAt: null });
  });

  it('returns null for text that is not a panel date', () => {
    expect(panelDate('hello world', nov11, CHICAGO)).toBeNull();
    expect(panelDate(null, nov11, CHICAGO)).toBeNull();
  });
});
