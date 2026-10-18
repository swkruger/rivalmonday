import type { MapsPlace } from '@cs/collectors';
import type { SetupLookup } from '@cs/db';
import type { VerticalPack } from '@cs/verticals';

/** Phase 11a §5: business searches per agency per UTC day (counted from `vendor_call`). */
export const FIND_BUSINESS_DAILY_CAP = 30;

/** First pack (in the given order) whose `discovery.categories` match a GBP category, else the first whose `related_categories` do; case-insensitive exact match. */
export function preselectVertical(packs: VerticalPack[], categories: string[]): string | null {
  const wanted = new Set(categories.map((c) => c.trim().toLowerCase()));
  const hit = (list: string[]) => list.some((c) => wanted.has(c.trim().toLowerCase()));
  return packs.find((p) => hit(p.discovery.categories))?.id ?? packs.find((p) => hit(p.discovery.related_categories))?.id ?? null;
}

/** A vendor place as the wizard's lookup result; null when it can't be used to create a client (no coordinates or place id). */
export function toSetupLookup(p: MapsPlace): SetupLookup | null {
  if (p.lat === null || p.lng === null || p.placeId === null) return null;
  return {
    placeId: p.placeId, cid: p.cid, title: p.title, address: p.address, city: p.city ?? null, category: p.category, phone: p.phone ?? null,
    domain: p.domain, rating: p.rating, votes: p.votes, lat: p.lat, lng: p.lng,
  };
}
