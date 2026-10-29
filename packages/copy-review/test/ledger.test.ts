import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LedgerError, applyAction, loadLedger, saveLedger, serialiseLedger } from '../src/ledger.js';
import type { CopyItem, Ledger } from '../src/types.js';

const meta = { at: '2026-10-29', by: 'Owner' };
const item = (o: Partial<CopyItem> = {}): CopyItem => ({
  surface: 'help', file: 'a.ts', line: 1, anchor: 'a.ts#x#0', context: 'x', text: 'Hello', hash: 'aaaaaaaaaaaaaaaa', kind: 'string', ...o,
});
const empty: Ledger = { version: 1, entries: [] };
const tmp = () => join(mkdtempSync(join(tmpdir(), 'led-')), 'signoff.json');

describe('committed ledger', () => {
  it('docs/copy/signoff.json is in serialiseLedger form', () => {
    const raw = readFileSync(new URL('../../../docs/copy/signoff.json', import.meta.url), 'utf8');
    expect(raw).toBe(serialiseLedger(loadLedgerFromText(raw)));
  });
});

function loadLedgerFromText(raw: string): Ledger {
  const p = tmp();
  writeFileSync(p, raw);
  return loadLedger(p);
}

describe('ledger', () => {
  it('round-trips and sorts entries', () => {
    let l = applyAction(empty, 'sign', [item({ file: 'b.ts', anchor: 'b.ts#x#0', hash: '2'.repeat(16) })], meta);
    l = applyAction(l, 'sign', [item()], meta);
    const p = tmp();
    saveLedger(p, l);
    const back = loadLedger(p);
    expect(back.entries.map((e) => e.file)).toEqual(['a.ts', 'b.ts']);
    expect(serialiseLedger(back)).toBe(serialiseLedger(l));
  });
  it('serialised form has one entry per line and trailing LF', () => {
    const l = applyAction(empty, 'sign', [item(), item({ anchor: 'a.ts#x#1', hash: 'b'.repeat(16), text: 'Bye' })], meta);
    const lines = serialiseLedger(l).split('\n');
    expect(lines[0]).toBe('{"version":1,"entries":[');
    expect(lines.at(-1)).toBe('');
    expect(lines.at(-2)).toBe(']}');
    expect(lines.length).toBe(2 + 2 + 1);
    expect(lines[1]!.endsWith(',')).toBe(true);
    expect(lines[2]!.endsWith(',')).toBe(false);
    expect(serialiseLedger(empty)).toBe('{"version":1,"entries":[\n]}\n');
  });
  it('loads a missing file as empty', () => {
    expect(loadLedger(join(tmpdir(), `nope-${Date.now()}`, 'x.json'))).toEqual(empty);
  });
  it('refuses malformed ledger', () => {
    for (const bad of ['{not json', '{"version":1,"entries":[{"type":"sign"}]}']) {
      const p = tmp();
      writeFileSync(p, bad);
      expect(() => loadLedger(p)).toThrow(LedgerError);
      expect(readFileSync(p, 'utf8')).toBe(bad);
    }
  });
  it('sign resolves open comment for same file+hash', () => {
    let l = applyAction(empty, 'comment', [item()], meta, { comment: 'fix', suggestion: 'Hi' });
    l = applyAction(l, 'sign', [item()], meta);
    const c = l.entries.find((e) => e.type === 'comment');
    expect(c && c.type === 'comment' && c.resolved).toBe(true);
    expect(l.entries.some((e) => e.type === 'sign')).toBe(true);
  });
  it('sign keeps other entries, even with the same anchor', () => {
    const other = item({ hash: 'c'.repeat(16), text: 'Hello again' });
    let l = applyAction(empty, 'sign', [item()], meta);
    l = applyAction(l, 'sign', [other], meta);
    expect(l.entries.filter((e) => e.type === 'sign')).toHaveLength(2);
    l = applyAction(l, 'sign', [other], meta);
    expect(l.entries.filter((e) => e.type === 'sign')).toHaveLength(2);
  });
  it('unsign removes only the matching entry', () => {
    let l = applyAction(empty, 'sign', [item(), item({ anchor: 'a.ts#x#1', hash: 'b'.repeat(16), text: 'Bye' })], meta);
    l = applyAction(l, 'ignore', [item()], meta);
    l = applyAction(l, 'unsign', [item()], meta);
    expect(l.entries.map((e) => e.type + e.hash[0])).toEqual(['ignorea', 'signb']);
  });
});
