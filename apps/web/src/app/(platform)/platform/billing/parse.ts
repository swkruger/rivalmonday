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

export type TierRowsResult = { ok: true; tiers: { upTo: number | null; unitCents: number }[] } | { ok: false; error: string };

/**
 * Editor tier rows ("From client N, price P") → `seatTiers`. Blank rows are skipped; the first row must start at the first
 * extra client (included + 1); `upTo` = (next row's from-client − 1) − included, the last row `null`.
 */
export function parseTierRows(rows: { from: string; price: string }[], includedSeats: number): TierRowsResult {
  const filled = rows.map((r) => ({ from: r.from.trim(), price: r.price.trim() })).filter((r) => r.from !== '' || r.price !== '');
  if (filled.length === 0) return { ok: false, error: 'Add at least one price for extra clients' };
  const parsed: { from: number; unitCents: number }[] = [];
  for (const r of filled) {
    const from = toInt(r.from);
    const unitCents = toCents(r.price);
    if (from === null || unitCents === null) return { ok: false, error: 'Each extra-client row needs a whole client number and a price in dollars' };
    parsed.push({ from, unitCents });
  }
  if (parsed[0]!.from !== includedSeats + 1) return { ok: false, error: `The first extra-client row must start at client ${includedSeats + 1}` };
  for (let i = 1; i < parsed.length; i++) if (parsed[i]!.from <= parsed[i - 1]!.from) return { ok: false, error: 'Extra-client rows must start at higher client numbers, in order' };
  return { ok: true, tiers: parsed.map((r, i) => ({ upTo: i === parsed.length - 1 ? null : parsed[i + 1]!.from - 1 - includedSeats, unitCents: r.unitCents })) };
}
