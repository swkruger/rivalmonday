// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { weekStats } from '../components/sample/rank-map';
import { SAMPLE } from './schema';

/**
 * The sample's map rankings tell one story (hand-tuned in `sample-brief.json`; a re-export from `@cs/demo` would
 * overwrite it): week 1 only the business's own point is in the top 3, then the top 3 spreads outwards week by week.
 */
describe('sample rank story', () => {
  const { size, weeks } = SAMPLE.rankGrid;
  const centre = Math.floor((size * size) / 2);
  const ring = (i: number) => Math.max(Math.abs(Math.floor(i / size) - (size - 1) / 2), Math.abs((i % size) - (size - 1) / 2));

  it('starts with only the centre point in the top 3', () => {
    const first = weeks[0]!.you;
    expect(first[centre]).toBe(1);
    expect(weekStats(first).top3).toBe(1);
  });

  it('the top-3 count grows to the latest scan, never dropping by more than one', () => {
    const counts = weeks.map((w) => weekStats(w.you).top3);
    for (let i = 1; i < counts.length; i++) expect(counts[i]!, `week ${i + 1}`).toBeGreaterThanOrEqual(counts[i - 1]! - 1);
    expect(counts.at(-1)!).toBeGreaterThan(counts[0]! * 10);
  });

  it('ranks get better towards the centre in the first week', () => {
    const mean = (d: number) => {
      const r = weeks[0]!.you.filter((v, i) => v !== null && ring(i) === d) as number[];
      return r.reduce((a, b) => a + b, 0) / r.length;
    };
    expect(mean(1)).toBeLessThan(mean(2));
    expect(mean(2)).toBeLessThan(mean(3));
  });

  it('every "You:" rank summary matches its week of the grid', () => {
    const mine = Object.values(SAMPLE.evidence).filter((e) => e.kind === 'rank' && e.summary.startsWith('You:'));
    expect(mine).toHaveLength(weeks.length);
    for (const ev of mine) {
      if (ev.kind !== 'rank') continue;
      const week = weeks.find((w) => w.weekOf === ev.weekOf)!;
      const { top3, points } = weekStats(week.you);
      expect(ev.summary).toBe(`You: top 3 in ${top3} of ${points} points`);
    }
  });
});
