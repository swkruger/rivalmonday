import type { LedgerSink } from '@cs/core';
import { ad, type Db } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { and, eq, isNull, or } from 'drizzle-orm';
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
  const imageUrl = (i: unknown) =>
    typeof i === 'string' ? i : str(pick(i as Obj, ['original_image_url', 'originalImageUrl', 'resized_image_url', 'resizedImageUrl', 'url']));
  const videoUrl = (v: unknown) => str(pick(v as Obj, ['video_preview_image_url', 'videoPreviewImageUrl', 'video_hd_url', 'videoHdUrl', 'video_sd_url', 'videoSdUrl']));
  const images = (Array.isArray(snap.images) ? snap.images : []).map(imageUrl);
  const videos = (Array.isArray(snap.videos) ? snap.videos : []).map(videoUrl);
  // Live-verified 2026-10-01 (curious_coder actor): DCO and carousel ads carry their media and
  // copy in `snapshot.cards[]` (each card has body/title/link_url plus the image and video URL
  // fields), with empty `images`/`videos` and a templated `{{product.brand}}` body/title.
  const cards = (Array.isArray(snap.cards) ? snap.cards : []).filter((c): c is Obj => Boolean(c) && typeof c === 'object');
  const cardMedia = cards.map((c) => videoUrl(c) ?? imageUrl(c));
  const firstCard = cards[0];
  const real = (v: string | null) => (v && !/^\{\{.*\}\}$/.test(v.trim()) ? v : null);
  const snapText = real(str(body && typeof body === 'object' ? pick(body, ['text']) : body));
  const platforms = pick(o, ['publisherPlatform', 'publisher_platform', 'publisherPlatforms']);
  const isActive = pick(o, ['isActive', 'is_active']);
  const start = parseDfsTimestamp(pick(o, ['startDate', 'start_date']));
  const end = parseDfsTimestamp(pick(o, ['endDate', 'end_date']));
  return {
    externalId, advertiserId: str(pick(o, ['pageID', 'pageId', 'page_id'])), format: str(pick(snap, ['display_format', 'displayFormat'])),
    title: real(str(pick(snap, ['title']))) ?? real(str(pick(firstCard, ['title']))),
    text: snapText ?? real(str(pick(firstCard, ['body']))),
    mediaUrls: [...new Set([...images, ...videos, ...cardMedia].filter((u): u is string => Boolean(u)))],
    landingUrl: str(pick(snap, ['link_url', 'linkUrl'])) ?? str(pick(firstCard, ['link_url', 'linkUrl'])),
    publisherPlatforms: Array.isArray(platforms) ? platforms.filter((p): p is string => typeof p === 'string') : [],
    startedAt: start, endedAt: isActive === false ? end : null, isActive: isActive !== false,
  };
}

export const metaPageUrl = (pageId: string) => `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}`;

export interface MetaPageResult {
  pageId: string;
  status: 'ok' | 'vendor_error';
  ads?: number;
  deactivated?: number;
  vendor?: string;
}

type MetaDeps = { db: Db; store: ObjectStore; ledger: LedgerSink; apify?: { token: string }; scrapeCreators?: { apiKey: string }; fetch?: typeof fetch };

/**
 * Collects every Meta page of a competitor (franchise brands advertise from franchisee pages, 2b carry-over).
 * Each page gets its own capture (url = metaPageUrl) and its own deactivation scope, so one page's pull
 * never ends another page's ads.
 */
export async function collectMetaAds(
  deps: MetaDeps,
  c: { id: string; metaPageIds: string[] },
): Promise<{ status: 'ok' | 'vendor_error' | 'skipped'; ads: number; deactivated: number; pages: MetaPageResult[] }> {
  const pages: MetaPageResult[] = [];
  for (const pageId of c.metaPageIds) pages.push(await collectMetaPage(deps, c.id, pageId));
  if (pages.length === 0) return { status: 'skipped', ads: 0, deactivated: 0, pages };
  const ok = pages.filter((p) => p.status === 'ok');
  return {
    status: ok.length > 0 ? 'ok' : 'vendor_error',
    ads: ok.reduce((n, p) => n + (p.ads ?? 0), 0),
    deactivated: ok.reduce((n, p) => n + (p.deactivated ?? 0), 0),
    pages,
  };
}

async function collectMetaPage(deps: MetaDeps, competitorId: string, pageId: string): Promise<MetaPageResult> {
  const base = { competitorId, source: 'meta_ads', collectorVersion: META_COLLECTOR_VERSION, url: metaPageUrl(pageId) };
  const attempts: [string, () => Promise<{ items: unknown[]; truncated: boolean }>][] = [];
  if (deps.apify) attempts.push(['apify', () => fetchMetaAdsApify({ token: deps.apify!.token, ledger: deps.ledger, fetch: deps.fetch }, pageId)]);
  if (deps.scrapeCreators) attempts.push(['scrapecreators', () => fetchMetaAdsScrapeCreators({ apiKey: deps.scrapeCreators!.apiKey, ledger: deps.ledger, fetch: deps.fetch }, pageId)]);
  const errors: string[] = [];
  for (const [vendor, run] of attempts) {
    let raw: unknown[];
    let truncated: boolean;
    try {
      ({ items: raw, truncated } = await run());
    } catch (err) {
      if (!(err instanceof VendorError)) throw err;
      errors.push(`${vendor}: ${err.code ?? ''} ${err.message}`.trim());
      continue;
    }
    const { captureId } = await recordVendorCapture(deps, { ...base, status: 'ok', payload: { vendor, items: raw, truncated } });
    // An ad without a vendor page id belongs to the page we asked for.
    const ads = raw.map(normalizeMetaAd).filter((a): a is NormalizedAd => a !== null).map((a) => ({ ...a, advertiserId: a.advertiserId ?? pageId }));
    // Only the active set was requested, so anything previously active and now missing has ended —
    // unless the vendor handed back nothing at all. A fully empty response from a real advertiser
    // with live ads is far more likely to be a vendor glitch than every ad ending at once, so an
    // empty response never deactivates when this page has active rows; it's recorded as evidence
    // and surfaced via a warning instead of silently wiping history.
    let markMissingInactive = true;
    if (raw.length === 0) {
      const existingActive = await deps.db
        .select({ id: ad.id })
        .from(ad)
        .where(and(eq(ad.competitorId, competitorId), eq(ad.platform, 'meta'), eq(ad.isActive, true), or(eq(ad.advertiserId, pageId), isNull(ad.advertiserId))))
        .limit(1);
      if (existingActive.length > 0) {
        markMissingInactive = false;
        console.warn(`[ads] meta competitor ${competitorId} page ${pageId}: vendor ${vendor} returned an empty response while active ads exist; skipping deactivation`);
      }
    }
    // A response cut off at the vendor's cap (Apify count / ScrapeCreators page limit) doesn't
    // list every active ad, so ads beyond the cap must not be marked ended.
    if (truncated) {
      markMissingInactive = false;
      console.warn(`[ads] meta competitor ${competitorId} page ${pageId}: vendor ${vendor} response was truncated at its cap (${raw.length} items); skipping deactivation`);
    }
    const r = await upsertAds(deps.db, competitorId, 'meta', captureId, ads, { markMissingInactive, advertiserId: pageId });
    return { pageId, status: 'ok', ads: r.upserted, deactivated: r.deactivated, vendor };
  }
  await recordVendorCapture(deps, { ...base, status: 'vendor_error', error: errors.join(' | ') || 'no Meta vendor configured' });
  return { pageId, status: 'vendor_error' };
}
