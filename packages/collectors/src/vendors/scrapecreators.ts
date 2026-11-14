import { type TimedFetch, timedFetch } from '@cs/core/server';
import type { CallScope, LedgerSink } from '@cs/core';
import { safeRecordVendorCall, VendorError } from './errors';

export interface ScrapeCreatorsOpts { apiKey: string; ledger: LedgerSink; fetch?: TimedFetch }
type ScBody = Record<string, unknown>;

/**
 * One ScrapeCreators GET: 60 s timeout, `VendorError` on HTTP/body failures, one `vendor_call` ledger row
 * (`operation` as given, `units` = `credits_charged ?? 1`, `costUsd` null). `check` runs inside the ledgered
 * attempt, so a body it rejects is recorded as `ok: false`. Returns the parsed body and the next cursor
 * (the vendor's terminal `cursor: ""` is normalised to `null`).
 */
export async function scRequest(
  opts: ScrapeCreatorsOpts,
  path: string,
  query: Record<string, string>,
  operation: string,
  scope: CallScope,
  check?: (body: ScBody) => void,
): Promise<{ body: ScBody; cursor: string | null }> {
  const doFetch = opts.fetch ?? timedFetch();
  const started = Date.now();
  let ok = false;
  let credits: number | null = null;
  try {
    const res = await doFetch(`https://api.scrapecreators.com${path}?${new URLSearchParams(query)}`, { headers: { 'x-api-key': opts.apiKey }, timeoutMs: 60_000 });
    if (!res.ok) throw new VendorError('scrapecreators', res.status, `ScrapeCreators HTTP ${res.status}`, res.status >= 500 || res.status === 429);
    const body = (await res.json().catch(() => null)) as (ScBody & { success?: boolean; cursor?: string | null; credits_charged?: number }) | null;
    if (!body) throw new VendorError('scrapecreators', null, 'Unexpected ScrapeCreators body', false);
    if (body.success === false) throw new VendorError('scrapecreators', null, 'ScrapeCreators reported success=false', false);
    check?.(body);
    credits = typeof body.credits_charged === 'number' ? body.credits_charged : null;
    ok = true;
    // Live-verified 2026-10-01: on the terminal page the vendor sends `cursor: ""` (an empty
    // string), not `null`/absent. `??` only coalesces null/undefined, so it must be treated as
    // falsy here too, or a complete response gets misreported as truncated.
    return { body, cursor: body.cursor || null };
  } catch (err) {
    if (err instanceof VendorError) throw err;
    throw new VendorError('scrapecreators', null, 'Network error calling ScrapeCreators', true, { cause: err });
  } finally {
    // costUsd unknown (credit-based); credits recorded as units.
    await safeRecordVendorCall(opts.ledger, { ...scope, vendor: 'scrapecreators', operation, units: credits ?? 1, costUsd: null, latencyMs: Date.now() - started, ok });
  }
}

/**
 * Follows the cursor for up to `maxPages` pages (default 3). `truncated` is true when the page
 * limit stopped the loop with a cursor still left: more active ads exist than were fetched.
 */
export async function fetchMetaAdsScrapeCreators(
  opts: ScrapeCreatorsOpts & { maxPages?: number },
  pageId: string,
  scope: CallScope,
): Promise<{ items: unknown[]; truncated: boolean }> {
  const out: unknown[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < (opts.maxPages ?? 3); page++) {
    const query: Record<string, string> = { pageId, country: 'US', status: 'ACTIVE' };
    if (cursor) query.cursor = cursor;
    const res = await scRequest(opts, '/v1/facebook/adLibrary/company/ads', query, 'facebook/adLibrary/company/ads', scope, (body) => {
      if (!Array.isArray(body.results)) throw new VendorError('scrapecreators', null, 'Unexpected ScrapeCreators body', false);
    });
    out.push(...(res.body.results as unknown[]));
    cursor = res.cursor;
    if (!cursor) break;
  }
  return { items: out, truncated: cursor !== null };
}
