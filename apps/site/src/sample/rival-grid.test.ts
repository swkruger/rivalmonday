// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { weekStats } from '../components/sample/rank-map';
import { RIVAL_GRID, rivalRanks } from './rival-grid';
import { SAMPLE } from './schema';

/**
 * The homepage §2 rival story (spec D13, `scripts/rival-rank-story.mjs`): Quillstone Climate Pros holds 8 top-3 points
 * near its own base, then on 2026-10-13 spreads over Northwind's ringed centre to 31 (evidence e2 / e1). Fictional.
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

  it('holds 8 (±1) near its base for ten weeks, exactly 8 in week 1 and on 2026-10-06, then 31 on 10-13 and 10-20', () => {
    expect(counts[0]).toBe(8);
    for (let i = 0; i < 10; i++) expect(Math.abs(counts[i]! - 8), `week ${i + 1}`).toBeLessThanOrEqual(1);
    expect(weekStats(rivalRanks('2026-10-06')).top3).toBe(8);
    expect(weekStats(rivalRanks('2026-10-13')).top3).toBe(31);
    expect(weekStats(rivalRanks('2026-10-20')).top3).toBe(31);
  });

  it('keeps each cell steady week to week (no flicker) inside the quiet stretch', () => {
    for (let w = 1; w < 10; w++) {
      const a = RIVAL_GRID.weeks[w - 1]!.ranks, b = RIVAL_GRID.weeks[w]!.ranks;
      for (let i = 0; i < a.length; i++) expect(Math.abs(a[i]! - b[i]!), `week ${w + 1} cell ${i}`).toBeLessThanOrEqual(1);
    }
  });

  it('agrees with the rival rank evidence e1 and e2', () => {
    for (const [id, n] of [['e1', 31], ['e2', 8]] as const) {
      const ev = SAMPLE.evidence[id]!;
      expect(ev.kind === 'rank' && ev.summary).toBe(`Quillstone Climate Pros: top 3 in ${n} of 49 points`);
      expect(weekStats(rivalRanks(ev.kind === 'rank' ? ev.weekOf : '')).top3).toBe(n);
    }
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
    expect(RIVAL_GRID.weeks[9]!.ranks[centre]!).toBeGreaterThan(3);
    expect(rivalRanks('2026-10-13')[centre]!).toBeLessThanOrEqual(3);
    expect(last[centre]!).toBeLessThanOrEqual(3);
  });

  it('returns no ranks for an unknown week', () => {
    expect(rivalRanks('1999-01-01')).toEqual([]);
  });
});
