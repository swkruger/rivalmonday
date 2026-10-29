import { collectItems } from '../collect.js';
import { LedgerError, loadLedger, saveLedger } from '../ledger.js';
import { isMainModule, ledgerPathFor, repoRoot } from '../paths.js';
import { staleEntries, withStatus } from '../status.js';
import { SURFACES, type CopyItem, type ItemStatus, type LedgerEntry, type Surface } from '../types.js';

interface Deps { ledgerPath: string; out: (s: string) => void }

/** First 60 characters, whitespace collapsed (prune listing). */
const excerpt = (t: string) => {
  const s = t.replace(/\s+/g, ' ').trim();
  return s.length > 60 ? `${s.slice(0, 59)}…` : s;
};
type Counts = Record<ItemStatus | 'needsEdit', number>;

/** Testable core: the items are injected. Returns the exit code (0 ok, 1 strict failure, 2 usage / ledger error). */
export async function runStatusWith(items: CopyItem[], argv: string[], deps: Deps): Promise<number> {
  const { out, ledgerPath } = deps;
  const si = argv.indexOf('--strict');
  let strict: Surface[] = [];
  if (si >= 0) {
    const list = (argv[si + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const bad = list.filter((s) => !SURFACES.includes(s as Surface));
    if (list.length === 0 || bad.length > 0) {
      out(`Unknown surface in --strict: ${bad.join(', ') || '(none given)'}. Known: ${SURFACES.join(', ')}`);
      return 2;
    }
    strict = list as Surface[];
  }

  let ledger;
  try {
    ledger = loadLedger(ledgerPath);
  } catch (e) {
    if (e instanceof LedgerError) {
      out(e.message);
      return 2;
    }
    throw e;
  }

  const stale = staleEntries(items, ledger);
  if (argv.includes('--prune')) {
    const drop = new Set(stale);
    saveLedger(ledgerPath, { version: 1, entries: ledger.entries.filter((e) => !drop.has(e)) });
    out(`Pruned ${stale.length} stale entr${stale.length === 1 ? 'y' : 'ies'}.`);
    for (const e of stale) out(`- ${e.type} ${e.file} ${e.anchor} ${JSON.stringify(excerpt(e.text))}`);
    return 0;
  }

  const statused = withStatus(items, ledger);

  if (argv.includes('--todo')) {
    const open = statused.filter((i) => i.needsEdit);
    out(`# Copy to edit (${open.length})\n`);
    for (const i of open) {
      out(`## ${i.file}:${i.line}`);
      out(`- Context: ${i.context}`);
      out(`- Current text: ${i.text}`);
      for (const c of i.comments.filter((c) => !c.resolved)) {
        out(`- Comment: ${c.comment}`);
        if (c.suggestion) out(`- Suggestion: ${c.suggestion}`);
      }
      out('');
    }
    // Unresolved comments whose text no longer exists (usually: the edit was applied). Check the current text, then
    // re-sign the "changed" item and `--prune`.
    const orphaned = stale.filter((e): e is Extract<LedgerEntry, { type: 'comment' }> => e.type === 'comment');
    if (orphaned.length > 0) {
      out(`# Orphaned comments (${orphaned.length}): the commented text has since changed
`);
      for (const c of orphaned) {
        out(`## ${c.anchor}`);
        out(`- Commented text: ${c.text}`);
        out(`- Comment: ${c.comment}`);
        if (c.suggestion) out(`- Suggestion: ${c.suggestion}`);
        out('');
      }
    }
    return 0;
  }

  const counts = {} as Record<Surface, Counts>;
  for (const s of SURFACES) counts[s] = { unsigned: 0, changed: 0, signed: 0, ignored: 0, needsEdit: 0 };
  for (const i of statused) {
    const c = (counts[i.surface] ??= { unsigned: 0, changed: 0, signed: 0, ignored: 0, needsEdit: 0 });
    c[i.status]++;
    if (i.needsEdit) c.needsEdit++;
  }

  if (argv.includes('--json')) {
    out(JSON.stringify({ surfaces: counts, stale: stale.length }, null, 2));
  } else {
    const w = Math.max(...SURFACES.map((s) => s.length));
    out(`${'surface'.padEnd(w)}  unsigned  changed  signed  ignored  needs-edit`);
    for (const s of SURFACES) {
      const c = counts[s];
      out(`${s.padEnd(w)}  ${[c.unsigned, c.changed, c.signed, c.ignored, c.needsEdit].map((n, k) => String(n).padStart([8, 7, 6, 7, 10][k]!)).join('  ')}`);
    }
    out(`\nStale ledger entries: ${stale.length}`);
  }

  const failing = strict.filter((s) => counts[s].unsigned + counts[s].changed > 0);
  if (failing.length > 0) {
    out(`--strict failed: unsigned or changed copy on ${failing.join(', ')}`);
    return 1;
  }
  return 0;
}

export async function runStatus(argv: string[], deps: Deps & { root: string }): Promise<number> {
  return runStatusWith(await collectItems(deps.root), argv, deps);
}

if (isMainModule(import.meta.url)) {
  const root = repoRoot();
  runStatus(process.argv.slice(2), { root, ledgerPath: ledgerPathFor(root), out: (s) => console.log(s) })
    .then((code) => process.exit(code));
}
