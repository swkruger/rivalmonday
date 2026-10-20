/** Correlation id for a request: Vercel's `x-vercel-id` when present, else a fresh uuid. */
export function requestIdFrom(h: Headers): string {
  return h.get('x-vercel-id')?.trim() || crypto.randomUUID();
}
