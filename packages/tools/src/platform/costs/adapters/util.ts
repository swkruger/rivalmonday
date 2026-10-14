import type { z } from 'zod';
import { fetchJson } from '../http';
import type { CostReading } from '../types';

type Kind = CostReading['kind'];

/** Fetch + validate. Returns the parsed body, or a ready-made error reading (short codes only). */
export async function getValidated<S extends z.ZodType>(
  fetchImpl: typeof fetch,
  kind: Kind,
  url: string,
  headers: Record<string, string>,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; reading: CostReading; status?: number }> {
  const r = await fetchJson(fetchImpl, url, { method: 'GET', headers });
  if (!r.ok) return { ok: false, status: r.status, reading: { status: 'error', kind, error: r.error } };
  const p = schema.safeParse(r.body);
  if (!p.success) return { ok: false, reading: { status: 'error', kind, error: 'bad response' } };
  return { ok: true, data: p.data };
}
