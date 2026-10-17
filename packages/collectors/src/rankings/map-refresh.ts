import { fitStaticMap, rankGridBounds } from '@cs/core';
import { agencyServiceable, client, clientServiceable, type Db, rankMapImage } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { and, eq } from 'drizzle-orm';
import { rankMapSettingsHash, rankRadiusKm } from './settings';
import type { StaticMapClient } from './static-map';

/**
 * Keeps the client's rank-grid background image current: fetches a Stadia static map for the grid's frame when the
 * settings hash changed, stores the PNG in the evidence store and upserts `rank_map_image`. Throws on vendor
 * failure (pg-boss retries); `maps === null` (no STADIA_API_KEY) is a no-op.
 */
export async function refreshRankMap(
  deps: { db: Db; store: ObjectStore; maps: StaticMapClient | null },
  clientId: string,
): Promise<'unchanged' | 'stored' | 'skipped'> {
  if (!deps.maps) return 'skipped';
  const [c] = await deps.db
    .select()
    .from(client)
    .where(and(eq(client.id, clientId), clientServiceable(client), agencyServiceable(client.agencyId)))
    .limit(1);
  if (!c?.serviceArea) return 'skipped';
  const radiusKm = rankRadiusKm(c.serviceArea.radiusKm);
  const hash = rankMapSettingsHash({ center: c.serviceArea.center, radiusKm, gridSize: c.rankGridSize });
  const [existing] = await deps.db.select({ hash: rankMapImage.settingsHash }).from(rankMapImage).where(eq(rankMapImage.clientId, clientId)).limit(1);
  if (existing?.hash === hash) return 'unchanged';

  const frame = fitStaticMap(rankGridBounds(c.serviceArea.center, radiusKm, c.rankGridSize));
  const png = await deps.maps.fetchStatic(
    { center: frame.center, zoom: frame.zoom, width: frame.width, height: frame.height },
    { agencyId: c.agencyId, clientId },
  );
  const objectKey = `rank-map/${clientId}/${hash}.png`;
  await deps.store.put(objectKey, png, 'image/png');
  const row = { agencyId: c.agencyId, settingsHash: hash, objectKey, bounds: frame.bounds, width: frame.width, height: frame.height, fetchedAt: new Date() };
  await deps.db.insert(rankMapImage).values({ clientId, ...row }).onConflictDoUpdate({ target: rankMapImage.clientId, set: row });
  return 'stored';
}
