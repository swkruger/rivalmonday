const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const OPTS = { month: 'short', day: 'numeric', year: 'numeric' } as const;

/**
 * "Oct 13, 2026" for the Briefs & reports rows and detail breadcrumbs (15a; 15c unifies the app's date formatters).
 * A date-only value (a brief's delivery date) is that calendar day; a timestamp is shown in `timeZone` (the client's),
 * UTC when it is missing or unknown. Anything that isn't a date comes back unchanged.
 */
export function formatDay(value: string, timeZone = 'UTC'): string {
  const dateOnly = DATE_ONLY.test(value);
  const at = new Date(dateOnly ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(at.getTime())) return value;
  if (dateOnly) return at.toLocaleDateString('en-US', { ...OPTS, timeZone: 'UTC' });
  try {
    return at.toLocaleDateString('en-US', { ...OPTS, timeZone });
  } catch {
    return at.toLocaleDateString('en-US', { ...OPTS, timeZone: 'UTC' });
  }
}
