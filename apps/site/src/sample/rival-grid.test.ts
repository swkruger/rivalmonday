// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { weekStats } from '../components/sample/rank-map';
import { RIVAL_GRID, rivalRanks } from './rival-grid';
import { SAMPLE } from './schema';

/**
 * The homepage §2 rival story (spec D13, `scripts/rival-rank-story.mjs`): Quillstone Climate Pros climbs from 8 to 31
 * top-3 points, spreading from its own base towards Northwind's ringed centre. Fictional sample data.
 */
describe('rival rank story', () => {
  const { size, weeks } = SAMPLE.rankGrid;
  const counts = RIVAL_GRID.weeks.map((w) => weekStats(w.ranks).top3);

  it('is the sample rival r1 over the same 12 weeks, 49 ranked cells each', () => {
    expect(RIVAL_GRID.rivalId).toBe('r1');
    expect(SAMPLE.rivals.find((r) => r.id === RIVAL_GRID.rivalId)?.name).toBe('Quillstone Climate Pros');
    expect(RIVAL_GRID.weeks.map((w) => w.weekOf)).toEqual(weeks.map((w) => w.weekOf));
    for (const w of RIVAL_GRID.weeks) {
      expect(w.ranks).toHaveLength(size * size);
      expect(weekStats(w.ranks).points).toBe(49);
    }
  });

  it('climbs from 8 in week 1 to 31 in the weeks of 2026-10-13 and 2026-10-20, never dropping by more than one', () => {
    expect(counts[0]).toBe(8);
    expect(weekStats(rivalRanks('2026-10-13')).top3).toBe(31);
    expect(weekStats(rivalRanks('2026-10-20')).top3).toBe(31);
    for (let i = 1; i < counts.length; i++) expect(counts[i]!, `week ${i + 1}`).toBeGreaterThanOrEqual(counts[i - 1]! - 1);
  });

  it('agrees with the rival rank evidence e1', () => {
    const e1 = SAMPLE.evidence.e1!;
    expect(e1.kind === 'rank' && e1.summary).toBe('Quillstone Climate Pros: top 3 in 31 of 49 points');
    expect(weekStats(rivalRanks(e1.kind === 'rank' ? e1.weekOf : '')).top3).toBe(31);
  });

  it('starts off-centre and closes in on the ringed centre', () => {
    const centre = Math.floor((size * size) / 2);
    const top3At = (ranks: (number | null)[]) => ranks.flatMap((r, i) => (r !== null && r <= 3 ? [i] : []));
    const dist = (i: number) => Math.hypot(Math.floor(i / size) - 3, (i % size) - 3);
    const meanDist = (ranks: (number | null)[]) => {
      const cells = top3At(ranks);
      return cells.reduce((a, i) => a + dist(i), 0) / cells.length;
    };
    const first = RIVAL_GRID.weeks[0]!.ranks;
    const last = RIVAL_GRID.weeks.at(-1)!.ranks;
    expect(first[centre]!).toBeGreaterThan(3);
    expect(meanDist(first)).toBeGreaterThan(2.5);
    expect(meanDist(last)).toBeLessThan(meanDist(first));
    expect(last[centre]!).toBeLessThanOrEqual(3);
  });

  it('returns no ranks for an unknown week', () => {
    expect(rivalRanks('1999-01-01')).toEqual([]);
  });
});
