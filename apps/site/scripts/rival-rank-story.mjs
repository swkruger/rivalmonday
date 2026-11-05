/**
 * Builds the homepage §2 rival map story (spec D13): Quillstone Climate Pros' map rankings for the sample keyword over
 * the sample's 12 weeks, agreeing with the sample evidence: top 3 at 8 of 49 points (±1) around its own base
 * (north-east, row 2 col 6) from 2026-08-04, exactly 8 on 2026-10-06 (`e2`, Friday's "the week before"), then on
 * 2026-10-13 it spreads across Northwind's ringed centre: 31 of 49 that week and the next (`e1`, the alert).
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
    const p = wi >= 10 ? 1 : 0; // quiet near its base for ten weeks, then the push on 10-13; the last week holds
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
  const plateau = t.slice(0, 10).every((v) => Math.abs(v - 8) <= 1);
  const centre = Math.floor((size * size) / 2);
  if (t[0] === 8 && t[9] === 8 && plateau && t[10] === 31 && t[11] === 31 && weeks[10][centre] <= 3) break;
}
if (seed >= 20000) throw new Error('no seed fits the story');
console.log('seed', seed, weeks.map(top3).join(' '));
for (const w of [0, 9, 10, 11]) { console.log('week', w + 1); for (let r = 0; r < size; r++) console.log(weeks[w].slice(r * size, r * size + size).map((x) => String(x).padStart(3)).join('')); }
const out = { rivalId: 'r1', weeks: weekOfs.map((weekOf, wi) => ({ weekOf, ranks: weeks[wi] })) };
if (mode === 'write') writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n');
