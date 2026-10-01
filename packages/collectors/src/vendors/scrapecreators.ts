import type { LedgerSink } from '@cs/core';
import { safeRecordVendorCall, VendorError } from './errors';

/**
 * Follows the cursor for up to `maxPages` pages (default 3). `truncated` is true when the page
 * limit stopped the loop with a cursor still left: more active ads exist than were fetched.
 */
export async function fetchMetaAdsScrapeCreators(
  opts: { apiKey: string; ledger: LedgerSink; fetch?: typeof fetch; maxPages?: number },
  pageId: string,
): Promise<{ items: unknown[]; truncated: boolean }> {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const out: unknown[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < (opts.maxPages ?? 3); page++) {
    const params = new URLSearchParams({ pageId, country: 'US', status: 'ACTIVE' });
    if (cursor) params.set('cursor', cursor);
    const started = Date.now();
    let ok = false;
    let credits: number | null = null;
    try {
      const res = await doFetch(`https://api.scrapecreators.com/v1/facebook/adLibrary/company/ads?${params}`, { headers: { 'x-api-key': opts.apiKey }, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new VendorError('scrapecreators', res.status, `ScrapeCreators HTTP ${res.status}`, res.status >= 500 || res.status === 429);
      const body = (await res.json().catch(() => null)) as { success?: boolean; results?: unknown[]; cursor?: string | null; credits_charged?: number } | null;
      if (!body) throw new VendorError('scrapecreators', null, 'Unexpected ScrapeCreators body', false);
      if (body.success === false) throw new VendorError('scrapecreators', null, 'ScrapeCreators reported success=false', false);
      if (!Array.isArray(body.results)) throw new VendorError('scrapecreators', null, 'Unexpected ScrapeCreators body', false);
      out.push(...body.results);
      credits = body.credits_charged ?? null;
      cursor = body.cursor ?? null;
      ok = true;
    } catch (err) {
      if (err instanceof VendorError) throw err;
      throw new VendorError('scrapecreators', null, 'Network error calling ScrapeCreators', true, { cause: err });
    } finally {
      // costUsd unknown (credit-based); credits recorded as units.
      await safeRecordVendorCall(opts.ledger, { agencyId: null, clientId: null, vendor: 'scrapecreators', operation: 'facebook/adLibrary/company/ads', units: credits ?? 1, costUsd: null, latencyMs: Date.now() - started, ok });
    }
    if (!cursor) break;
  }
  return { items: out, truncated: cursor !== null };
}
