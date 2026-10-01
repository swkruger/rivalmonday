import { client, competitorSuggestion, type Db } from '@cs/db';
import { eq, sql } from 'drizzle-orm';
import type { DataForSeoClient } from '../vendors/dataforseo';
import { gridPoints } from './grid';
import { mapsSearch } from './maps';

export async function suggestCompetitors(
  deps: { db: Db; dfs: DataForSeoClient },
  clientId: string,
  opts: { gridSize?: number; maxKeywords?: number } = {},
): Promise<{ suggested: number; searches: number }> {
  const [c] = await deps.db.select().from(client).where(eq(client.id, clientId)).limit(1);
  if (!c) throw new Error(`Client ${clientId} not found`);
  const maxKeywords = Math.min(opts.maxKeywords ?? 2, 5);
  const keywords = c.keywords.slice(0, maxKeywords);
  if (keywords.length === 0 || !c.serviceArea) throw new Error('Client needs keywords and a service area before competitor discovery');

  // Bounds paid live DataForSEO calls: gridSize=7 × maxKeywords=5 is already 245 live searches.
  const gridSize = Math.min(opts.gridSize ?? 3, 7);
  const points = gridPoints(c.serviceArea.center, c.serviceArea.radiusKm, gridSize);
  const scope = { agencyId: c.agencyId, clientId: c.id };
  const agg = new Map<string, { name: string; domain: string | null; placeId: string | null; cid: string | null; rating: number | null; votes: number | null; appearances: number; bestRank: number }>();
  let searches = 0;
  for (const keyword of keywords) {
    for (const pt of points) {
      const { places } = await mapsSearch(deps.dfs, { keyword, lat: pt.lat, lng: pt.lng }, scope);
      searches++;
      for (const p of places) {
        if (c.placeId && p.placeId === c.placeId) continue;
        const key = p.placeId ?? p.cid ?? p.title.toLowerCase();
        const cur = agg.get(key);
        if (cur) {
          cur.appearances++;
          cur.bestRank = Math.min(cur.bestRank, p.rank);
        } else {
          agg.set(key, { name: p.title, domain: p.domain, placeId: p.placeId, cid: p.cid, rating: p.rating, votes: p.votes, appearances: 1, bestRank: p.rank });
        }
      }
    }
  }
  const rows = [...agg.values()].filter((a) => a.placeId).map((a) => ({
    agencyId: c.agencyId, clientId: c.id, name: a.name, domain: a.domain, placeId: a.placeId, cid: a.cid, rating: a.rating, votes: a.votes,
    appearances: a.appearances, bestRank: a.bestRank, overlapScore: a.appearances / searches,
  }));
  if (rows.length > 0) {
    await deps.db.insert(competitorSuggestion).values(rows).onConflictDoUpdate({
      target: [competitorSuggestion.clientId, competitorSuggestion.placeId],
      set: { appearances: sql`excluded.appearances`, bestRank: sql`excluded.best_rank`, overlapScore: sql`excluded.overlap_score`, rating: sql`excluded.rating`, votes: sql`excluded.votes` },
    });
  }
  return { suggested: rows.length, searches };
}
