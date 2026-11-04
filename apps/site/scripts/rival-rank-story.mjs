/**
 * Builds the homepage §2 rival map story (spec D13): Quillstone Climate Pros' map rankings for the sample keyword over
 * the sample's 12 weeks. Its strength spreads from its own base (north-east, row 2 col 6) towards Northwind's ringed
 * centre: top 3 at 8 of 49 points in week 1, 31 of 49 in the last two weeks (the figure evidence `e1` cites).
 * Fictional sample data. Deterministic (seeded); `src/sample/rival-grid.test.ts` pins the shape.
 * Run: `node scripts/rival-rank-story.mjs content/sample-brief.json content/rival-grid.json write`.
 * Never touches `sample-brief.json` (its own grid is hand-tuned, see `sample-rank-story.mjs`).
 */
import { readFileSync, writeFileSync } from 'node:fs';
const [, , briefFile, outFile, mode] = process.argv;
const brief = JSON.parse(readFileSync(briefFile, 'utf8'));
const weekOfs = brief.rankGrid.weeks.map((w) => w.weekOf);
const size = 7, C = 3;
const BASE = { row: 1, col: 5 }; // the rival's office: off-centre, north-east of Northwind
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
function build(seed) {
  const r = rng(seed);
  const cellOff = Array.from({ length: size * size }, () => r()); // per-cell character, no week-to-week flicker
  return weekOfs.map((_, wi) => {
    const p = Math.min(1, wi / 10); // the push is over by week 11 (10-13); the last week holds
    // The front's centre drifts from the rival's base towards the ring while its reach grows.
    const fr = BASE.row + (C - BASE.row) * 0.7 * p, fc = BASE.col + (C - BASE.col) * 0.7 * p;
    const reach = 1.2 + p * 1.5;
    return Array.from({ length: size * size }, (_, i) => {
      const row = Math.floor(i / size), col = i % size;
      const d = Math.hypot(row - fr, col - fc);
      const base = 1 + cellOff[i] * 1.8 + (r() - 0.5) * 0.6;
      const pen = Math.max(0, d - reach) * 3.2;
      const v = Math.max(1, Math.round(base + pen));
      return v > 20 ? 21 : v;
    });
  });
}
const top3 = (a) => a.filter((x) => x !== null && x <= 3).length;
let seed = 1, weeks;
for (; seed < 20000; seed++) {
  weeks = build(seed);
  const t = weeks.map(top3);
  const mono = t.every((v, i) => i === 0 || v >= t[i - 1] - 1);
  if (t[0] === 8 && t[10] === 31 && t[11] === 31 && mono && t[9] < 31) break;
}
if (seed >= 20000) throw new Error('no seed fits the story');
console.log('seed', seed, weeks.map(top3).join(' '));
for (const w of [0, 5, 11]) { console.log('week', w + 1); for (let r = 0; r < size; r++) console.log(weeks[w].slice(r * size, r * size + size).map((x) => String(x).padStart(3)).join('')); }
const out = { rivalId: 'r1', weeks: weekOfs.map((weekOf, wi) => ({ weekOf, ranks: weeks[wi] })) };
if (mode === 'write') writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n');
