/** Distances: stored and sent to tools in kilometres, shown and typed in miles (15c spec §3.3). */
export const KM_PER_MILE = 1.609344;

export function kmToMiles(km: number): number {
  return km / KM_PER_MILE;
}

export function milesToKm(mi: number): number {
  return mi * KM_PER_MILE;
}

/** "3 mi"; under one mile one decimal ("0.4 mi"), otherwise whole miles. */
export function formatMiles(km: number): string {
  const mi = kmToMiles(km);
  return mi < 1 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}

/** Pick-step distance: one decimal under 10 mi, whole miles from 10 mi up. */
export function formatMilesAway(km: number): string {
  const mi = kmToMiles(km);
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}

/** The radius choices offered for the service area / rank-scan radius. */
export const RADIUS_MILES = [2, 3, 5, 10, 15, 20, 25] as const;

/** Miles to the stored radius in km (one decimal, capped at the 40 km server bound). */
export function radiusKmFromMiles(mi: number): number {
  return Math.min(Math.round(milesToKm(mi) * 10) / 10, 40);
}

/** The RADIUS_MILES entry that maps to exactly this stored km, or null for a legacy/custom value. */
export function radiusChoiceForKm(km: number): number | null {
  return RADIUS_MILES.find((mi) => radiusKmFromMiles(mi) === km) ?? null;
}

/** Select options for a radius field: the fixed choices (value = km) plus a leading "≈ N mi (custom)" carrying a stored km that matches none. */
export function radiusOptions(storedKm: number | null): { value: string; label: string }[] {
  const opts = RADIUS_MILES.map((mi) => ({ value: String(radiusKmFromMiles(mi)), label: `${mi} mi` }));
  if (storedKm !== null && radiusChoiceForKm(storedKm) === null) {
    return [{ value: String(storedKm), label: `≈ ${Math.round(kmToMiles(storedKm))} mi (custom)` }, ...opts];
  }
  return opts;
}
