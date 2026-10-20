import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import baseline from './console-baseline.json';

const APPS = join(__dirname, '..', '..');
const CONSOLE = /\bconsole\.(log|info|warn|error|debug|trace)\b/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !/\.fixture\./.test(name)) out.push(p);
  }
  return out;
}

function counts(app: string): Record<string, number> {
  const root = join(APPS, app, 'src');
  const res: Record<string, number> = {};
  for (const f of walk(root)) {
    const n = (readFileSync(f, 'utf8').match(CONSOLE) ?? []).length;
    if (n > 0) res[relative(root, f).split(sep).join('/')] = n;
  }
  return res;
}

describe('no-console guard (Phase 7a1 D5)', () => {
  it('apps/worker/src has no console.* outside cli/** (human CLI output)', () => {
    const offenders = Object.keys(counts('worker')).filter((f) => !f.startsWith('cli/'));
    expect(offenders).toEqual([]);
  });

  it('apps/web/src does not exceed the per-file baseline', () => {
    const base = baseline as Record<string, number>;
    const over = Object.entries(counts('web')).filter(([f, n]) => n > (base[f] ?? 0)).map(([f, n]) => `${f}: ${n} > ${base[f] ?? 0}`);
    expect(over).toEqual([]);
  });
});
