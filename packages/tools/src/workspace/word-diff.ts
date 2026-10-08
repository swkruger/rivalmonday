export type DiffOp = 'equal' | 'insert' | 'delete';
export interface DiffSegment {
  op: DiffOp;
  text: string;
}

/** Above this many LCS cells (≈ 16 MB of Uint32) the diff gives up aligning and shows whole-block delete + insert (Review Focus 5). */
export const MAX_DIFF_CELLS = 4_000_000;

const tokens = (s: string): string[] => s.match(/\s+|[^\s]+/g) ?? [];

function merge(segs: DiffSegment[]): DiffSegment[] {
  const out: DiffSegment[] = [];
  for (const s of segs) {
    if (s.text === '') continue;
    const last = out[out.length - 1];
    if (last && last.op === s.op) last.text += s.text;
    else out.push({ ...s });
  }
  return out;
}

/** Decision 5: word-level diff (whitespace kept as its own tokens) by longest common subsequence. Pure. */
export function wordDiff(before: string, after: string): DiffSegment[] {
  const a = tokens(before);
  const b = tokens(after);
  const n = a.length;
  const m = b.length;
  if (n * m > MAX_DIFF_CELLS) return merge([{ op: 'delete', text: before }, { op: 'insert', text: after }]);
  const w = m + 1;
  const dp = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1]! + 1 : Math.max(dp[(i + 1) * w + j]!, dp[i * w + j + 1]!);
    }
  }
  const out: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: 'equal', text: a[i]! });
      i++;
      j++;
    } else if (dp[(i + 1) * w + j]! >= dp[i * w + j + 1]!) {
      out.push({ op: 'delete', text: a[i++]! });
    } else {
      out.push({ op: 'insert', text: b[j++]! });
    }
  }
  while (i < n) out.push({ op: 'delete', text: a[i++]! });
  while (j < m) out.push({ op: 'insert', text: b[j++]! });
  return merge(out);
}
