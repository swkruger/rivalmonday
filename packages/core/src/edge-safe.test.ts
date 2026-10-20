import { existsSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const src = dirname(fileURLToPath(import.meta.url));
const BUILTINS = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));
const SPEC = /(?:from\s+|import\s*\(\s*|import\s+|require\(\s*)['"]([^'"]+)['"]/g;

function resolveRel(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const c of [`${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts'), base]) if (existsSync(c) && c.match(/\.tsx?$/)) return c;
  return null;
}

it('main entry has no node builtins', () => {
  const seen = new Set<string>();
  const bad: string[] = [];
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const m of readFileSync(file, 'utf8').matchAll(SPEC)) {
      const spec = m[1]!;
      if (spec.startsWith('.')) {
        if (/(^|\/)server(\/|$)/.test(spec)) bad.push(`${file}: ${spec}`);
        const next = resolveRel(file, spec);
        if (next) walk(next);
      } else if (BUILTINS.has(spec) || spec.startsWith('node:') || spec === 'pino' || spec.startsWith('pino-')) bad.push(`${file}: ${spec}`);
    }
  };
  walk(resolve(src, 'index.ts'));
  walk(resolve(src, 'invite-offer.ts'));
  expect(bad).toEqual([]);
  expect(seen.size).toBeGreaterThan(5);
});
