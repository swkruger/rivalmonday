import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('.', import.meta.url));
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

describe('runtime', () => {
  it('no route or page opts into the Edge runtime', () => {
    const files = walk(root).filter((f) => /^(page|route|layout)\.tsx?$/.test(basename(f)));
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.filter((f) => /export\s+const\s+runtime\s*=\s*['"]edge['"]/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
