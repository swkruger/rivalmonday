import { describe, expect, it } from 'vitest';
import { briefDue, briefPeriod, deliveryDateFor, localParts, safeTimezone } from './schedule';

const at = (iso: string) => new Date(iso);

describe('brief schedule', () => {
  it('reads local parts in the client time zone', () => {
    // 2026-10-02 05:30 UTC = Thursday 22:30 in Los Angeles (PDT, UTC-7)
    expect(localParts(at('2026-10-02T05:30:00Z'), 'America/Los_Angeles')).toEqual({ year: 2026, month: 10, day: 1, weekday: 4, hour: 22 });
  });

  it('is due on Thursday from 22:00 local until Friday noon', () => {
    expect(briefDue(at('2026-10-02T05:30:00Z'), 'America/Los_Angeles')).toBe(true); // Thu 22:30 PDT
    expect(briefDue(at('2026-10-02T04:30:00Z'), 'America/Los_Angeles')).toBe(false); // Thu 21:30 PDT
    expect(briefDue(at('2026-10-02T18:30:00Z'), 'America/Los_Angeles')).toBe(true); // Fri 11:30 PDT
    expect(briefDue(at('2026-10-02T19:30:00Z'), 'America/Los_Angeles')).toBe(false); // Fri 12:30 PDT
    expect(briefDue(at('2026-10-02T05:30:00Z'), 'America/New_York')).toBe(true); // Fri 01:30 EDT
  });

  it('delivers on the next local Monday', () => {
    expect(deliveryDateFor(at('2026-10-02T05:30:00Z'), 'America/Los_Angeles')).toBe('2026-10-05');
    expect(deliveryDateFor(at('2026-10-02T18:30:00Z'), 'America/Los_Angeles')).toBe('2026-10-05');
    expect(deliveryDateFor(at('2026-10-05T12:00:00Z'), 'America/Chicago')).toBe('2026-10-12'); // a Monday → the next one
  });

  it('handles the November DST change', () => {
    // Thu 2026-10-29 22:30 CDT = 03:30 UTC Fri; Thu 2026-11-05 22:30 CST = 04:30 UTC Fri
    expect(briefDue(at('2026-10-30T03:30:00Z'), 'America/Chicago')).toBe(true);
    expect(briefDue(at('2026-11-06T04:30:00Z'), 'America/Chicago')).toBe(true);
    expect(deliveryDateFor(at('2026-11-06T04:30:00Z'), 'America/Chicago')).toBe('2026-11-09');
  });

  it('falls back to the default zone for a bad value', () => {
    expect(safeTimezone('Mars/Olympus')).toBe('America/Chicago');
    expect(safeTimezone(null)).toBe('America/Chicago');
    expect(safeTimezone('Europe/London')).toBe('Europe/London');
  });

  it('periods start at the previous brief end, clamped to 1–14 days', () => {
    const now = at('2026-10-02T04:00:00Z');
    expect(briefPeriod(now, null).start).toEqual(at('2026-09-25T04:00:00Z'));
    expect(briefPeriod(now, at('2026-09-25T03:00:00Z')).start).toEqual(at('2026-09-25T03:00:00Z'));
    expect(briefPeriod(now, at('2026-08-01T00:00:00Z')).start).toEqual(at('2026-09-18T04:00:00Z'));
    expect(briefPeriod(now, at('2026-10-01T23:00:00Z')).start).toEqual(at('2026-10-01T04:00:00Z'));
    expect(briefPeriod(now, null).end).toEqual(now);
  });
});
