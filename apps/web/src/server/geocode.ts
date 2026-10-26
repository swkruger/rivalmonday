import 'server-only';
import { createStadiaGeocoder, type GeocodeQuery, type GeoPoint, geocodeText } from '@cs/collectors';
import { createLedgerSink, type Db, type EnvName } from '@cs/db';
import type { ToolDeps } from '@cs/tools';

type Geocode = NonNullable<ToolDeps['geocode']>;

const AUSTIN: GeoPoint = { lat: 30.2672, lng: -97.7431, label: 'Austin, TX, USA', precision: 'locality' };

/** The fixed answer E2E and DEMO get, never a paid call: Austin for any query with a ZIP or a city, `null` for "nowhere" or nothing typed. */
export const fixtureGeocode: Geocode = async (q: GeocodeQuery) => {
  const text = geocodeText(q);
  if (!text || /nowhere/i.test(text)) return null;
  return /\b\d{5}\b/.test(text) || q.city?.trim() || /[a-z]{3}/i.test(text) ? AUSTIN : null;
};

/**
 * Phase 16 (O13): the geocoder behind `ToolDeps.geocode`. Fixture under `SETUP_FAKE_LOOKUP` and in the DEMO/TEST
 * environments (demo never spends); otherwise Stadia with the cost-ledger sink. No key means absent.
 */
export function geocodeFor(name: EnvName, service: Db, env: { fake: boolean; apiKey?: string }): Geocode | undefined {
  if (env.fake || name === 'demo' || name === 'test') return fixtureGeocode;
  if (!env.apiKey) return undefined;
  return createStadiaGeocoder({ apiKey: env.apiKey, ledger: createLedgerSink(service) });
}
