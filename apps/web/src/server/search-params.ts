/** Shared helpers for reading GET query params on server pages. Same rules as the Changes feed's parser. */
export type SearchParams = Record<string, string | string[] | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The first value of a (possibly repeated) query param, trimmed, or `undefined` when blank/absent. */
export function one(v: string | string[] | undefined): string | undefined {
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return s ? s : undefined;
}

/** A uuid-shaped param, or `undefined`. */
export function uuidParam(sp: SearchParams, key: string): string | undefined {
  const v = one(sp[key]);
  return v && UUID.test(v) ? v : undefined;
}

/** A non-negative integer `offset` no larger than `max`, else 0. */
export function offsetParam(sp: SearchParams, max = 5000): number {
  const n = Number(one(sp.offset));
  return Number.isInteger(n) && n >= 0 && n <= max ? n : 0;
}
