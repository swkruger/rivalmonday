// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findPlaceholders } from './check-placeholders';

const dirs: string[] = [];
function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'ph-'));
  dirs.push(root);
  for (const [rel, text] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, text);
  }
  return root;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('findPlaceholders', () => {
  it('finds a marker and fails', () => {
    const root = tree({ 'content/legal/privacy.md': 'x\n<!-- OWNER-PLACEHOLDER: y -->\n', 'src/a.tsx': 'ok' });
    const hits = findPlaceholders(root);
    expect(hits).toEqual([{ file: 'content/legal/privacy.md', line: 2 }]);
  });

  it('passes a clean tree', () => {
    const root = tree({ 'content/a.ts': 'x', 'src/a.tsx': 'y', 'src/a.test.tsx': 'OWNER-PLACEHOLDER' });
    expect(findPlaceholders(root)).toEqual([]);
  });
});
