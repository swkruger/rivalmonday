import type { LedgerSink } from '@cs/core';
import type { Db } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { recordVendorCapture } from '../evidence/vendor-capture';
import { fetchMetaAdsApify } from '../vendors/apify';
import { parseDfsTimestamp } from '../vendors/dfs-time';
import { VendorError } from '../vendors/errors';
import { fetchMetaAdsScrapeCreators } from '../vendors/scrapecreators';
import { type NormalizedAd, upsertAds } from './upsert';

export const META_COLLECTOR_VERSION = 'meta/1';
type Obj = Record<string, unknown>;
const pick = (o: Obj | undefined, keys: string[]): unknown => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};
const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : typeof v === 'number' ? String(v) : null);

export function normalizeMetaAd(raw: unknown): NormalizedAd | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Obj;
  const externalId = str(pick(o, ['adArchiveID', 'adArchiveId', 'ad_archive_id']));
  if (!externalId) return null;
  const snap = (pick(o, ['snapshot']) ?? {}) as Obj;
  const body = pick(snap, ['body']) as Obj | undefined;
  const images = (Array.isArray(snap.images) ? snap.images : []).map((i) =>
    typeof i === 'string' ? i : str(pick(i as Obj, ['original_image_url', 'originalImageUrl', 'resized_image_url', 'resizedImageUrl', 'url'])),
  );
  const videos = (Array.isArray(snap.videos) ? snap.videos : []).map((v) =>
    str(pick(v as Obj, ['video_preview_image_url', 'videoPreviewImageUrl', 'video_hd_url', 'videoHdUrl', 'video_sd_url', 'videoSdUrl'])),
  );
  const platforms = pick(o, ['publisherPlatform', 'publisher_platform', 'publisherPlatforms']);
  const isActive = pick(o, ['isActive', 'is_active']);
  const start = parseDfsTimestamp(pick(o, ['startDate', 'start_date']));
  const end = parseDfsTimestamp(pick(o, ['endDate', 'end_date']));
  return {
    externalId, advertiserId: str(pick(o, ['pageID', 'pageId', 'page_id'])), format: str(pick(snap, ['display_format', 'displayFormat'])),
    title: str(pick(snap, ['title'])), text: str(body ? pick(body, ['text']) : pick(snap, ['body'])),
    mediaUrls: [...images, ...videos].filter((u): u is string => Boolean(u)), landingUrl: str(pick(snap, ['link_url', 'linkUrl'])),
    publisherPlatforms: Array.isArray(platforms) ? platforms.filter((p): p is string => typeof p === 'string') : [],
    startedAt: start, endedAt: isActive === false ? end : null, isActive: isActive !== false,
  };
}

export async function collectMetaAds(
  deps: { db: Db; store: ObjectStore; ledger: LedgerSink; apify?: { token: string }; scrapeCreators?: { apiKey: string }; fetch?: typeof fetch },
  c: { id: string; metaPageId: string | null },
): Promise<{ status: 'ok' | 'vendor_error' | 'skipped'; ads?: number; deactivated?: number; vendor?: string }> {
  if (!c.metaPageId) return { status: 'skipped' };
  const base = { competitorId: c.id, source: 'meta_ads', collectorVersion: META_COLLECTOR_VERSION };
  const attempts: [string, () => Promise<unknown[]>][] = [];
  if (deps.apify) attempts.push(['apify', () => fetchMetaAdsApify({ token: deps.apify!.token, ledger: deps.ledger, fetch: deps.fetch }, c.metaPageId!)]);
  if (deps.scrapeCreators) attempts.push(['scrapecreators', () => fetchMetaAdsScrapeCreators({ apiKey: deps.scrapeCreators!.apiKey, ledger: deps.ledger, fetch: deps.fetch }, c.metaPageId!)]);
  const errors: string[] = [];
  for (const [vendor, run] of attempts) {
    let raw: unknown[];
    try {
      raw = await run();
    } catch (err) {
      if (!(err instanceof VendorError)) throw err;
      errors.push(`${vendor}: ${err.code ?? ''} ${err.message}`.trim());
      continue;
    }
    const { captureId } = await recordVendorCapture(deps, { ...base, status: 'ok', payload: { vendor, items: raw } });
    const ads = raw.map(normalizeMetaAd).filter((a): a is NormalizedAd => a !== null);
    // Only the active set was requested, so anything previously active and now missing has ended.
    const r = await upsertAds(deps.db, c.id, 'meta', captureId, ads, { markMissingInactive: true });
    return { status: 'ok', ads: r.upserted, deactivated: r.deactivated, vendor };
  }
  await recordVendorCapture(deps, { ...base, status: 'vendor_error', error: errors.join(' | ') || 'no Meta vendor configured' });
  return { status: 'vendor_error' };
}
