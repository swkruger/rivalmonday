import type { Block } from './extract';

export type AlignmentKind = 'unchanged' | 'modified' | 'added' | 'removed';

export interface Alignment<B extends Block = Block> {
  kind: AlignmentKind;
  before: B | null;
  after: B | null;
}

/** Minimum shape similarity for pairing blocks across different keys (moved + edited). */
export const MOVE_SIMILARITY = 0.5;

function shapeTokens(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/\d+(?:[.,]\d+)*/g, '#').match(/[a-z#$%]+/g) ?? []);
}

/** Jaccard similarity of word "shapes": numbers count as equal so price edits keep their alignment. */
export function shapeSimilarity(a: string, b: string): number {
  const x = shapeTokens(a);
  const y = shapeTokens(b);
  if (x.size === 0 && y.size === 0) return 1;
  let inter = 0;
  for (const t of x) if (y.has(t)) inter++;
  return inter / (x.size + y.size - inter);
}

export function alignBlocks<B extends Block>(before: B[], after: B[]): Alignment<B>[] {
  const usedB = new Set<number>();
  const usedA = new Set<number>();
  const out: Alignment<B>[] = [];
  const pair = (kind: AlignmentKind, i: number, j: number) => {
    usedB.add(i);
    usedA.add(j);
    out.push({ kind, before: before[i]!, after: after[j]! });
  };

  // 1. Identical text → unchanged (prefer the same key, else the first unused occurrence).
  const byText = new Map<string, number[]>();
  before.forEach((b, i) => byText.set(b.text, [...(byText.get(b.text) ?? []), i]));
  after.forEach((a, j) => {
    const free = (byText.get(a.text) ?? []).filter((i) => !usedB.has(i));
    if (free.length === 0) return;
    pair('unchanged', free.find((i) => before[i]!.blockKey === a.blockKey) ?? free[0]!, j);
  });

  // 2. Same key → modified.
  const byKey = new Map(before.map((b, i) => [b.blockKey, i]));
  after.forEach((a, j) => {
    if (usedA.has(j)) return;
    const i = byKey.get(a.blockKey);
    if (i !== undefined && !usedB.has(i)) pair('modified', i, j);
  });

  // 3. Across keys, most similar first.
  const candidates: { i: number; j: number; s: number }[] = [];
  after.forEach((a, j) => {
    if (usedA.has(j)) return;
    before.forEach((b, i) => {
      if (usedB.has(i)) return;
      const s = shapeSimilarity(b.text, a.text);
      if (s >= MOVE_SIMILARITY) candidates.push({ i, j, s });
    });
  });
  candidates.sort((x, y) => y.s - x.s || x.j - y.j || x.i - y.i);
  for (const c of candidates) if (!usedA.has(c.j) && !usedB.has(c.i)) pair('modified', c.i, c.j);

  // 4. Leftovers.
  after.forEach((a, j) => {
    if (!usedA.has(j)) out.push({ kind: 'added', before: null, after: a });
  });
  before.forEach((b, i) => {
    if (!usedB.has(i)) out.push({ kind: 'removed', before: b, after: null });
  });

  const position = (x: Alignment<B>) => (x.after ? x.after.ord : x.before!.ord + 0.5);
  return out.sort((x, y) => position(x) - position(y));
}
