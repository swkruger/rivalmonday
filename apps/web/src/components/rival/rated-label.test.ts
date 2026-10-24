import { describe, expect, it } from 'vitest';
import { ratedLabel } from './rated-label';

describe('ratedLabel', () => {
  it('uses the client zone', () => {
    expect(ratedLabel('2026-10-13T02:00Z', 'America/Chicago')).toBe('Rated Oct 12');
    expect(ratedLabel('2026-10-13T02:00Z', 'UTC')).toBe('Rated Oct 13');
  });
});
