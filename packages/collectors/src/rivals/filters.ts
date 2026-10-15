import type { ServiceArea } from '@cs/db';
import type { DiscoveryConfig } from '@cs/verticals';
import { digitsOnly, normaliseDomain } from './names';

export type Candidate = {
  placeId: string; cid: string | null; name: string; category: string | null; additionalCategories: string[];
  lat: number | null; lng: number | null; rating: number | null; votes: number | null; domain: string | null; phone: string | null;
  isClaimed: boolean | null; closed: boolean; ranks: number[]; // one per search it appeared in
};
export type HiddenReason = 'wrong_category' | 'outside_area' | 'self' | 'closed' | 'thin';
export type KeptCandidate = Candidate & { distanceKm: number | null; categoryMatch: 'main' | 'related' };

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Dedupe by placeId then cid, merging ranks. Not by domain: chain locations share one domain
 * (Aspen Dental) and must stay distinct for chain detection and per-location overlap.
 */
function dedupe(cands: Candidate[]): Candidate[] {
  const byPlace = new Map<string, Candidate>();
  const byCid = new Map<string, Candidate>();
  const out: Candidate[] = [];
  for (const c of cands) {
    const hit = byPlace.get(c.placeId) ?? (c.cid ? byCid.get(c.cid) : undefined);
    if (hit) { hit.ranks = [...hit.ranks, ...c.ranks]; continue; }
    const copy = { ...c, ranks: [...c.ranks] };
    byPlace.set(copy.placeId, copy);
    if (copy.cid) byCid.set(copy.cid, copy);
    out.push(copy);
  }
  return out;
}

export function filterCandidates(
  cands: Candidate[],
  ctx: { pack: DiscoveryConfig; area: ServiceArea; self: { placeId: string | null; cid: string | null; domain: string | null; phone: string | null } },
): { kept: KeptCandidate[]; hidden: { candidate: Candidate; reason: HiddenReason }[] } {
  const lc = (xs: string[]) => new Set(xs.map((x) => x.trim().toLowerCase()));
  const main = lc(ctx.pack.categories);
  const related = lc(ctx.pack.related_categories);
  const selfDomain = normaliseDomain(ctx.self.domain);
  const selfPhone = digitsOnly(ctx.self.phone);
  const kept: KeptCandidate[] = [];
  const hidden: { candidate: Candidate; reason: HiddenReason }[] = [];

  for (const c of dedupe(cands)) {
    const hide = (reason: HiddenReason) => hidden.push({ candidate: c, reason });
    const isSelf =
      (ctx.self.placeId != null && c.placeId === ctx.self.placeId) ||
      (ctx.self.cid != null && c.cid === ctx.self.cid) ||
      (selfDomain != null && normaliseDomain(c.domain) === selfDomain) ||
      (selfPhone != null && digitsOnly(c.phone) === selfPhone);
    if (isSelf) { hide('self'); continue; }
    if (c.closed) { hide('closed'); continue; }

    const cat = c.category?.trim().toLowerCase() ?? '';
    const adds = c.additionalCategories.map((x) => x.trim().toLowerCase());
    let categoryMatch: 'main' | 'related' | null = null;
    if (main.has(cat)) categoryMatch = 'main';
    else if (related.has(cat) || adds.some((a) => main.has(a) || related.has(a))) categoryMatch = 'related';
    if (!categoryMatch) { hide('wrong_category'); continue; }

    const distanceKm = c.lat != null && c.lng != null ? haversineKm(ctx.area.center, { lat: c.lat, lng: c.lng }) : null;
    if (distanceKm != null && distanceKm > ctx.area.radiusKm * 1.25) { hide('outside_area'); continue; }
    if (!c.votes && !c.domain) { hide('thin'); continue; }
    kept.push({ ...c, distanceKm, categoryMatch });
  }
  return { kept, hidden };
}
