import { client, type Db, type RankResult, rankScan, rankSnapshot } from '@cs/db';
import { eq } from 'drizzle-orm';
import { gridPoints } from '../local/grid';
import { mapsSearch } from '../local/maps';
import { type DataForSeoClient, VendorError } from '../vendors/dataforseo';

/**
 * Scans a client's keywords across a grid of map points and stores one tenant-scoped rank_snapshot per
 * keyword x point, grouped under one rank_scan (Phase 3b: rank deltas compare scan to scan). Snapshots
 * store parsed results only (captureId stays null; the capture table requires a competitor) — no
 * evidence is recorded for this vendor call.
 *
 * Bounds paid live DataForSEO calls: gridSize=7 x maxKeywords=5 is already 245 live searches (~$0.49)
 * per client per run.
 *
 * A VendorError on one point is logged and counted in `failed`, and the scan moves on (no snapshot is
 * stored for that point) — the job runs once (no pg-boss retry), so aborting would lose the rest of an
 * already-paid scan. Any other error (DB, bug) marks the scan failed and still throws. A scan that stored
 * no snapshot at all is marked failed too.
 */
export async function scanRankings(
  deps: { db: Db; dfs: DataForSeoClient },
  clientId: string,
  opts: { gridSize?: number; maxKeywords?: number; depth?: number } = {},
): Promise<{ snapshots: number; failed: number; scanId: string | null }> {
  const [c] = await deps.db.select().from(client).where(eq(client.id, clientId)).limit(1);
  if (!c?.serviceArea || c.keywords.length === 0) return { snapshots: 0, failed: 0, scanId: null };
  const gridSize = Math.min(opts.gridSize ?? 7, 7);
  const maxKeywords = Math.min(opts.maxKeywords ?? 5, 5);
  const depth = Math.min(opts.depth ?? 20, 20);
  const points = gridPoints(c.serviceArea.center, c.serviceArea.radiusKm, gridSize);
  const scope = { agencyId: c.agencyId, clientId: c.id };
  const [scan] = await deps.db.insert(rankScan).values({ agencyId: c.agencyId, clientId: c.id }).returning({ id: rankScan.id });
  const scanId = scan!.id;
  let snapshots = 0;
  let failed = 0;
  try {
    for (const keyword of c.keywords.slice(0, maxKeywords)) {
      for (const pt of points) {
        let places: Awaited<ReturnType<typeof mapsSearch>>['places'];
        try {
          ({ places } = await mapsSearch(deps.dfs, { keyword, lat: pt.lat, lng: pt.lng, depth }, scope));
        } catch (err) {
          if (!(err instanceof VendorError)) throw err;
          failed++;
          console.warn(`[rank-scan] ${clientId} "${keyword}" @ ${pt.lat},${pt.lng}: ${err.message} (code ${err.code ?? 'n/a'}) — point skipped`);
          continue;
        }
        const results: RankResult[] = places.map((p) => ({ rank: p.rank, placeId: p.placeId, cid: p.cid, domain: p.domain, title: p.title }));
        await deps.db.insert(rankSnapshot).values({ agencyId: c.agencyId, clientId: c.id, scanId, keyword, lat: pt.lat, lng: pt.lng, results });
        snapshots++;
      }
    }
  } catch (err) {
    await deps.db.update(rankScan).set({ status: 'failed', snapshots, failed, finishedAt: new Date() }).where(eq(rankScan.id, scanId));
    throw err;
  }
  // A scan that stored nothing (every point failed) is not a done scan: rank diff would treat it as one.
  await deps.db.update(rankScan).set({ status: snapshots > 0 ? 'done' : 'failed', snapshots, failed, finishedAt: new Date() }).where(eq(rankScan.id, scanId));
  return { snapshots, failed, scanId };
}
