import { describe, expect, it } from 'vitest';
import { formatDayRange } from './index';

describe('formatDayRange', () => {
  it('same day', () => expect(formatDayRange('2026-11-03T10:00:00Z', '2026-11-03T15:00:00Z', 'UTC')).toBe('Nov 3'));
  it('same month', () => expect(formatDayRange('2026-11-03T10:00:00Z', '2026-11-06T15:00:00Z', 'UTC')).toBe('Nov 3–6'));
  it('across months', () => expect(formatDayRange('2026-10-30T10:00:00Z', '2026-11-02T15:00:00Z', 'UTC')).toBe('Oct 30 – Nov 2'));
  it('tz shift', () => {
    expect(formatDayRange('2026-11-04T02:00:00Z', '2026-11-04T03:00:00Z', 'America/New_York')).toBe('Nov 3');
    expect(formatDayRange('2026-11-03T10:00:00Z', '2026-11-04T01:00:00Z', 'America/Los_Angeles')).toBe('Nov 3');
  });
});
