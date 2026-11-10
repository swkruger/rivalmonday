// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SITE = join(__dirname, '..');
const SOURCE = /\.(ts|tsx|css)$/;

/** Motion that plays by itself is gone from the site; later tasks append their own removed names here. */
const BANNED: readonly RegExp[] = [
  /\bReveal\b/,
  /\buseCountUp\b/,
  /\bdraw-line\b/,
  /\bgrow-bar\b/,
  /\bgrow-col\b/,
  /\blive-ping\b/,
  /\bflow-dash\b/,
  /\bscan-sweep\b/,
  /\bscan-blip\b/,
  /\bscan-ping\b/,
  /\banimate-pulse\b/,
  /\banimate-ping\b/,
  /\banimate-bounce\b/,
  /\banimate-spin\b/,
  /\buseInView\b/,
  /\bautoplay\b/,
  /\bautoplayMap\b/,
  /\bradar-sweep\b/,
  /\bradar-blip\b/,
  /\bannouncement-example\b/,
];

/** File (relative to `apps/site`) -> why it may still hold a banned name. Empty today. */
const ALLOWED: Record<string, string> = {};

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

/** `file: token` for every banned name found in a non-test source file. */
function offenders(): string[] {
  const hits: string[] = [];
  for (const f of walk(join(SITE, 'src'))) {
    const rel = relative(SITE, f).split(sep).join('/');
    if (!SOURCE.test(f) || /\.test\.[a-z]+$/.test(f) || rel in ALLOWED) continue;
    const text = readFileSync(f, 'utf8');
    for (const re of BANNED) {
      const m = re.exec(text);
      if (m) hits.push(`${rel}: ${m[0]}`);
    }
  }
  return hits;
}

describe('no idle motion', () => {
  const css = readFileSync(join(SITE, 'src/app/site.css'), 'utf8');

  it('site.css has no infinite animation', () => {
    expect(css).not.toMatch(/\binfinite\b/);
  });

  it('site.css keyframes are only the ones that play once', () => {
    const names = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]!);
    const allowed = ['reveal-quick', 'sheet-in-right', 'sheet-in-bottom'];
    expect(names.filter((n) => !allowed.includes(n))).toEqual([]);
  });

  it('no source file uses a removed motion helper or class', () => {
    expect(offenders()).toEqual([]);
  });
});
