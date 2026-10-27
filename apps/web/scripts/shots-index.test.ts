import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeIndexPage } from './shots-index';

let dir = '';
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

function setup(files: Record<string, string[]>): string {
  dir = mkdtempSync(join(tmpdir(), 'shots-'));
  for (const [label, names] of Object.entries(files)) {
    mkdirSync(join(dir, label), { recursive: true });
    for (const n of names) writeFileSync(join(dir, label, n), 'png');
  }
  return dir;
}

describe('writeIndexPage', () => {
  it('puts the same shot from two label folders in one row', () => {
    writeIndexPage(setup({ before: ['a-1440.png'], after: ['a-1440.png'] }));
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    expect(html).toContain('src="before/a-1440.png"');
    expect(html).toContain('src="after/a-1440.png"');
    const row = html.split('<tr').find((r) => r.includes('before/a-1440.png'))!;
    expect(row).toContain('after/a-1440.png');
    expect(html).not.toContain('missing');
  });

  it('renders "missing" where a folder lacks the shot', () => {
    writeIndexPage(setup({ before: ['a-1440.png', 'b-1440.png'], after: ['a-1440.png'] }));
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    const row = html.split('<tr').find((r) => r.includes('before/b-1440.png'))!;
    expect(row).toContain('missing');
    expect(row).not.toContain('after/b-1440.png');
  });
});
