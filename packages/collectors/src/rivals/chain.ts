import { normaliseName } from './names';

/** Normalised brands appearing with at least 3 distinct placeIds in the run's raw results. */
export function detectChains(raw: { name: string; placeId: string }[]): Set<string> {
  const byBrand = new Map<string, Set<string>>();
  for (const r of raw) {
    const brand = normaliseName(r.name);
    if (!brand) continue;
    const ids = byBrand.get(brand) ?? new Set<string>();
    ids.add(r.placeId);
    byBrand.set(brand, ids);
  }
  return new Set([...byBrand].filter(([, ids]) => ids.size >= 3).map(([b]) => b));
}
