import { type TimedFetch, timedFetch } from '@cs/core/server';
import type { CallScope, LedgerSink } from '@cs/core';
import { safeRecordVendorCall, VendorError } from '../vendors/errors';

/** Assumption (not yet read off an invoice): 20 credits x $0.03/1k overage = $0.0006, rounded up to stay conservative. */
export const STADIA_GEOCODE_USD = 0.001;

export type GeocodeQuery = { line1?: string; city?: string; region?: string; postalCode?: string; text?: string };
export type GeoPoint = { lat: number; lng: number; label: string; precision: 'address' | 'locality' | 'postalcode' };
export type Geocoder = (q: GeocodeQuery, scope: CallScope) => Promise<GeoPoint | null>;

/** Drops query strings (the API key travels there) from any URL in a message. */
const stripQuery = (s: string): string => s.replace(/(https?:\/\/[^\s?#]+)[?#]\S*/g, '$1');

const precisionOf = (layer: unknown): GeoPoint['precision'] => (layer === 'address' || layer === 'venue' ? 'address' : layer === 'postalcode' ? 'postalcode' : 'locality');

/** The free text the geocoder searches: `text` when given, else the typed address parts joined with commas. */
export const geocodeText = (q: GeocodeQuery): string =>
  (q.text ?? [q.line1, q.city, q.region, q.postalCode].filter((p): p is string => !!p && !!p.trim()).map((p) => p.trim()).join(', ')).trim();

/**
 * Stadia Maps geocoding (Pelias `search`), US only, first result. Fixed vendor host; user text only ever lands in the
 * query string (plan P9), and the key is stripped from every error. Pre-client calls ledger with a null `clientId`.
 */
export function createStadiaGeocoder(opts: { apiKey: string; fetch?: TimedFetch; ledger: LedgerSink }): Geocoder {
  return async (q, scope) => {
    const doFetch = opts.fetch ?? timedFetch();
    const params = new URLSearchParams({ text: geocodeText(q), 'boundary.country': 'US', size: '1', api_key: opts.apiKey });
    const started = Date.now();
    let ok = false;
    try {
      let res: Response;
      try {
        res = await doFetch(`https://api.stadiamaps.com/geocoding/v1/search?${params}`, { timeoutMs: 10_000 });
      } catch (err) {
        const msg = err instanceof Error ? stripQuery(err.message).split(opts.apiKey).join('***') : 'unknown error';
        throw new VendorError('stadia', null, `Network error calling Stadia geocoding: ${msg}`, true);
      }
      if (res.status !== 200) throw new VendorError('stadia', res.status, `Stadia geocoding HTTP ${res.status}`, res.status >= 500 || res.status === 429);
      const body = (await res.json().catch(() => null)) as { features?: { geometry?: { coordinates?: unknown }; properties?: { layer?: unknown; label?: unknown } }[] } | null;
      ok = true;
      const f = body?.features?.[0];
      const c = f?.geometry?.coordinates;
      if (!f || !Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') return null;
      return { lat: c[1], lng: c[0], label: typeof f.properties?.label === 'string' ? f.properties.label : geocodeText(q), precision: precisionOf(f.properties?.layer) };
    } finally {
      await safeRecordVendorCall(opts.ledger, { ...scope, vendor: 'stadia', operation: 'geocode', units: 1, costUsd: STADIA_GEOCODE_USD, latencyMs: Date.now() - started, ok });
    }
  };
}
