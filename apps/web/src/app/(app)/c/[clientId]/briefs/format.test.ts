import { describe, expect, it } from 'vitest';
import { formatDay } from './format';

describe('formatDay (15a list rows, "Oct 13, 2026")', () => {
  it('formats a date-only value as that calendar day, whatever the time zone', () => {
    expect(formatDay('2026-10-13')).toBe('Oct 13, 2026');
    expect(formatDay('2026-10-13', 'America/Los_Angeles')).toBe('Oct 13, 2026');
  });

  it('formats a timestamp in the given time zone (UTC by default)', () => {
    expect(formatDay('2026-10-14T02:00:00.000Z')).toBe('Oct 14, 2026');
    expect(formatDay('2026-10-14T02:00:00.000Z', 'America/Chicago')).toBe('Oct 13, 2026');
  });

  it('falls back to UTC for an unknown time zone and returns the raw text when it is not a date', () => {
    expect(formatDay('2026-10-14T02:00:00.000Z', 'Not/AZone')).toBe('Oct 14, 2026');
    expect(formatDay('2026-Q3')).toBe('2026-Q3');
  });
});
