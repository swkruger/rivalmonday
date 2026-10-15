import type { CallScope, LedgerSink } from '@cs/core';
import { APIFY_META_ACTOR } from './apify';
import { safeRecordVendorCall, VendorError } from './errors';

export interface MetaSearchDeps { apiKey?: string; apifyToken?: string; ledger: LedgerSink; fetch?: typeof fetch }
export interface MetaPageHit { pageId: string; pageName: string; activeAds: number }
export type MetaSearchVendor = 'scrapecreators' | 'apify';
/** pages null = no vendor could answer; costUsd = estimate summed over every vendor call made (also ledgered per call). */
export interface MetaSearchResult { pages: MetaPageHit[] | null; vendor: MetaSearchVendor | null; costUsd: number }

/** Ad rows a discovery search reads per business (both vendors): enough to find the page, cheap on Apify's per-ad price. */
export const META_SEARCH_COUNT = 30;
/** Cost estimates (USD): ScrapeCreators charges 1 credit per call; the Apify actor is pay-per-ad (live-verified 2026-10). */
export const META_SEARCH_COST_USD = { scrapecreators: 0.01, apifyPerAd: 0.00075 } as const;
const apifyCostUsd = (count: number) => count * META_SEARCH_COST_USD.apifyPerAd;
/** Worst case of one search: ScrapeCreators fails after being called and Apify answers in full. */
export const metaSearchWorstCaseUsd = (count = META_SEARCH_COUNT): number => META_SEARCH_COST_USD.scrapecreators + apifyCostUsd(count);

/** Groups ad rows by page id. activeAds counts rows flagged active: a lower bound (the search is capped). */
function groupByPage(rows: unknown[]): MetaPageHit[] {
  const pages = new Map<string, MetaPageHit>();
  for (const raw of rows) {
    const r = raw as { page_id?: unknown; page_name?: unknown; is_active?: unknown; snapshot?: { page_name?: unknown } } | null;
    const pageId = r?.page_id;
    if (typeof pageId !== 'string' && typeof pageId !== 'number') continue;
    const id = String(pageId);
    const nameRaw = r?.page_name ?? r?.snapshot?.page_name;
    const hit = pages.get(id) ?? { pageId: id, pageName: '', activeAds: 0 };
    if (!hit.pageName && typeof nameRaw === 'string') hit.pageName = nameRaw;
    if (r?.is_active === true) hit.activeAds += 1;
    pages.set(id, hit);
  }
  return [...pages.values()];
}

async function viaScrapeCreators(d: MetaSearchDeps & { apiKey: string }, name: string, country: string, count: number, scope: CallScope): Promise<MetaPageHit[]> {
  const doFetch = d.fetch ?? globalThis.fetch;
  const params = new URLSearchParams({ query: name, status: 'ACTIVE', country });
  const started = Date.now();
  let ok = false;
  let credits: number | null = null;
  try {
    const res = await doFetch(`https://api.scrapecreators.com/v1/facebook/adLibrary/search/ads?${params}`, { headers: { 'x-api-key': d.apiKey }, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new VendorError('scrapecreators', res.status, `ScrapeCreators HTTP ${res.status}`, res.status >= 500 || res.status === 429);
    const body = (await res.json().catch(() => null)) as { success?: boolean; searchResults?: unknown[]; credits_charged?: number } | null;
    if (!body || body.success === false || !Array.isArray(body.searchResults)) throw new VendorError('scrapecreators', null, 'Unexpected ScrapeCreators body', false);
    credits = body.credits_charged ?? null;
    ok = true;
    return groupByPage(body.searchResults.slice(0, count));
  } catch (err) {
    if (err instanceof VendorError) throw err;
    throw new VendorError('scrapecreators', null, 'Network error calling ScrapeCreators', true, { cause: err });
  } finally {
    await safeRecordVendorCall(d.ledger, { ...scope, vendor: 'scrapecreators', operation: 'facebook/adLibrary/search/ads', units: credits ?? 1, costUsd: META_SEARCH_COST_USD.scrapecreators, latencyMs: Date.now() - started, ok });
  }
}

async function viaApify(d: MetaSearchDeps & { apifyToken: string }, name: string, country: string, count: number, scope: CallScope): Promise<MetaPageHit[]> {
  const doFetch = d.fetch ?? globalThis.fetch;
  const url = new URL('https://www.facebook.com/ads/library/');
  url.search = new URLSearchParams({ active_status: 'active', ad_type: 'all', country, q: name, search_type: 'keyword_unordered', media_type: 'all' }).toString();
  const started = Date.now();
  let ok = false;
  try {
    const res = await doFetch(`https://api.apify.com/v2/actors/${APIFY_META_ACTOR}/run-sync-get-dataset-items`, {
      method: 'POST',
      headers: { authorization: `Bearer ${d.apifyToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ urls: [{ url: url.toString() }], count, limitPerSource: count, scrapeAdDetails: false }),
      signal: AbortSignal.timeout(310_000),
    });
    if (!res.ok) throw new VendorError('apify', res.status, `Apify HTTP ${res.status}`, res.status === 408 || res.status >= 500);
    const body = await res.json().catch(() => null);
    if (!Array.isArray(body)) throw new VendorError('apify', null, 'Apify returned a non-array body', false);
    // Error items (e.g. ADS_NOT_FOUND) carry no page_id and are dropped by the grouping.
    ok = true;
    return groupByPage(body);
  } catch (err) {
    if (err instanceof VendorError) throw err;
    throw new VendorError('apify', null, 'Network error calling Apify', true, { cause: err });
  } finally {
    await safeRecordVendorCall(d.ledger, { ...scope, vendor: 'apify', operation: `${APIFY_META_ACTOR}/keyword-search`, units: count, costUsd: apifyCostUsd(count), latencyMs: Date.now() - started, ok });
  }
}

/** Keyword search of the Meta Ad Library for pages advertising under a business name: ScrapeCreators, then Apify. */
export async function searchMetaPages(d: MetaSearchDeps, q: { name: string; country: 'US'; count?: number }, scope: CallScope): Promise<MetaSearchResult> {
  const count = q.count ?? META_SEARCH_COUNT;
  let costUsd = 0;
  if (d.apiKey) {
    costUsd += META_SEARCH_COST_USD.scrapecreators;
    try { return { pages: await viaScrapeCreators({ ...d, apiKey: d.apiKey }, q.name, q.country, count, scope), vendor: 'scrapecreators', costUsd }; } catch { /* fall through to Apify */ }
  }
  if (d.apifyToken) {
    costUsd += apifyCostUsd(count);
    try { return { pages: await viaApify({ ...d, apifyToken: d.apifyToken }, q.name, q.country, count, scope), vendor: 'apify', costUsd }; } catch { /* both unavailable */ }
  }
  return { pages: null, vendor: null, costUsd };
}
