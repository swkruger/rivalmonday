const DAY = 86_400_000;
const WEEK = 7 * DAY;

export type WeekLabel = 'This week' | 'Last week' | 'Earlier';
const LABELS: readonly WeekLabel[] = ['This week', 'Last week', 'Earlier'];

/** Buckets items by age relative to `now`, in display order, dropping any bucket that ends up empty. */
export function groupByWeek<T extends { occurredAt: string }>(items: T[], now: Date): { label: WeekLabel; items: T[] }[] {
  const buckets: Record<WeekLabel, T[]> = { 'This week': [], 'Last week': [], Earlier: [] };
  for (const item of items) {
    const age = now.getTime() - Date.parse(item.occurredAt);
    const label: WeekLabel = age < WEEK ? 'This week' : age < 2 * WEEK ? 'Last week' : 'Earlier';
    buckets[label].push(item);
  }
  return LABELS.filter((label) => buckets[label].length > 0).map((label) => ({ label, items: buckets[label] }));
}
