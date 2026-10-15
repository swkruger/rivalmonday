/** Dollar text ("299" or "49.50") → integer cents; null when it is not a non-negative amount. */
export const toCents = (v: string): number | null => (/^\d+(\.\d{1,2})?$/.test(v) ? Math.round(Number(v) * 100) : null);

/** `<input type="date">` value → the end of that UTC day; null when malformed. */
export const endOfDayIso = (v: string): string | null => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T23:59:59.000Z` : null);
