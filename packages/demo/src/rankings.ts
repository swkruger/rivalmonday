import { rankScan, rankSnapshot, type RankResult } from '@cs/db';
import type { SeedContext } from './context';
import { distanceKm, type LatLng } from './geo';
import type { ActiveClientKey } from './ids';
import { CLIENT_SPECS, LONE_STAR_PLACE_ID } from './tenancy';

export const GRID_SIZE = 7;
export const FILLER_BUSINESSES = [
  'Rapid Air Solutions', 'Cowboy Comfort Systems', 'Texan Temp Control', 'Bluebonnet Heating & Air', 'North Texas Air Pros', 'Weatherford Air Experts',
  'Stephenville Service Co', 'Glen Rose Mechanical', 'Lake Country Plumbing', 'Pinnacle Plumbing & Air', 'Frontier Home Services', 'Cedar Creek Comfort',
  'Hood County Heating', 'Prairie Wind HVAC',
] as const;

export interface GridPoint extends LatLng {
  row: number;
  col: number;
}

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Row 0 is the north edge, column 0 the west edge, spanning the service-area diameter. */
export function gridPoints(center: LatLng, radiusKm: number): GridPoint[] {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  const out: GridPoint[] = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      out.push({ row, col, lat: r6(center.lat + dLat - (2 * dLat * row) / (GRID_SIZE - 1)), lng: r6(center.lng - dLng + (2 * dLng * col) / (GRID_SIZE - 1)) });
    }
  }
  return out;
}

interface Ranked extends LatLng {
  key: string;
  title: string;
  placeId: string;
  domain: string | null;
  /** One base strength per keyword. */
  strength: number[];
}

const edge = (p: GridPoint) => p.row === 0 || p.col === 0 || p.row === GRID_SIZE - 1 || p.col === GRID_SIZE - 1;

/** Spec §4.6. */
export async function seedRankings(ctx: SeedContext): Promise<void> {
  for (const key of ['loneStar', 'brazos'] as const) await seedClientScans(ctx, key);
}

async function seedClientScans(ctx: SeedContext, key: ActiveClientKey): Promise<void> {
  const rng = ctx.rng(`rankings:${key}`);
  const spec = CLIENT_SPECS[key];
  const { center, radiusKm } = spec.serviceArea;
  const keywords = spec.keywords;
  const three = () => [rng.between(0.5, 2.5), rng.between(0.5, 2.5), rng.between(0.5, 2.5)];
  const businesses: Ranked[] = [
    ...(key === 'loneStar' ? [{ key: 'self', title: 'Lone Star Cooling', placeId: LONE_STAR_PLACE_ID, domain: 'lone-star-cooling.example', lat: 32.447, lng: -97.798, strength: [3.2, 2.8, 1.0] }] : []),
    ...ctx.ids.competitors[key].filter((c) => c.id !== ctx.ids.noData.rankings)
      .map((c, i) => ({ key: c.id, title: c.name, placeId: c.placeId, domain: c.domain, lat: c.lat, lng: c.lng, strength: [2.6 - i * 0.2, 2.4 - i * 0.15, 2.2 - i * 0.1].map((s) => s + rng.between(-0.3, 0.3)) })),
    ...FILLER_BUSINESSES.map((title, i) => ({
      key: `filler-${i}`, title, placeId: `demo-filler-${i}`, domain: null, lat: center.lat + rng.between(-0.15, 0.15), lng: center.lng + rng.between(-0.15, 0.15), strength: three(),
    })),
  ];
  const points = gridPoints(center, radiusKm);
  for (let w = 7; w >= 0; w--) {
    const finishedAt = ctx.clock.daysAgo(w * 7 + 1);
    const startedAt = new Date(finishedAt.getTime() - 20 * 60_000);
    const base = { agencyId: ctx.ids.agencyId, clientId: ctx.ids.clients[key] };
    if (key === 'loneStar' && w === 5) {
      // Spec §4.6: one failed scan.
      await ctx.db.insert(rankScan).values({ ...base, status: 'failed', snapshots: 0, failed: points.length * keywords.length, startedAt, finishedAt });
      continue;
    }
    const growth = (7 - w) * 0.12; // Lone Star slowly gains share of voice
    const snaps: Omit<typeof rankSnapshot.$inferInsert, 'scanId'>[] = [];
    for (const [k, keyword] of keywords.entries()) {
      for (const p of points) {
        if (key === 'loneStar' && w === 3 && k === 0 && p.row === GRID_SIZE - 1 && p.col === GRID_SIZE - 1) continue; // one failed grid point → "no data"
        let ranked = businesses
          .map((b) => ({ b, s: b.strength[k]! + (b.key === 'self' ? growth : 0) - distanceKm(p, b) / 6 + rng.between(-0.6, 0.6) }))
          .sort((x, y) => y.s - x.s)
          .map((x) => x.b);
        // Spec §4.6: one keyword where the client's own business is outside the top 20 at the edge of the area.
        if (key === 'loneStar' && k === 2 && edge(p)) ranked = ranked.filter((b) => b.key !== 'self');
        const results: RankResult[] = ranked.slice(0, 20).map((b, i) => ({ rank: i + 1, placeId: b.placeId, cid: null, domain: b.domain, title: b.title }));
        snaps.push({ ...base, keyword, lat: p.lat, lng: p.lng, results, capturedAt: finishedAt });
      }
    }
    const [scan] = await ctx.db.insert(rankScan).values({ ...base, status: 'done', snapshots: snaps.length, failed: points.length * keywords.length - snaps.length, startedAt, finishedAt }).returning({ id: rankScan.id });
    for (let i = 0; i < snaps.length; i += 200) await ctx.db.insert(rankSnapshot).values(snaps.slice(i, i + 200).map((s) => ({ ...s, scanId: scan!.id })));
  }
}
