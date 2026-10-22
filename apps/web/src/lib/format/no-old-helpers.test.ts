import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(name)) yield p;
  }
}

describe('format helpers', () => {
  it('no file under apps/web/src defines formatUsd/formatShortDate/formatDay/formatLongDate/relativeTime any more', () => {
    const root = join(__dirname, '..', '..');
    const re = /(function|const|let)\s+(formatUsd|formatShortDate|formatDay|formatLongDate|relativeTime)\b/;
    const offenders = [...walk(root)].filter((f) => !f.endsWith('no-old-helpers.test.ts') && re.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
