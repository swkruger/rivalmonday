import { describe, expect, it } from 'vitest';
import { fitStaticMap, insideBounds, projectToImage, rankGridBounds, RANK_MAP_MAX_PX, STATIC_MAP_WORLD_PX, type GeoBounds, type LatLng } from './geo';

const RAD = Math.PI / 180;
const KM_PER_DEG_LAT = 111.32;
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2));

/** Mirrors packages/collectors/src/local/grid.ts gridPoints (same spacing and offsets). */
function collectorGridPoints(center: LatLng, radiusKm: number, size: number): LatLng[] {
  const kmPerDegLng = KM_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180);
  const step = (2 * radiusKm) / (size - 1);
  const pts: LatLng[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const northKm = radiusKm - row * step;
      const eastKm = -radiusKm + col * step;
      pts.push({ lat: center.lat + northKm / KM_PER_DEG_LAT, lng: center.lng + eastKm / kmPerDegLng });
    }
  }
  return pts;
}

/** Grid extent (no padding) of the collector grid for a set of points. */
function extentOf(pts: LatLng[]): GeoBounds {
  return {
    west: Math.min(...pts.map((p) => p.lng)),
    east: Math.max(...pts.map((p) => p.lng)),
    south: Math.min(...pts.map((p) => p.lat)),
    north: Math.max(...pts.map((p) => p.lat)),
  };
}

/** Mercator-fraction sizes of a bbox (share of world width / Mercator height), as fitStaticMap computes them. */
function fracs(b: GeoBounds) {
  return {
    x: ((b.east - b.west) * RAD) / (2 * Math.PI),
    y: (mercY(b.north) - mercY(b.south)) / (2 * Math.PI),
  };
}

describe('rankGridBounds', () => {
  it('bounds pad the grid by half a cell', () => {
    // 7×7 grid over ±15 km: step = 30/6 = 5 km, so the padded radius is 17.5 km.
    const center = { lat: 30, lng: -97 };
    const b = rankGridBounds(center, 15, 7);
    const dLat = 17.5 / KM_PER_DEG_LAT;
    const dLng = 17.5 / (KM_PER_DEG_LAT * Math.cos(30 * RAD));
    expect(b.north - center.lat).toBeCloseTo(dLat, 12);
    expect(center.lat - b.south).toBeCloseTo(dLat, 12);
    expect(center.lng - b.west).toBeCloseTo(dLng, 12);
    expect(b.east - center.lng).toBeCloseTo(dLng, 12);
  });
});

describe('fitStaticMap', () => {
  const cases: { name: string; center: LatLng; radiusKm: number; gridSize: number }[] = [
    { name: 'small Texas grid', center: { lat: 30, lng: -97 }, radiusKm: 2, gridSize: 5 },
    { name: 'large Seattle grid', center: { lat: 47.6, lng: -122.33 }, radiusKm: 40, gridSize: 7 },
  ];

  it('frame bounds aspect equals image aspect', () => {
    for (const c of cases) {
      const frame = fitStaticMap(rankGridBounds(c.center, c.radiusKm, c.gridSize));
      const b = frame.bounds;
      const mercatorRatio = ((b.east - b.west) * RAD) / (mercY(b.north) - mercY(b.south));
      expect(Math.abs(mercatorRatio - frame.width / frame.height), c.name).toBeLessThan(1e-9);
    }
  });

  it('zoom is the largest integer whose image fits maxPx', () => {
    for (const c of cases) {
      const b = rankGridBounds(c.center, c.radiusKm, c.gridSize);
      const frame = fitStaticMap(b);
      const f = fracs(b);
      const fitsAt = (z: number) => {
        const scale = STATIC_MAP_WORLD_PX * 2 ** z;
        return Math.ceil(f.x * scale) <= RANK_MAP_MAX_PX && Math.ceil(f.y * scale) <= RANK_MAP_MAX_PX;
      };
      expect(frame.zoom, c.name).toBeGreaterThan(0);
      expect(fitsAt(frame.zoom), c.name).toBe(true);
      expect(fitsAt(frame.zoom + 1), c.name).toBe(false);
      expect(frame.width, c.name).toBeLessThanOrEqual(RANK_MAP_MAX_PX);
      expect(frame.height, c.name).toBeLessThanOrEqual(RANK_MAP_MAX_PX);
    }
  });

  it('frame bounds contain the grid bounds', () => {
    for (const c of cases) {
      const grid = extentOf(collectorGridPoints(c.center, c.radiusKm, c.gridSize));
      const frame = fitStaticMap(rankGridBounds(c.center, c.radiusKm, c.gridSize));
      expect(frame.bounds.west, c.name).toBeLessThanOrEqual(grid.west);
      expect(frame.bounds.east, c.name).toBeGreaterThanOrEqual(grid.east);
      expect(frame.bounds.south, c.name).toBeLessThanOrEqual(grid.south);
      expect(frame.bounds.north, c.name).toBeGreaterThanOrEqual(grid.north);
    }
  });

  it('min width 256 / min height 64 widen the frame around the same centre', () => {
    const b = rankGridBounds({ lat: 30, lng: -97 }, 2, 5);
    const base = fitStaticMap(b);
    const wide = fitStaticMap(b, { minWidth: 1000, minHeight: 300 });
    expect(wide.width).toBeGreaterThanOrEqual(1000);
    expect(wide.height).toBeGreaterThanOrEqual(300);
    expect(wide.center.lat).toBeCloseTo(base.center.lat, 9);
    expect(wide.center.lng).toBeCloseTo(base.center.lng, 9);
    // Defaults apply when no minimum is given.
    expect(base.width).toBeGreaterThanOrEqual(256);
    expect(base.height).toBeGreaterThanOrEqual(64);
  });
});

