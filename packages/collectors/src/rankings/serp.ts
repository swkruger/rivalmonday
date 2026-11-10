import type { CallScope } from '@cs/core';
import type { SerpLocalServices, SerpOrganicItem } from '@cs/db';
import { z } from 'zod';
import { type DataForSeoClient, DFS_US, isDfsOk, isNoResults, isRetryableDfsCode, VendorError } from '../vendors/dataforseo';

/** Measured live price of one organic advanced call (Task 0, 2026-11-10; no AI-answer flag). */
export const SERP_CALL_USD = 0.002;
export const SERP_OPERATION = '/serp/google/organic/live/advanced';
const SERP_DEPTH = 10;
const RADIUS_M = { min: 199, max: 199_999 } as const;

export interface SerpResult {
  organic: SerpOrganicItem[];
  localServices: SerpLocalServices | null;
}

const organicSchema = z.looseObject({
  type: z.literal('organic'),
  rank_group: z.number(),
  domain: z.string().nullish(),
  url: z.string().nullish(),
  title: z.string().nullish(),
});

const localServicesSchema = z.looseObject({
  type: z.literal('local_services'),
  title: z.string().nullish(),
  items: z.array(z.unknown()).nullish(),
});

const providerSchema = z.looseObject({
  title: z.string().nullish(),
  rating: z.looseObject({ value: z.number().nullish(), votes_count: z.number().nullish() }).nullish(),
});

/** Pure parse of a `serp/google/organic/live/advanced` task `result` array (or the whole result[0]) into page-one organic items and the Local Services ads block. */
export function parseSerp(raw: unknown): SerpResult {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const items = (first as { items?: unknown } | null | undefined)?.items;
  const list = Array.isArray(items) ? items : [];
  const organic: SerpOrganicItem[] = [];
  let localServices: SerpLocalServices | null = null;
  for (const item of list) {
    const o = organicSchema.safeParse(item);
    if (o.success) {
      if (organic.length < SERP_DEPTH) organic.push({ rank: o.data.rank_group, domain: o.data.domain ?? null, url: o.data.url ?? null, title: o.data.title ?? null });
      continue;
    }
    if (localServices) continue;
    const l = localServicesSchema.safeParse(item);
    if (!l.success) continue;
    const providers: SerpLocalServices['providers'] = [];
    for (const p of l.data.items ?? []) {
      const pp = providerSchema.safeParse(p);
      const name = pp.success ? pp.data.title?.trim() : undefined;
      if (!pp.success || !name) continue;
      providers.push({ name, rating: pp.data.rating?.value ?? null, votes: pp.data.rating?.votes_count ?? null });
    }
    localServices = { title: l.data.title ?? null, providers };
  }
  return { organic, localServices };
}

/** One live Google search (page one, desktop) centred on the service area; `raw` is the vendor result array for evidence. */
export async function serpSearch(
  dfs: DataForSeoClient,
  q: { keyword: string; lat: number; lng: number; radiusM: number },
  scope: CallScope,
): Promise<SerpResult & { raw: unknown[] }> {
  const radiusM = Math.min(RADIUS_M.max, Math.max(RADIUS_M.min, Math.round(q.radiusM)));
  const [task] = await dfs.post(
    SERP_OPERATION,
    [{ keyword: q.keyword, location_coordinate: `${q.lat},${q.lng},${radiusM}`, language_code: DFS_US.language_code, depth: SERP_DEPTH }],
    scope,
  );
  // No task back is an error, not "nobody ranks here".
  if (!task) throw new VendorError('dataforseo', null, 'empty task', false);
  if (isNoResults(task)) return { organic: [], localServices: null, raw: [] };
  if (!isDfsOk(task.statusCode)) throw new VendorError('dataforseo', task.statusCode, task.statusMessage, isRetryableDfsCode(task.statusCode));
  const raw = task.result ?? [];
  return { ...parseSerp(raw), raw };
}
