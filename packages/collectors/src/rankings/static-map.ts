import type { CallScope, LatLng, LedgerSink } from '@cs/core';
import { safeRecordVendorCall, VendorError } from '../vendors/errors';

export const STADIA_ATTRIBUTION = '© Stadia Maps © OpenMapTiles © OpenStreetMap contributors';
/** 2,000 credits × $0.03/1k (Starter overage rate) per cacheable static image. */
export const STADIA_CACHEABLE_STATIC_USD = 0.06;

export interface StaticMapClient {
  fetchStatic(q: { center: LatLng; zoom: number; width: number; height: number }, scope: CallScope): Promise<Uint8Array>;
}

/** Drops query strings (the API key travels there) from any URL in a message. */
const stripQuery = (s: string): string => s.replace(/(https?:\/\/[^\s?#]+)[?#]\S*/g, '$1');

/**
 * Stadia Maps static images via the `static_cacheable` endpoint, which is the one that licenses storing the image
 * (never `/static/`). `size` is the logical size; `@2x` makes the PNG twice as large for retina.
 */
export function createStadiaStaticClient(opts: { apiKey: string; style?: string; fetch?: typeof fetch; ledger: LedgerSink }): StaticMapClient {
  const style = opts.style ?? 'alidade_smooth';
  return {
    async fetchStatic(q, scope) {
      const doFetch = opts.fetch ?? globalThis.fetch;
      const params = new URLSearchParams({
        center: `${q.center.lat},${q.center.lng}`,
        zoom: String(q.zoom),
        size: `${q.width}x${q.height}@2x`,
        manual_attribution: 'true',
        api_key: opts.apiKey,
      });
      const started = Date.now();
      let ok = false;
      try {
        let res: Response;
        try {
          res = await doFetch(`https://tiles.stadiamaps.com/static_cacheable/${style}.png?${params}`, { signal: AbortSignal.timeout(10_000) });
        } catch (err) {
          const msg = err instanceof Error ? stripQuery(err.message).split(opts.apiKey).join('***') : 'unknown error';
          throw new VendorError('stadia', null, `Network error calling Stadia Maps: ${msg}`, true);
        }
        if (res.status !== 200) throw new VendorError('stadia', res.status, `Stadia Maps HTTP ${res.status}`, res.status >= 500 || res.status === 429);
        const type = res.headers.get('content-type') ?? '';
        if (!type.toLowerCase().startsWith('image/png')) throw new VendorError('stadia', res.status, `Stadia Maps returned ${type || 'no content type'}, expected image/png`, false);
        const bytes = new Uint8Array(await res.arrayBuffer());
        ok = true;
        return bytes;
      } finally {
        await safeRecordVendorCall(opts.ledger, { ...scope, vendor: 'stadia', operation: 'static_cacheable', units: 1, costUsd: STADIA_CACHEABLE_STATIC_USD, latencyMs: Date.now() - started, ok });
      }
    },
  };
}
