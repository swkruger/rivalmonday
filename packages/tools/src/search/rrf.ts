/**
 * d6: reciprocal rank fusion of ranked lists (best first). An item's score is the sum of `1 / (k + rank)` over the lists
 * it appears in; ties break by its best rank, then by key. The first list's copy of an item is the one returned.
 */
export function rrfMerge<T extends { key: string }>(lists: readonly (readonly T[])[], k = 60, limit = 10): T[] {
  const acc = new Map<string, { item: T; score: number; best: number }>();
  for (const list of lists) {
    list.forEach((item, i) => {
      const add = 1 / (k + i + 1);
      const prev = acc.get(item.key);
      if (prev) { prev.score += add; prev.best = Math.min(prev.best, i); }
      else acc.set(item.key, { item, score: add, best: i }); // first list wins the displayed item (FTS has the better snippet)
    });
  }
  return [...acc.values()]
    .sort((a, b) => b.score - a.score || a.best - b.best || a.item.key.localeCompare(b.item.key))
    .slice(0, limit).map((x) => x.item);
}
