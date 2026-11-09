/** "Nov 3" | "Nov 3–6" | "Oct 30 – Nov 2": the calendar days (in `tz`) a grouped change line spans. */
export function formatDayRange(firstIso: string, lastIso: string, tz: string): string {
  const parts = (iso: string) => {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric' }).formatToParts(new Date(iso));
    return { month: p.find((x) => x.type === 'month')?.value ?? '', day: p.find((x) => x.type === 'day')?.value ?? '' };
  };
  const a = parts(firstIso);
  const b = parts(lastIso);
  if (a.month === b.month && a.day === b.day) return `${a.month} ${a.day}`;
  if (a.month === b.month) return `${a.month} ${a.day}–${b.day}`;
  return `${a.month} ${a.day} – ${b.month} ${b.day}`;
}
