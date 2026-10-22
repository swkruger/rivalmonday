import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatRelative, formatWeekOf } from './date';

const now = new Date('2026-10-21T15:00:00Z');

describe('formatDate', () => {
  it('omits the current year in the given zone', () => {
    expect(formatDate('2026-10-13T12:00:00Z', { tz: 'UTC', now })).toBe('Oct 13');
    // 2026-01-01T03:00Z is still 2025 in Chicago, so the year shows there but not in UTC.
    expect(formatDate('2026-01-01T03:00:00Z', { tz: 'America/Chicago', now })).toBe('Dec 31, 2025');
    expect(formatDate('2026-01-01T03:00:00Z', { tz: 'UTC', now })).toBe('Jan 1');
  });
  it('shows the year for last year, or always when asked', () => {
    expect(formatDate('2025-10-13T12:00:00Z', { tz: 'UTC', now })).toBe('Oct 13, 2025');
    expect(formatDate('2026-10-13T12:00:00Z', { tz: 'UTC', now, withYear: 'always' })).toBe('Oct 13, 2026');
  });
  it('uses the zone day: 2026-10-20T04:30Z in America/Chicago is Oct 19', () => {
    expect(formatDate('2026-10-20T04:30:00Z', { tz: 'America/Chicago', now })).toBe('Oct 19');
  });
  it('treats a date-only value as that calendar day, and bad input as-is', () => {
    expect(formatDate('2026-10-13', { tz: 'America/Los_Angeles', now })).toBe('Oct 13');
    expect(formatDate('2026-Q3', { tz: 'UTC', now })).toBe('2026-Q3');
    expect(formatDate('2026-10-14T02:00:00.000Z', { tz: 'Not/AZone', now })).toBe('Oct 14');
    // Jan 1 02:00Z is still Dec 31 evening in Chicago, where "now" is 2026: a date-only 2026-12-31 shows no year.
    expect(formatDate('2026-12-31', { tz: 'America/Chicago', now: new Date('2027-01-01T02:00:00Z') })).toBe('Dec 31');
  });
});

describe('formatDateTime', () => {
  it('labels CT and UTC', () => {
    expect(formatDateTime('2026-10-21T14:00:00Z', { tz: 'America/Chicago', now })).toBe('Oct 21, 9:00 AM');
    expect(formatDateTime('2026-10-21T14:00:00Z', { tz: 'America/Chicago', zoneLabel: true, now })).toBe('Oct 21, 9:00 AM CT');
    expect(formatDateTime('2026-10-21T14:00:00Z', { tz: 'America/New_York', zoneLabel: true, now })).toBe('Oct 21, 10:00 AM ET');
    expect(formatDateTime('2026-10-21T14:00:00Z', { tz: 'Europe/London', zoneLabel: true, now })).not.toMatch(/United|GMT\+0/);
    expect(formatDateTime('2026-10-21T14:00:00Z', { tz: 'UTC', zoneLabel: true, now })).toBe('Oct 21, 2:00 PM UTC');
  });
});

describe('formatWeekOf', () => {
  it('returns the Monday in zone', () => {
    expect(formatWeekOf('2026-10-21T15:00:00Z', { tz: 'UTC', now })).toBe('Week of Oct 19');
    expect(formatWeekOf('2026-10-26T02:00:00Z', { tz: 'America/Chicago', now })).toBe('Week of Oct 19'); // still Sunday in Chicago
    expect(formatWeekOf('2026-10-19', { tz: 'UTC', now })).toBe('Week of Oct 19');
    expect(formatWeekOf('2025-10-21', { tz: 'UTC', now })).toBe('Week of Oct 20, 2025');
  });
});

describe('formatRelative', () => {
  const at = (ms: number) => new Date(now.getTime() - ms);
  const MIN = 60_000;
  it('buckets', () => {
    expect(formatRelative(at(30_000), now)).toBe('just now');
    expect(formatRelative(at(5 * MIN), now)).toBe('5 min ago');
    expect(formatRelative(at(180 * MIN), now)).toBe('3 h ago');
    expect(formatRelative(at(30 * 60 * MIN), now)).toBe('yesterday');
    expect(formatRelative(at(4 * 24 * 60 * MIN), now)).toBe('4 days ago');
    expect(formatRelative('2026-07-01T12:00:00Z', now)).toBe('Jul 1');
    expect(formatRelative(at(-30 * 60 * MIN), now)).toBe('tomorrow');
    expect(formatRelative(at(-3 * 24 * 60 * MIN - 1000), now)).toBe('in 3 days');
  });
});
