import type { CallScope } from '@cs/core';
import { z } from 'zod';
import { type DataForSeoClient, DFS_US, VendorError, isDfsOk, isRetryableDfsCode } from '../vendors/dataforseo';

export interface MapsPlace {
  placeId: string | null;
  cid: string | null;
  title: string;
  domain: string | null;
  url: string | null;
  rank: number;
  rating: number | null;
  votes: number | null;
  category: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

const itemSchema = z.looseObject({
  type: z.literal('maps_search'),
  title: z.string(),
  rank_absolute: z.number(),
  domain: z.string().nullish(),
  url: z.string().nullish(),
  place_id: z.string().nullish(),
  cid: z.string().nullish(),
  rating: z.looseObject({ value: z.number().nullish(), votes_count: z.number().nullish() }).nullish(),
  category: z.string().nullish(),
  address: z.string().nullish(),
  latitude: z.number().nullish(),
  longitude: z.number().nullish(),
});

export function parseMapsItems(result: unknown[]): MapsPlace[] {
  const items = (result[0] as { items?: unknown[] } | undefined)?.items ?? [];
  const out: MapsPlace[] = [];
  for (const raw of items) {
    const p = itemSchema.safeParse(raw);
    if (!p.success) continue;
    const i = p.data;
    out.push({
      placeId: i.place_id ?? null, cid: i.cid ?? null, title: i.title, domain: i.domain ?? null, url: i.url ?? null, rank: i.rank_absolute,
      rating: i.rating?.value ?? null, votes: i.rating?.votes_count ?? null, category: i.category ?? null, address: i.address ?? null,
      lat: i.latitude ?? null, lng: i.longitude ?? null,
    });
  }
  return out;
}

export async function mapsSearch(
  dfs: DataForSeoClient,
  q: { keyword: string; lat: number; lng: number; zoom?: number; depth?: number },
  scope: CallScope,
): Promise<{ places: MapsPlace[]; raw: unknown[] }> {
  const [task] = await dfs.post(
    '/serp/google/maps/live/advanced',
    [{ keyword: q.keyword, location_coordinate: `${q.lat},${q.lng},${q.zoom ?? 14}z`, language_code: DFS_US.language_code, depth: q.depth ?? 20 }],
    scope,
  );
  // No task back is an error, not "nobody ranks here": a rank snapshot must never record an
  // empty result for a call that failed.
  if (!task) throw new VendorError('dataforseo', null, 'empty task', false);
  if (!isDfsOk(task.statusCode)) {
    throw new VendorError('dataforseo', task.statusCode, task.statusMessage, isRetryableDfsCode(task.statusCode));
  }
  const raw = task.result ?? [];
  return { places: parseMapsItems(raw), raw };
}
