import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runStatusWith } from '../src/cli/status.js';
import { applyAction } from '../src/ledger.js';
import type { CopyItem, Ledger } from '../src/types.js';

const meta = { at: '2026-10-29', by: 'Owner' };
const item = (o: Partial<CopyItem> = {}): CopyItem => ({
  surface: 'help', file: 'a.ts', line: 3, anchor: 'a.ts#x#0', context: 'x', text: 'Hello', hash: 'a'.repeat(16), kind: 'string', ...o,
});
const empty: Ledger = { version: 1, entries: [] };
const setup = (l: Ledger = empty) => {
  const ledgerPath = join(mkdtempSync(join(tmpdir(), 'cli-')), 'signoff.json');
  writeFileSync(ledgerPath, JSON.stringify(l));
  const lines: string[] = [];
  return { ledgerPath, lines, out: (s: string) => lines.push(s), text: () => lines.join('\n') };
};
const items = [
  item(),
  item({ surface: 'emails', file: 'e.ts', anchor: 'e.ts#y#0', hash: 'b'.repeat(16), text: 'Bye', line: 9 }),
];

describe('copy:status CLI', () => {
  it('table lists every surface with counts', async () => {
    const s = setup(applyAction(empty, 'sign', [items[0]!], meta));
    const code = await runStatusWith(items, [], s);
    expect(code).toBe(0);
    const t = s.text();
    for (const name of ['app-client', 'help', 'emails', 'mcp-tools', 'site-legal']) expect(t).toContain(name);
    expect(t).toMatch(/help\s+0\s+0\s+1\s+0\s+0/);
    expect(t).toMatch(/emails\s+1\s+0\s+0\s+0\s+0/);
    expect(t).toMatch(/stale/i);
  });
  it('--strict exits 1 when a listed surface has unsigned', async () => {
    const s = setup();
    expect(await runStatusWith(items, ['--strict', 'help'], s)).toBe(1);
  });
  it('--strict exits 0 when all signed/ignored', async () => {
    const s = setup(applyAction(applyAction(empty, 'sign', [items[0]!], meta), 'ignore', [items[1]!], meta));
    expect(await runStatusWith(items, ['--strict', 'help,emails'], s)).toBe(0);
  });
  it('--strict with unknown surface exits 2', async () => {
    const s = setup();
    expect(await runStatusWith(items, ['--strict', 'nope'], s)).toBe(2);
    expect(s.text()).toContain('nope');
  });
  it('--todo prints file:line, text and suggestion as Markdown', async () => {
    const s = setup(applyAction(empty, 'comment', [items[0]!], meta, { comment: 'Too stiff', suggestion: 'Hi there' }));
    expect(await runStatusWith(items, ['--todo'], s)).toBe(0);
    const t = s.text();
    expect(t).toContain('a.ts:3');
    expect(t).toContain('Hello');
    expect(t).toContain('Too stiff');
    expect(t).toContain('Hi there');
  });
  it('--prune removes only stale entries', async () => {
    const gone = item({ file: 'gone.ts', anchor: 'gone.ts#z#0', hash: 'c'.repeat(16) });
    const s = setup(applyAction(applyAction(empty, 'sign', [items[0]!], meta), 'sign', [gone], meta));
    expect(await runStatusWith(items, ['--prune'], s)).toBe(0);
    const saved = JSON.parse(readFileSync(s.ledgerPath, 'utf8')) as Ledger;
    expect(saved.entries.map((e) => e.file)).toEqual(['a.ts']);
    expect(s.text()).toMatch(/1/);
    // Each removed entry is listed, so a prune after a scanner regression is visible.
    expect(s.text()).toContain('sign gone.ts gone.ts#z#0');
    expect(s.text()).toContain('"Hello"');
  });
  it('--todo lists unresolved comments whose text was since edited as orphaned', async () => {
    const edited = item({ hash: 'e'.repeat(16), text: 'Old wording' });
    const s = setup(applyAction(empty, 'comment', [edited], meta, { comment: 'Say it plainly', suggestion: 'New wording' }));
    expect(await runStatusWith(items, ['--todo'], s)).toBe(0);
    const t = s.text();
    expect(t).toContain('# Copy to edit (0)');
    expect(t).toMatch(/# Orphaned comments \(1\)/);
    expect(t).toContain('a.ts#x#0');
    expect(t).toContain('Old wording');
    expect(t).toContain('Say it plainly');
    expect(t).toContain('New wording');
  });
  it('--json is parseable', async () => {
    const s = setup();
    expect(await runStatusWith(items, ['--json'], s)).toBe(0);
    const j = JSON.parse(s.text());
    expect(j.surfaces.help.unsigned).toBe(1);
    expect(j.stale).toBe(0);
  });
});
