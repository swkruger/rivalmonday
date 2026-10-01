const KM_PER_DEG_LAT = 111.32;

/** Square grid of size×size points covering ±radiusKm around the center (equirectangular approximation). */
export function gridPoints(center: { lat: number; lng: number }, radiusKm: number, size: number): { lat: number; lng: number }[] {
  if (size <= 1) return [{ lat: center.lat, lng: center.lng }];
  const kmPerDegLng = KM_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180);
  const step = (2 * radiusKm) / (size - 1);
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  const pts: { lat: number; lng: number }[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const northKm = radiusKm - row * step;
      const eastKm = -radiusKm + col * step;
      pts.push({ lat: round(center.lat + northKm / KM_PER_DEG_LAT), lng: round(center.lng + eastKm / kmPerDegLng) });
    }
  }
  return pts;
}
