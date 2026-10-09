import { describe, expect, it } from 'vitest';
import { createClock, DAY } from './clock';
import { DEMO_SEED, hashString, Rng } from './random';

describe('Rng', () => {
  it('replays the same sequence for the same seed and differs per area', () => {
    const a = new Rng(DEMO_SEED ^ hashString('reviews'));
    const b = new Rng(DEMO_SEED ^ hashString('reviews'));
    const c = new Rng(DEMO_SEED ^ hashString('ads'));
    const seq = (r: Rng) => Array.from({ length: 5 }, () => r.next());
    const first = seq(a);
    expect(seq(b)).toEqual(first);
    expect(seq(c)).not.toEqual(first);
  });

  it('keeps int() inside its bounds', () => {
    const r = new Rng(1);
    for (let i = 0; i < 500; i++) {
      const v = r.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });
});

describe('createClock', () => {
  it('puts the next delivery Monday after today and four past Mondays a week apart', () => {
    const c = createClock(new Date('2026-10-09T15:00:00Z')); // a Friday
    expect(c.nextMonday).toBe('2026-10-12');
    expect(c.pastMondays).toEqual(['2026-10-05', '2026-09-28', '2026-09-21', '2026-09-14']);
    expect(c.daysAgo(2).getTime()).toBe(new Date('2026-10-09T15:00:00Z').getTime() - 2 * DAY);
    expect(c.monthStart.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('treats a Monday as a past delivery day, not the next one', () => {
    const c = createClock(new Date('2026-10-12T09:00:00Z'));
    expect(c.nextMonday).toBe('2026-10-19');
    expect(c.pastMondays[0]).toBe('2026-10-12');
  });
});
