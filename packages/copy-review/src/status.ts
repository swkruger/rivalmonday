import type { CopyItem, Ledger, LedgerEntry, StatusedItem } from './types.js';

type CommentEntry = Extract<LedgerEntry, { type: 'comment' }>;

const key = (file: string, hash: string) => `${file}\u0000${hash}`;

/** Spec §4: ignored > signed > changed > unsigned. Ledger order breaks `at` ties (later wins). */
export function withStatus(items: CopyItem[], l: Ledger): StatusedItem[] {
  const ignored = new Set<string>();
  const signed = new Set<string>();
  const signsByAnchor = new Map<string, { entry: LedgerEntry; idx: number }[]>();
  const comments = new Map<string, CommentEntry[]>();
  l.entries.forEach((e, idx) => {
    const k = key(e.file, e.hash);
    if (e.type === 'ignore') ignored.add(k);
    else if (e.type === 'sign') {
      signed.add(k);
      const ak = key(e.file, e.anchor);
      (signsByAnchor.get(ak) ?? signsByAnchor.set(ak, []).get(ak)!).push({ entry: e, idx });
    } else (comments.get(k) ?? comments.set(k, []).get(k)!).push(e);
  });

  return items.map((it) => {
    const k = key(it.file, it.hash);
    const cs = comments.get(k) ?? [];
    const base = { ...it, comments: cs, needsEdit: cs.some((c) => !c.resolved) };
    if (ignored.has(k)) return { ...base, status: 'ignored' as const };
    if (signed.has(k)) return { ...base, status: 'signed' as const };
    const prior = (signsByAnchor.get(key(it.file, it.anchor)) ?? [])
      .filter((s) => s.entry.hash !== it.hash)
      .sort((a, b) => (a.entry.at < b.entry.at ? -1 : a.entry.at > b.entry.at ? 1 : a.idx - b.idx))
      .at(-1);
    if (prior) return { ...base, status: 'changed' as const, signedText: prior.entry.text };
    return { ...base, status: 'unsigned' as const };
  });
}

/** sign/ignore entries, and unresolved comments, whose (file, hash) matches no current item; ledger order. */
export function staleEntries(items: CopyItem[], l: Ledger): LedgerEntry[] {
  const live = new Set(items.map((i) => key(i.file, i.hash)));
  return l.entries.filter((e) => !live.has(key(e.file, e.hash)) && (e.type !== 'comment' || !e.resolved));
}
