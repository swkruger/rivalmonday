type Op = 'equal' | 'insert' | 'delete';
interface Seg {
  op: Op;
  text: string;
}

const tokens = (s: string): string[] => s.match(/\s+|\S+/g) ?? [];

/** Word-level diff by longest common subsequence (client-safe; the same idea as `wordDiff` in `@cs/tools`, which the server-only package index keeps out of client bundles). */
export function diffWords(before: string, after: string): Seg[] {
  const a = tokens(before);
  const b = tokens(after);
  const w = b.length + 1;
  const lcs = new Uint16Array((a.length + 1) * w);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * w + j] = a[i] === b[j] ? lcs[(i + 1) * w + j + 1]! + 1 : Math.max(lcs[(i + 1) * w + j]!, lcs[i * w + j + 1]!);
    }
  }
  const out: Seg[] = [];
  const push = (op: Op, text: string) => {
    const last = out[out.length - 1];
    if (last?.op === op) last.text += text;
    else out.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('equal', a[i]!);
      i++;
      j++;
    } else if (lcs[(i + 1) * w + j]! >= lcs[i * w + j + 1]!) push('delete', a[i++]!);
    else push('insert', b[j++]!);
  }
  while (i < a.length) push('delete', a[i++]!);
  while (j < b.length) push('insert', b[j++]!);
  return out;
}

/** Old text struck through, new text highlighted; calm tokens only. `label` names what is compared (for screen readers). */
export function DiffView({ before, after, label }: { before: string; after: string; label: string }) {
  const segs = diffWords(before, after);
  return (
    <p aria-label={`Changes to ${label}`} data-testid="runbook-diff" className="whitespace-pre-wrap rounded-md bg-muted-surface p-3 text-sm text-ink">
      {segs.map((s, i) =>
        s.op === 'equal' ? <span key={i}>{s.text}</span>
          : s.op === 'insert' ? <ins key={i} className="rounded-sm bg-primary-soft px-0.5 text-primary-soft-text no-underline">{s.text}</ins>
          : <del key={i} className="rounded-sm px-0.5 text-muted-ink line-through">{s.text}</del>)}
    </p>
  );
}
