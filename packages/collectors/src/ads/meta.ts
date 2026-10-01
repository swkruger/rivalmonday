import type { LedgerSink } from '@cs/core';
import { ad, type Db } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { and, eq } from 'drizzle-orm';
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
    // Only the active set was requested, so anything previously active and now missing has ended —
    // unless the vendor handed back nothing at all. A fully empty response from a real advertiser
    // with live ads is far more likely to be a vendor glitch than every ad ending at once, so an
    // empty response never deactivates when active rows already exist; it's recorded as evidence
    // and surfaced via a warning instead of silently wiping history.
    let markMissingInactive = true;
    if (raw.length === 0) {
      const existingActive = await deps.db
        .select({ id: ad.id })
        .from(ad)
        .where(and(eq(ad.competitorId, c.id), eq(ad.platform, 'meta'), eq(ad.isActive, true)))
        .limit(1);
      if (existingActive.length > 0) {
        markMissingInactive = false;
        console.warn(`[ads] meta competitor ${c.id}: vendor ${vendor} returned an empty response while active ads exist; skipping deactivation`);
      }
    }
    const r = await upsertAds(deps.db, c.id, 'meta', captureId, ads, { markMissingInactive });
    return { status: 'ok', ads: r.upserted, deactivated: r.deactivated, vendor };
  }
  await recordVendorCapture(deps, { ...base, status: 'vendor_error', error: errors.join(' | ') || 'no Meta vendor configured' });
  return { status: 'vendor_error' };
}
