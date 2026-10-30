/**
 * Re-tunes the sample's map rankings into the centre-out story (week 1: only the office point is top 3; final week:
 * 42 of 49, the figure Friday cites) and rewrites the matching "You:" rank summaries. Run after any
 * `export:sample-brief` re-export: `node scripts/sample-rank-story.mjs content/sample-brief.json write`.
 * Deterministic (seeded); `src/sample/rank-story.test.ts` pins the shape.
 */
import { readFileSync, writeFileSync } from 'node:fs';
const file = process.argv[2];
const j = JSON.parse(readFileSync(file, 'utf8'));
const size = 7, C = 3;
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
function build(seed) {
  const r = rng(seed);
  // Per-cell fixed offset so a cell keeps its character week to week (no flicker).
  const cellOff = Array.from({ length: 49 }, () => r());
  return j.rankGrid.weeks.map((w, wi) => {
    const reach = 0.25 + wi * 0.28; // how far out from the office you rank well
    return Array.from({ length: 49 }, (_, i) => {
      const row = Math.floor(i / size), col = i % size;
      const d = Math.max(Math.abs(row - C), Math.abs(col - C));
      const e = Math.hypot(row - C, col - C) / Math.SQRT2; // softer, rounder front
      if (wi === 8 && i === 48) return null; // one point with no result that week
      const base = 1 + 0.6 * d + cellOff[i] * 1.6 + (r() - 0.5) * 0.6;
      const pen = Math.max(0, e - reach) * 7.5;
      const v = Math.max(1, Math.round(base + pen));
      return v > 20 ? 21 : v;
    });
  });
}
const top3 = (a) => a.filter((x) => x !== null && x <= 3).length;
const pts = (a) => a.filter((x) => x !== null).length;
let seed = 1, weeks;
for (; seed < 5000; seed++) {
  weeks = build(seed);
  const t = weeks.map(top3);
  const mono = t.every((v, i) => i === 0 || v >= t[i - 1] - 1);
  if (t[11] === 42 && t[0] <= 4 && mono && t[10] < 42) break;
}
console.log('seed', seed, weeks.map(top3).join(' '));
weeks.forEach((w, wi) => { j.rankGrid.weeks[wi].you = w; });
for (const ev of Object.values(j.evidence)) {
  if (ev.kind !== 'rank' || !ev.summary.startsWith('You:')) continue;
  const wi = j.rankGrid.weeks.findIndex((w) => w.weekOf === ev.weekOf);
  const shift = wi === -1 ? j.rankGrid.weeks.findIndex((w) => Math.abs(new Date(w.weekOf) - new Date(ev.weekOf)) < 7 * 864e5) : wi;
  const w = weeks[shift];
  ev.summary = `You: top 3 in ${top3(w)} of ${pts(w)} points`;
}
for (const w of [0, 5, 11]) { console.log('week', w); for (let r = 0; r < 7; r++) console.log(weeks[w].slice(r * 7, r * 7 + 7).map((x) => String(x ?? '-').padStart(3)).join('')); }
if (process.argv[3] === 'write') writeFileSync(file, JSON.stringify(j, null, 2) + '\n');
