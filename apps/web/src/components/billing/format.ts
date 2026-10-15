const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** Cents as US dollars, e.g. 29900 -> "$299.00". */
export const formatUsd = (cents: number): string => USD.format(cents / 100);

/** "November 13, 2026" (UTC, so server and browser agree). */
export function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
