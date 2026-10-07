import { describe, expect, it } from 'vitest';
import { formatUsd, relativeTime } from './format';

const now = new Date('2026-10-05T12:00:00Z');
describe('relativeTime', () => {
  it('reads naturally', () => {
    expect(relativeTime(null, now)).toBe('No activity yet');
    expect(relativeTime('2026-10-05T11:59:30Z', now)).toBe('Just now');
    expect(relativeTime('2026-10-05T09:00:00Z', now)).toBe('3 hours ago');
    expect(relativeTime('2026-10-04T09:00:00Z', now)).toBe('Yesterday');
    expect(relativeTime('2026-09-28T12:00:00Z', now)).toBe('7 days ago');
    expect(relativeTime('2026-07-01T12:00:00Z', now)).toBe('1 Jul 2026');
  });
});

describe('formatUsd', () => {
  it('formats dollars with cents', () => {
    expect(formatUsd(8.5)).toBe('$8.50');
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(1234.567)).toBe('$1,234.57');
  });
});
