import { PLAN_FEATURES } from '@cs/core';
/** Dollar text ("299" or "49.50") → integer cents; null when it is not a non-negative amount. */
export const toCents = (v: string): number | null => (/^\d+(\.\d{1,2})?$/.test(v) ? Math.round(Number(v) * 100) : null);

/** Whole-number text → number; null for anything else (no signs, exponents, hex, blanks). */
export const toInt = (v: string): number | null => (/^\d+$/.test(v) ? Number(v) : null);

/** Percentage text ("20" or "12.5") → number; null for anything else. */
export const toPercent = (v: string): number | null => (/^\d+(\.\d+)?$/.test(v) ? Number(v) : null);

/** `<input type="date">` value → the end of that UTC day; null when malformed or not a real calendar date. */
export const endOfDayIso = (v: string): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const iso = `${v}T23:59:59.000Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : iso;
};

/** The "Includes" checkboxes (`fd.getAll('features')`) → the known feature keys, deduplicated, in a fixed order. */
export const toFeatures = (values: FormDataEntryValue[]): ('ask' | 'mcp')[] => PLAN_FEATURES.filter((f) => values.includes(f));
