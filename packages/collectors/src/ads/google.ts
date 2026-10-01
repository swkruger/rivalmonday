import type { Db } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { z } from 'zod';
import { recordVendorCapture } from '../evidence/vendor-capture';
import { employerMatches } from '../jobs/collect';
import { DFS_COLLECTOR_VERSION } from '../gbp/collect-gbp';
import { type DataForSeoClient, DFS_US, isDfsOk } from '../vendors/dataforseo';
import { parseDfsTimestamp } from '../vendors/dfs-time';
import { VendorError } from '../vendors/errors';
import { type NormalizedAd, upsertAds } from './upsert';

const ACTIVE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const itemSchema = z.looseObject({
  creative_id: z.string(),
  advertiser_id: z.string().nullish(),
  title: z.string().nullish(),
  format: z.string().nullish(),
  preview_image: z.looseObject({ url: z.string().nullish() }).nullish(),
  first_shown: z.union([z.string(), z.number()]).nullish(),
  last_shown: z.union([z.string(), z.number()]).nullish(),
});

export function normalizeGoogleAd(item: unknown, now: Date): NormalizedAd | null {
  const p = itemSchema.safeParse(item);
  if (!p.success) return null;
  const i = p.data;
  const lastShown = parseDfsTimestamp(i.last_shown);
  const isActive = lastShown ? now.getTime() - lastShown.getTime() <= ACTIVE_WINDOW_MS : true;
  return {
    externalId: i.creative_id,
    advertiserId: i.advertiser_id ?? null,
    format: i.format ?? null,
    title: i.title ?? null,
    text: null,
    mediaUrls: i.preview_image?.url ? [i.preview_image.url] : [],
    landingUrl: null,
    publisherPlatforms: ['google'],
    startedAt: parseDfsTimestamp(i.first_shown),
    endedAt: isActive ? null : lastShown,
    isActive,
  };
}

export async function collectGoogleAds(
  deps: { db: Db; store: ObjectStore; dfs: DataForSeoClient },
  c: { id: string; domain: string | null; name: string },
): Promise<{ status: 'ok' | 'vendor_error' | 'skipped'; ads?: number; dropped?: number }> {
  if (!c.domain) return { status: 'skipped' };
  const base = { competitorId: c.id, source: 'google_ads', collectorVersion: DFS_COLLECTOR_VERSION };
  let raw: unknown[];
  try {
    const [task] = await deps.dfs.post(
      '/serp/google/ads_search/live/advanced',
      [{ target: c.domain, location_code: DFS_US.location_code, depth: 40 }],
      { agencyId: null, clientId: null },
    );
    // DataForSEO can return HTTP 200 with an OK envelope while an individual task still failed, or
    // with no task at all — never record an empty 'ok' capture in either case.
    if (!task) {
      await recordVendorCapture(deps, { ...base, status: 'vendor_error', error: 'empty task' });
      return { status: 'vendor_error' };
    }
    if (!isDfsOk(task.statusCode)) {
      await recordVendorCapture(deps, { ...base, status: 'vendor_error', error: `${task.statusCode} ${task.statusMessage}` });
      return { status: 'vendor_error' };
    }
    raw = task.result ?? [];
  } catch (err) {
    if (!(err instanceof VendorError)) throw err;
    await recordVendorCapture(deps, { ...base, status: 'vendor_error', error: `${err.code ?? ''} ${err.message}`.trim() });
    return { status: 'vendor_error' };
  }
  const { captureId } = await recordVendorCapture(deps, { ...base, status: 'ok', payload: raw });
  const now = new Date();
  const items = (raw[0] as { items?: unknown[] } | undefined)?.items ?? [];
  // Live-verified 2026-10-01: `ads_search` by `target` domain returns creatives from EVERY advertiser
  // whose ads point at that domain (20 advertiser names among 40 creatives for aireserv.com, e.g.
  // "Mr Rooter of Sioux Falls"). The ad table's external id is first-writer-wins across competitors,
  // so a creative stored under the wrong competitor stays wrong — keep only creatives whose
  // advertiser name (`title`) matches the competitor name on whole-word runs (keeps franchisees such
  // as "4JR LLC DBA Aire Serv of Fort Worth"); everything else is counted as dropped. The raw capture
  // above still holds all of them.
  const ads: NormalizedAd[] = [];
  let dropped = 0;
  for (const i of items) {
    const a = normalizeGoogleAd(i, now);
    if (!a) continue;
    if (employerMatches(a.title, c.name)) ads.push(a);
    else dropped++;
  }
  if (dropped > 0) console.log(`[ads] google competitor ${c.id}: dropped ${dropped} of ${ads.length + dropped} creatives from advertisers not matching "${c.name}"`);
  await upsertAds(deps.db, c.id, 'google', captureId, ads, { markMissingInactive: false, now });
  return { status: 'ok', ads: ads.length, dropped };
}
