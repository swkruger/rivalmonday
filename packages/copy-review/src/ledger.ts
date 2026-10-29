import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import type { CopyItem, Ledger, LedgerEntry } from './types.js';

export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerError';
  }
}

const base = {
  file: z.string(),
  hash: z.string(),
  anchor: z.string(),
  text: z.string(),
  at: z.string(),
  by: z.string(),
};

const entrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('sign'), ...base }).strict(),
  z.object({ type: z.literal('ignore'), ...base }).strict(),
  z.object({
    type: z.literal('comment'),
    ...base,
    comment: z.string(),
    suggestion: z.string().optional(),
    resolved: z.boolean().optional(),
  }).strict(),
]);

const ledgerSchema = z.object({ version: z.literal(1), entries: z.array(entrySchema) }).strict();

export function loadLedger(path: string): Ledger {
  if (!existsSync(path)) return { version: 1, entries: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new LedgerError(`Ledger ${path} is not valid JSON: ${(e as Error).message}`);
  }
  const parsed = ledgerSchema.safeParse(raw);
  if (!parsed.success) throw new LedgerError(`Ledger ${path} is malformed: ${parsed.error.message}`);
  return parsed.data as Ledger;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function sorted(entries: LedgerEntry[]): LedgerEntry[] {
  return [...entries].sort(
    (a, b) => cmp(a.file, b.file) || cmp(a.anchor, b.anchor) || cmp(a.type, b.type) || cmp(a.hash, b.hash),
  );
}

export function serialiseLedger(l: Ledger): string {
  const rows = sorted(l.entries).map((e) => JSON.stringify(e));
  return `{"version":1,"entries":[\n${rows.map((r, i) => (i < rows.length - 1 ? `${r},\n` : `${r}\n`)).join('')}]}\n`;
}

export function saveLedger(path: string, l: Ledger): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, serialiseLedger(l));
  renameSync(tmp, path);
}

export type LedgerAction = 'sign' | 'unsign' | 'ignore' | 'unignore' | 'comment';

export function applyAction(
  l: Ledger,
  action: LedgerAction,
  items: CopyItem[],
  meta: { at: string; by: string },
  extra?: { comment: string; suggestion?: string },
): Ledger {
  let entries = l.entries;
  const same = (e: LedgerEntry, it: CopyItem) => e.file === it.file && e.hash === it.hash;
  for (const it of items) {
    const snap = { file: it.file, hash: it.hash, anchor: it.anchor, text: it.text, at: meta.at, by: meta.by };
    switch (action) {
      case 'sign':
        entries = entries.map((e) => (e.type === 'comment' && same(e, it) && !e.resolved ? { ...e, resolved: true } : e));
        if (!entries.some((e) => e.type === 'sign' && same(e, it))) entries = [...entries, { type: 'sign', ...snap }];
        break;
      case 'ignore':
        if (!entries.some((e) => e.type === 'ignore' && same(e, it))) entries = [...entries, { type: 'ignore', ...snap }];
        break;
      case 'unsign':
        entries = entries.filter((e) => !(e.type === 'sign' && same(e, it)));
        break;
      case 'unignore':
        entries = entries.filter((e) => !(e.type === 'ignore' && same(e, it)));
        break;
      case 'comment': {
        if (!extra) throw new LedgerError('comment action requires a comment');
        const c: LedgerEntry = { type: 'comment', ...snap, comment: extra.comment };
        if (extra.suggestion) c.suggestion = extra.suggestion;
        entries = [...entries, c];
        break;
      }
    }
  }
  return { version: 1, entries: sorted(entries) };
}
