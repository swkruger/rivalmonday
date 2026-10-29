import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoRoot } from '../src/paths.js';

const appsDir = join(repoRoot(), 'apps');
const apps = readdirSync(appsDir).filter((d) => statSync(join(appsDir, d)).isDirectory());
const SKIP = new Set(['node_modules', '.next', '.turbo', '.vercel', 'dist', '.shots', 'test-results']);

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json|md|mdx)$/.test(name)) yield p;
  }
}

describe('copy-review stays out of the apps (never deployed)', () => {
  it('finds the apps', () => {
    expect(apps.length).toBeGreaterThan(0);
  });

  it('no apps/* package.json depends on @cs/copy-review', () => {
    for (const app of apps) {
      const pkg = JSON.parse(readFileSync(join(appsDir, app, 'package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>;
      for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
        expect(Object.keys(pkg[field] ?? {}), `${app} ${field}`).not.toContain('@cs/copy-review');
      }
    }
  });

  it('no file under apps/ imports @cs/copy-review', () => {
    const offenders: string[] = [];
    for (const app of apps) {
      for (const file of walk(join(appsDir, app))) {
        if (/package\.json$/.test(file)) continue;
        if (readFileSync(file, 'utf8').includes('@cs/copy-review')) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
