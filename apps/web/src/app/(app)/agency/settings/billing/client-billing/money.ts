/** A dollars text field ("49", "$1,249.50") as integer cents; null for blank, negative or non-numeric input. */
export function parseDollars(text: string): number | null {
  const t = text.trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

/** Cents back into a form field: 29900 -> "299", 4950 -> "49.50". */
export const centsToField = (cents: number | null | undefined): string => (cents == null ? '' : cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));
