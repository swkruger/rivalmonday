import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// ObjectStore.delete is for avatars only (evidence is never deleted). Only the profile tool may call it (and the web dep wiring forwards it).
const ALLOWED = ['packages/tools/src/tools/my-profile.ts', 'apps/web/src/server/tools.ts']; // the second only forwards the dep
const ROOT = join(__dirname, '..', '..', '..', '..');
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '.turbo', 'coverage', '.vercel']);

function walk(dir: string, out: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name), out);
    } else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) {
      out.push(join(dir, e.name));
    }
  }
}

// A receiver named `*store` (optional chaining included), or an optional call of any `delete` method.
const DELETE_CALL = /\b\w*[sS]tore\??\.delete\(|\bdelete\?\.\(/;

describe('ObjectStore.delete gate', () => {
  it('recognises the plain and the optional call forms', () => {
    for (const call of ['store.delete(k)', 'evidenceStore.delete(k)', 'store?.delete(k)', 'store.delete?.(k)', 'store?.delete?.(k)', 'x.delete?.(k)']) expect(call).toMatch(DELETE_CALL);
    for (const other of ['map.delete(k)', 'db.delete(table)']) expect(other).not.toMatch(DELETE_CALL);
  });

  it('is called only from the avatar code', () => {
    const files: string[] = [];
    walk(join(ROOT, 'packages'), files);
    walk(join(ROOT, 'apps'), files);
    const hits = files
      .filter((f) => DELETE_CALL.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f).split(sep).join('/'))
      .filter((f) => !f.startsWith('packages/storage/'));
    expect(hits.filter((f) => !ALLOWED.includes(f))).toEqual([]);
  });
});
