/** Decision 12: the new full order after moving one id up/down; null when it can't move. */
export function moveInOrder(ids: string[], id: string, dir: 'up' | 'down'): string[] | null {
  const i = ids.indexOf(id);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  const next = [...ids];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}
