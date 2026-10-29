import { describe, expect, it } from 'vitest';
import { staleEntries, withStatus } from '../src/status.js';
import { hashText } from '../src/text.js';
import type { CopyItem, Ledger, LedgerEntry } from '../src/types.js';

const item = (text: string, over: Partial<CopyItem> = {}): CopyItem => ({
  surface: 'help', file: 'a.ts', line: 1, anchor: 'a.ts#x#0', context: '', text, hash: hashText(text), kind: 'string', ...over,
});
const entry = (type: 'sign' | 'ignore', it: CopyItem, over: Partial<LedgerEntry> = {}): LedgerEntry =>
  ({ type, file: it.file, hash: it.hash, anchor: it.anchor, text: it.text, at: '2026-10-01T00:00:00Z', by: 'o', ...over }) as LedgerEntry;
const ledger = (...entries: LedgerEntry[]): Ledger => ({ version: 1, entries });
const comment = (it: CopyItem, resolved?: boolean): LedgerEntry =>
  ({ type: 'comment', file: it.file, hash: it.hash, anchor: it.anchor, text: it.text, at: '2026-10-02T00:00:00Z', by: 'o', comment: 'fix', ...(resolved ? { resolved } : {}) }) as LedgerEntry;

describe('withStatus', () => {
  it('ignored beats signed', () => {
    const i = item('Hello');
    expect(withStatus([i], ledger(entry('sign', i), entry('ignore', i)))[0]!.status).toBe('ignored');
  });
  it('signed when file+hash match even if anchor moved', () => {
    const i = item('Hello');
    const old = entry('sign', i, { anchor: 'a.ts#other#9' });
    expect(withStatus([i], ledger(old))[0]!.status).toBe('signed');
  });
  it('changed when same anchor signed with another hash, signedText set', () => {
    const i = item('Hello there');
    const old = item('Hello');
    const r = withStatus([i], ledger(entry('sign', old, { at: '2026-09-01T00:00:00Z' }), entry('sign', item('Hi', { anchor: i.anchor }), { at: '2026-09-15T00:00:00Z' })))[0]!;
    expect(r.status).toBe('changed');
    expect(r.signedText).toBe('Hi');
  });
  it('a newly inserted string is not "changed" against a neighbour whose signed text is still in the file', () => {
    const kept = item('Hello', { anchor: 'a.ts#x#1' });
    const inserted = item('Brand new words', { anchor: 'a.ts#x#0' });
    const signedAtOldAnchor = entry('sign', item('Hello'));
    const r = withStatus([inserted, kept], ledger(signedAtOldAnchor));
    expect(r.map((x) => x.status)).toEqual(['unsigned', 'signed']);
    expect(r[0]!.signedText).toBeUndefined();
  });
  it('unsigned otherwise', () => {
    const i = item('Hello');
    expect(withStatus([i], ledger(entry('sign', item('Zzz', { anchor: 'other' }))))[0]!.status).toBe('unsigned');
  });
  it('needsEdit only for unresolved comments', () => {
    const i = item('Hello');
    expect(withStatus([i], ledger(comment(i, true)))[0]).toMatchObject({ needsEdit: false });
    expect(withStatus([i], ledger(comment(i, true)))[0]!.comments).toHaveLength(1);
    expect(withStatus([i], ledger(comment(i, true), comment(i)))[0]!.needsEdit).toBe(true);
  });
});

describe('staleEntries', () => {
  it('stale lists sign entries matching no item', () => {
    const i = item('Hello');
    const gone = item('Gone');
    const ign = item('Old noise');
    const stale = staleEntries([i], ledger(entry('sign', i), entry('sign', gone), entry('ignore', ign), comment(gone), comment(gone, true)));
    expect(stale.map((e) => e.type + ':' + e.hash)).toEqual([`sign:${gone.hash}`, `ignore:${ign.hash}`, `comment:${gone.hash}`]);
  });
});
