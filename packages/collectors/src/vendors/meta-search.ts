import type { CallScope, LedgerSink } from '@cs/core';
import { APIFY_META_ACTOR, APIFY_META_COUNT } from './apify';
import { safeRecordVendorCall, VendorError } from './errors';

export interface MetaSearchDeps { apiKey?: string; apifyToken?: string; ledger: LedgerSink; fetch?: typeof fetch }
export interface MetaPageHit { pageId: string; pageName: string; activeAds: number }

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

async function viaScrapeCreators(d: MetaSearchDeps & { apiKey: string }, name: string, country: string, scope: CallScope): Promise<MetaPageHit[]> {
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
    return groupByPage(body.searchResults);
  } catch (err) {
    if (err instanceof VendorError) throw err;
    throw new VendorError('scrapecreators', null, 'Network error calling ScrapeCreators', true, { cause: err });
  } finally {
    await safeRecordVendorCall(d.ledger, { ...scope, vendor: 'scrapecreators', operation: 'facebook/adLibrary/search/ads', units: credits ?? 1, costUsd: null, latencyMs: Date.now() - started, ok });
  }
}

async function viaApify(d: MetaSearchDeps & { apifyToken: string }, name: string, country: string, scope: CallScope): Promise<MetaPageHit[]> {
  const doFetch = d.fetch ?? globalThis.fetch;
  const url = new URL('https://www.facebook.com/ads/library/');
  url.search = new URLSearchParams({ active_status: 'active', ad_type: 'all', country, q: name, search_type: 'keyword_unordered', media_type: 'all' }).toString();
  const started = Date.now();
  let ok = false;
  try {
    const res = await doFetch(`https://api.apify.com/v2/actors/${APIFY_META_ACTOR}/run-sync-get-dataset-items`, {
      method: 'POST',
      headers: { authorization: `Bearer ${d.apifyToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ urls: [{ url: url.toString() }], count: APIFY_META_COUNT, limitPerSource: APIFY_META_COUNT, scrapeAdDetails: false }),
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
    await safeRecordVendorCall(d.ledger, { ...scope, vendor: 'apify', operation: `${APIFY_META_ACTOR}/keyword-search`, units: 1, costUsd: null, latencyMs: Date.now() - started, ok });
  }
}

/** Keyword search of the Meta Ad Library for pages advertising under a business name. null = no vendor could answer. */
export async function searchMetaPages(d: MetaSearchDeps, q: { name: string; country: 'US' }, scope: CallScope): Promise<MetaPageHit[] | null> {
  if (d.apiKey) {
    try { return await viaScrapeCreators({ ...d, apiKey: d.apiKey }, q.name, q.country, scope); } catch { /* fall through to Apify */ }
  }
  if (d.apifyToken) {
    try { return await viaApify({ ...d, apifyToken: d.apifyToken }, q.name, q.country, scope); } catch { /* both unavailable */ }
  }
  return null;
}
