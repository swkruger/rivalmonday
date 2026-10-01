import { client, type Db, type RankResult, rankSnapshot } from '@cs/db';
import { eq } from 'drizzle-orm';
import { gridPoints } from '../local/grid';
import { mapsSearch } from '../local/maps';
import type { DataForSeoClient } from '../vendors/dataforseo';

/**
 * Scans a client's keywords across a grid of map points and stores one
 * tenant-scoped rank_snapshot per keyword x point. Snapshots store parsed
 * results only (captureId stays null; the capture table requires a
 * competitor) -- no evidence is recorded for this vendor call.
 *
 * Bounds paid live DataForSEO calls: gridSize=7 x maxKeywords=5 is already
 * 245 live searches (~$0.49) per client per run.
 */
export async function scanRankings(
  deps: { db: Db; dfs: DataForSeoClient },
  clientId: string,
  opts: { gridSize?: number; maxKeywords?: number; depth?: number } = {},
): Promise<{ snapshots: number }> {
  const [c] = await deps.db.select().from(client).where(eq(client.id, clientId)).limit(1);
  if (!c?.serviceArea || c.keywords.length === 0) return { snapshots: 0 };
  const gridSize = Math.min(opts.gridSize ?? 7, 7);
  const maxKeywords = Math.min(opts.maxKeywords ?? 5, 5);
  const depth = Math.min(opts.depth ?? 20, 20);
  const points = gridPoints(c.serviceArea.center, c.serviceArea.radiusKm, gridSize);
  const scope = { agencyId: c.agencyId, clientId: c.id };
  let snapshots = 0;
  for (const keyword of c.keywords.slice(0, maxKeywords)) {
    for (const pt of points) {
      const { places } = await mapsSearch(deps.dfs, { keyword, lat: pt.lat, lng: pt.lng, depth }, scope);
      const results: RankResult[] = places.map((p) => ({ rank: p.rank, placeId: p.placeId, cid: p.cid, domain: p.domain, title: p.title }));
      await deps.db.insert(rankSnapshot).values({ agencyId: c.agencyId, clientId: c.id, keyword, lat: pt.lat, lng: pt.lng, results });
      snapshots++;
    }
  }
  return { snapshots };
}
