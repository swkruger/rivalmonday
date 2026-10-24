import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ARCHIVE_MAX_CASES, buildGolden, GOLDEN_MUTATIONS, GOLDEN_PAGES, GOLDEN_TOTAL, MAX_ARCHIVE_PAIRS } from './golden';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'evals-golden-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A pair = an engine fixture page with several scripted mutations applied at once (several changed blocks). */
function savePairs(n: number) {
  const pages = GOLDEN_PAGES.filter((p) => p.file.endsWith('v1.html'));
  for (let i = 0; i < n; i++) {
    const p = pages[i % pages.length]!;
    const muts = GOLDEN_MUTATIONS.filter((m) => m.page === p.file).slice(i % 3, (i % 3) + 4);
    const after = muts.reduce((html, m) => html.replace(m.find, m.replace), p.html);
    const d = join(dir, `pair-${String(i).padStart(2, '0')}`);
    mkdirSync(d);
    writeFileSync(join(d, 'before.html'), p.html);
    writeFileSync(join(d, 'after.html'), after);
    writeFileSync(join(d, 'meta.json'), JSON.stringify({ vertical: p.vertical, competitorName: p.competitorName, pageUrl: p.pageUrl }));
  }
}
const pairOf = (id: string) => id.replace(/^changes-archive-/, '').replace(/-\d+$/, '');

describe('golden cap (spec decision 12: 60 total, <= 20 archive pairs)', () => {
  it('25 archive pairs: total <= 60, <= 20 pairs used, every page keeps scripted cases, deterministic', () => {
    savePairs(25);
    const a = buildGolden({ fixtureDir: dir });
    expect(buildGolden({ fixtureDir: dir })).toEqual(a);
    expect(a.length).toBeLessThanOrEqual(GOLDEN_TOTAL);
    const archive = a.filter((c) => c.source === 'archive');
    expect(archive.length).toBeLessThanOrEqual(ARCHIVE_MAX_CASES);
    const pairs = new Set(archive.map((c) => pairOf(c.id)));
    expect(pairs.size).toBeLessThanOrEqual(MAX_ARCHIVE_PAIRS);
    expect(pairs.size).toBe(20); // one block from each of the first 20 pairs
    for (const p of GOLDEN_PAGES) expect(a.some((c) => c.id.startsWith(`changes-golden-${p.file.replace('.html', '')}-`)), p.file).toBe(true);
  });

  it('few pairs share the archive budget; money blocks rank first', () => {
    savePairs(3);
    const a = buildGolden({ fixtureDir: dir });
    expect(a.length).toBeLessThanOrEqual(GOLDEN_TOTAL);
    const archive = a.filter((c) => c.source === 'archive');
    expect(new Set(archive.map((c) => pairOf(c.id))).size).toBe(3);
    expect(archive.length).toBeGreaterThan(3);
    // pair-00 (dental v1, mutations 0-3) holds a price block; it is that pair's first pick
    const first = archive.find((c) => pairOf(c.id) === 'pair-00')!;
    expect(JSON.stringify(first.input)).toMatch(/price|promo|\$/);
  });

  it('no fixture dir: all 52 scripted/natural cases (48 + 4)', () => {
    expect(buildGolden({ fixtureDir: join(dir, 'missing') })).toHaveLength(52);
  });
});
