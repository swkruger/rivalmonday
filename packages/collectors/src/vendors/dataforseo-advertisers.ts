import type { CallScope } from '@cs/core';
import { type DataForSeoClient, VendorError, isDfsOk, isNoResults, isRetryableDfsCode } from './dataforseo';

export interface GoogleAdvertiser { id: string; name: string; domain: string | null; verified: boolean }

/** Google Ads Transparency advertiser lookup by name near a point. The result list also holds `ads_domain` rows, which are skipped. */
export async function searchGoogleAdvertisers(dfs: DataForSeoClient, q: { name: string; lat: number; lng: number }, scope: CallScope): Promise<GoogleAdvertiser[]> {
  const [task] = await dfs.post('/serp/google/ads_advertisers/live/advanced', [{ keyword: q.name, location_coordinate: `${q.lat},${q.lng}` }], scope);
  if (!task) throw new VendorError('dataforseo', null, 'empty task', false);
  if (isNoResults(task)) return [];
  if (!isDfsOk(task.statusCode)) throw new VendorError('dataforseo', task.statusCode, task.statusMessage, isRetryableDfsCode(task.statusCode));
  const items = (task.result[0] as { items?: unknown[] } | undefined)?.items ?? [];
  const out: GoogleAdvertiser[] = [];
  for (const raw of items) {
    const i = raw as { type?: string; advertiser_id?: unknown; title?: unknown; domain?: unknown; verified?: unknown } | null;
    if (!i || i.type !== 'ads_advertiser' || typeof i.advertiser_id !== 'string' || typeof i.title !== 'string') continue;
    out.push({ id: i.advertiser_id, name: i.title, domain: typeof i.domain === 'string' ? i.domain : null, verified: i.verified === true });
  }
  return out;
}
