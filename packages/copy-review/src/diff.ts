export interface DiffPart { op: 'eq' | 'add' | 'del'; text: string }

/** Word-level diff (LCS). Whitespace is collapsed; adjacent parts with the same op are joined with a space. */
export function wordDiff(a: string, b: string): DiffPart[] {
  const x = a.split(/\s+/).filter(Boolean);
  const y = b.split(/\s+/).filter(Boolean);
  const lcs: number[][] = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      lcs[i]![j] = x[i] === y[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const parts: DiffPart[] = [];
  const push = (op: DiffPart['op'], word: string) => {
    const last = parts[parts.length - 1];
    if (last && last.op === op) last.text += ' ' + word;
    else parts.push({ op, text: word });
  };
  let i = 0;
  let j = 0;
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) { push('eq', x[i]!); i++; j++; }
    else if (j < y.length && (i === x.length || lcs[i]![j + 1]! >= lcs[i + 1]![j]!)) { push('add', y[j]!); j++; }
    else { push('del', x[i]!); i++; }
  }
  // Prefer "del" before "add" for a replacement.
  for (let k = 0; k + 1 < parts.length; k++) {
    if (parts[k]!.op === 'add' && parts[k + 1]!.op === 'del') [parts[k], parts[k + 1]] = [parts[k + 1]!, parts[k]!];
  }
  return parts;
}
