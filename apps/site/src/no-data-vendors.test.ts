// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SITE = join(__dirname, '..');
const TEXT = /\.(ts|tsx|json|md|css|svg|txt)$/;
const VENDORS = /dataforseo|apify|scrapecreators|stadia/i;

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

describe('data vendors stay unnamed', () => {
  it('no site source file names a data vendor', () => {
    const hits: string[] = [];
    for (const root of ['content', 'src', 'public', 'scripts']) {
      for (const f of walk(join(SITE, root))) {
        const rel = relative(SITE, f).split(sep).join('/');
        if (!TEXT.test(f) || /\.test\.[a-z]+$/.test(f) || rel === 'scripts/check-bundle.ts') continue;
        if (VENDORS.test(readFileSync(f, 'utf8'))) hits.push(rel);
      }
    }
    expect(hits).toEqual([]);
  });
});