describe('projectToImage', () => {
  const b: GeoBounds = { west: -98, east: -96, south: 29, north: 31 };

  it('projects bounds corners to image corners', () => {
    const nw = projectToImage({ lat: b.north, lng: b.west }, b, 400, 300);
    const se = projectToImage({ lat: b.south, lng: b.east }, b, 400, 300);
    expect(nw.x).toBeCloseTo(0, 6);
    expect(nw.y).toBeCloseTo(0, 6);
    expect(se.x).toBeCloseTo(400, 6);
    expect(se.y).toBeCloseTo(300, 6);
  });

  it('centre lands at the image centre horizontally and on the Mercator midline', () => {
    const midLat = Math.atan(Math.sinh((mercY(b.north) + mercY(b.south)) / 2)) / RAD;
    const p = projectToImage({ lat: midLat, lng: (b.west + b.east) / 2 }, b, 400, 300);
    expect(p.x).toBeCloseTo(200, 6);
    expect(p.y).toBeCloseTo(150, 6);
  });

  it('round-trip within 0.5 px at lat 47.6 with a 40 km radius', () => {
    const center = { lat: 47.6, lng: -122.33 };
    const size = 5;
    const radiusKm = 40;
    const frame = fitStaticMap(rankGridBounds(center, radiusKm, size));
    const pts = collectorGridPoints(center, radiusKm, size);
    const px = pts.map((p) => projectToImage(p, frame.bounds, frame.width, frame.height));
    for (const p of px) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(frame.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(frame.height);
    }
    // Columns are equally spaced in x (longitude is linear in the image).
    const firstGap = px[1].x - px[0].x;
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size - 1; col++) {
        const i = row * size + col;
        expect(Math.abs(px[i + 1].x - px[i].x - firstGap)).toBeLessThan(0.5);
      }
    }
  });
});

describe('insideBounds', () => {
  const b: GeoBounds = { west: -98, east: -96, south: 29, north: 31 };

  it('insideBounds is inclusive', () => {
    expect(insideBounds({ lat: 30, lng: -97 }, b)).toBe(true);
    expect(insideBounds({ lat: 31, lng: -96 }, b)).toBe(true); // north-east corner
    expect(insideBounds({ lat: 29, lng: -98 }, b)).toBe(true); // south-west corner
    expect(insideBounds({ lat: 31.0001, lng: -97 }, b)).toBe(false);
    expect(insideBounds({ lat: 30, lng: -98.0001 }, b)).toBe(false);
    expect(insideBounds({ lat: 28.9999, lng: -97 }, b)).toBe(false);
    expect(insideBounds({ lat: 30, lng: -95.9999 }, b)).toBe(false);
  });
});
