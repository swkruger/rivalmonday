import type { LedgerSink } from '@cs/core';
import { safeRecordVendorCall, VendorError } from './errors';

export const APIFY_META_ACTOR = 'curious_coder~facebook-ads-library-scraper';

export function metaLibraryUrl(pageId: string, country = 'US'): string {
  const u = new URL('https://www.facebook.com/ads/library/');
  u.search = new URLSearchParams({ active_status: 'active', ad_type: 'all', country, view_all_page_id: pageId, media_type: 'all' }).toString();
  return u.toString();
}

export async function fetchMetaAdsApify(opts: { token: string; ledger: LedgerSink; fetch?: typeof fetch }, pageId: string): Promise<unknown[]> {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const started = Date.now();
  let items: unknown[] = [];
  let ok = false;
  try {
    const res = await doFetch(`https://api.apify.com/v2/actors/${APIFY_META_ACTOR}/run-sync-get-dataset-items`, {
      method: 'POST',
      headers: { authorization: `Bearer ${opts.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        urls: [{ url: metaLibraryUrl(pageId) }], count: 200, limitPerSource: 200, scrapeAdDetails: false,
        'scrapePageAds.activeStatus': 'active', 'scrapePageAds.countryCode': 'US', 'scrapePageAds.sortBy': 'most_recent',
      }),
      signal: AbortSignal.timeout(310_000), // Apify sync runs time out at 300 s (HTTP 408)
    });
    if (!res.ok) throw new VendorError('apify', res.status, `Apify HTTP ${res.status}`, res.status === 408 || res.status >= 500);
    const body = await res.json().catch(() => null);
    if (!Array.isArray(body)) throw new VendorError('apify', null, 'Apify returned a non-array body', false);
    items = body;
    ok = true;
    return items;
  } catch (err) {
    if (err instanceof VendorError) throw err;
    throw new VendorError('apify', null, 'Network error calling Apify', true, { cause: err });
  } finally {
    await safeRecordVendorCall(opts.ledger, { agencyId: null, clientId: null, vendor: 'apify', operation: APIFY_META_ACTOR, units: items.length, costUsd: null, latencyMs: Date.now() - started, ok });
  }
}
