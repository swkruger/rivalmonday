import { describe, expect, it } from 'vitest';
import { groupByWeek } from './group';

describe('groupByWeek', () => {
  it('splits into this week, last week and earlier, dropping empty groups', () => {
    const now = new Date('2026-10-08T12:00:00Z');
    const at = (d: number) => ({ occurredAt: new Date(now.getTime() - d * 86_400_000).toISOString() });
    expect(groupByWeek([at(1), at(6), at(8), at(30)], now).map((g) => [g.label, g.items.length])).toEqual([['This week', 2], ['Last week', 1], ['Earlier', 1]]);
    expect(groupByWeek([at(20)], now).map((g) => g.label)).toEqual(['Earlier']);
  });
});
