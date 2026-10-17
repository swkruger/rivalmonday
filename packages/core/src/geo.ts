export interface LatLng { lat: number; lng: number }
export interface GeoBounds { west: number; south: number; east: number; north: number }
export interface StaticMapFrame { center: LatLng; zoom: number; width: number; height: number; bounds: GeoBounds }

export const KM_PER_DEG_LAT = 111.32; // same constant as collectors/local/grid.ts
/** Pixel width of the whole world at zoom 0 for the static-map provider (Stadia, GL-rendered: 512). Re-confirm with the Task 7 probe. */
export const STATIC_MAP_WORLD_PX = 512;
export const RANK_MAP_MAX_PX = 1024;
const RAD = Math.PI / 180;
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2));
const invMercY = (y: number) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD;

/** The scan grid's extent (gridPoints spans ±radiusKm) padded by half a cell on every side. */
export function rankGridBounds(center: LatLng, radiusKm: number, gridSize: number): GeoBounds {
  const step = gridSize > 1 ? (2 * radiusKm) / (gridSize - 1) : 2 * radiusKm;
  const r = radiusKm + step / 2;
  const dLat = r / KM_PER_DEG_LAT;
  const dLng = r / (KM_PER_DEG_LAT * Math.cos(center.lat * RAD));
  return { west: center.lng - dLng, south: center.lat - dLat, east: center.lng + dLng, north: center.lat + dLat };
}

/**
 * Frames `b` for a centre + integer-zoom static map: the largest zoom whose image of `b` fits `maxPx` on both axes,
 * an image size that covers `b` (at least `minWidth` × `minHeight`), and the exact bounds that image spans.
 */
export function fitStaticMap(
  b: GeoBounds,
  opts: { worldPx?: number; maxPx?: number; minWidth?: number; minHeight?: number } = {},
): StaticMapFrame {
  const worldPx = opts.worldPx ?? STATIC_MAP_WORLD_PX;
  const maxPx = opts.maxPx ?? RANK_MAP_MAX_PX;
  const xFrac = ((b.east - b.west) * RAD) / (2 * Math.PI); // share of the world's width
  const yFrac = (mercY(b.north) - mercY(b.south)) / (2 * Math.PI); // share of the world's Mercator height
  const zoom = Math.max(0, Math.min(18, Math.floor(Math.log2(maxPx / (Math.max(xFrac, yFrac) * worldPx)))));
  const scale = worldPx * 2 ** zoom; // world size in pixels at this zoom
  const width = Math.max(opts.minWidth ?? 256, Math.ceil(xFrac * scale));
  const height = Math.max(opts.minHeight ?? 64, Math.ceil(yFrac * scale));
  const cx = (b.east + b.west) / 2;
  const cy = (mercY(b.north) + mercY(b.south)) / 2;
  const halfX = (width / scale) * 180; // degrees
  const halfY = (height / scale) * Math.PI; // Mercator radians
  return {
    center: { lat: invMercY(cy), lng: cx },
    zoom,
    width,
    height,
    bounds: { west: cx - halfX, east: cx + halfX, north: invMercY(cy + halfY), south: invMercY(cy - halfY) },
  };
}

/** Pixel position of a point inside an image that spans `b` (Web Mercator, origin top-left). */
export function projectToImage(p: LatLng, b: GeoBounds, width: number, height: number): { x: number; y: number } {
  const x = ((p.lng - b.west) / (b.east - b.west)) * width;
  const y = ((mercY(b.north) - mercY(p.lat)) / (mercY(b.north) - mercY(b.south))) * height;
  return { x, y };
}

export const insideBounds = (p: LatLng, b: GeoBounds): boolean => p.lng >= b.west && p.lng <= b.east && p.lat >= b.south && p.lat <= b.north;
