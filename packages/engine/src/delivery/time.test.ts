import { describe, expect, it } from 'vitest';
import { addDays, localClock, parseHhmm, quietUntil, zonedTimeToUtc } from './time';

describe('local time', () => {
  it('reads the local clock in a zone', () => {
    // 2026-10-06 06:30 UTC = Mon 2026-10-05 23:30 PDT
    expect(localClock(new Date('2026-10-06T06:30:00Z'), 'America/Los_Angeles')).toEqual({ date: '2026-10-05', hour: 23, minute: 30, weekday: 1 });
  });

  it('converts a local wall time to UTC on both sides of the November DST change', () => {
    expect(zonedTimeToUtc('2026-10-26', '07:00', 'America/Chicago').toISOString()).toBe('2026-10-26T12:00:00.000Z'); // CDT, UTC-5
    expect(zonedTimeToUtc('2026-11-02', '07:00', 'America/Chicago').toISOString()).toBe('2026-11-02T13:00:00.000Z'); // CST, UTC-6
    expect(zonedTimeToUtc('2026-07-01', '00:00', 'America/New_York').toISOString()).toBe('2026-07-01T04:00:00.000Z');
  });

  it('adds days to a calendar date across a month end', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-10-05', -6)).toBe('2026-09-29');
  });

  it('parses HH:MM and rejects anything else', () => {
    expect(parseHhmm('07:00')).toBe(420);
    expect(parseHhmm('23:59')).toBe(1439);
    expect(parseHhmm('24:00')).toBeNull();
    expect(parseHhmm('7am')).toBeNull();
  });
});

describe('quiet hours', () => {
  const night = { start: '21:00', end: '07:00' };
  it('defers to the end of a window that wraps midnight, in the recipient zone', () => {
    // 23:30 PDT Monday → 07:00 PDT Tuesday = 14:00 UTC
    expect(quietUntil(new Date('2026-10-06T06:30:00Z'), 'America/Los_Angeles', night)?.toISOString()).toBe('2026-10-06T14:00:00.000Z');
    // 05:00 PDT Tuesday (still quiet, after midnight) → 07:00 the same day
    expect(quietUntil(new Date('2026-10-06T12:00:00Z'), 'America/Los_Angeles', night)?.toISOString()).toBe('2026-10-06T14:00:00.000Z');
  });

  it('is null outside the window, without a window, or with a malformed one', () => {
    expect(quietUntil(new Date('2026-10-06T15:00:00Z'), 'America/Los_Angeles', night)).toBeNull(); // 08:00 PDT
    expect(quietUntil(new Date('2026-10-06T06:30:00Z'), 'America/Los_Angeles', null)).toBeNull();
    expect(quietUntil(new Date('2026-10-06T06:30:00Z'), 'America/Los_Angeles', { start: 'late', end: '07:00' })).toBeNull();
    expect(quietUntil(new Date('2026-10-06T06:30:00Z'), 'America/Los_Angeles', { start: '07:00', end: '07:00' })).toBeNull();
  });

  it('handles a daytime window that does not wrap', () => {
    const lunch = { start: '12:00', end: '13:00' };
    expect(quietUntil(new Date('2026-10-05T17:30:00Z'), 'America/Chicago', lunch)?.toISOString()).toBe('2026-10-05T18:00:00.000Z'); // 12:30 CDT → 13:00 CDT
    expect(quietUntil(new Date('2026-10-05T16:30:00Z'), 'America/Chicago', lunch)).toBeNull(); // 11:30 CDT
  });
});
