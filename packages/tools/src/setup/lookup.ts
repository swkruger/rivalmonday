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

/** Digits only, a leading US "1" dropped from 11 digits; fewer than 7 digits -> null (too short to compare). */
export function phoneKey(p: string | null): string | null {
  if (!p) return null;
  let d = p.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.length < 7 ? null : d;
}

/** Trimmed, lowercased, `www.` stripped; empty -> null. */
export function domainKey(d: string | null): string | null {
  const k = (d ?? '').trim().toLowerCase().replace(/^www\./, '');
  return k === '' ? null : k;
}

/** P4: the same `placeId`, or the same non-null `cid`, is one listing. The first (best-ranked) row wins; a twin's `isClaimed: true` carries over. */
export function collapseSameListing<T extends { placeId: string; cid: string | null; isClaimed: boolean | null }>(rows: T[]): T[] {
  const kept: T[] = [];
  for (const r of rows) {
    const i = kept.findIndex((k) => k.placeId === r.placeId || (r.cid !== null && k.cid === r.cid));
    if (i < 0) kept.push({ ...r });
    else if (r.isClaimed === true) kept[i] = { ...kept[i]!, isClaimed: true };
  }
  return kept;
}

const EARTH_KM = 6371;
/** Great-circle distance in km. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
export const DUPLICATE_DOMAIN_KM = 0.5;

type DupRow = { phone: string | null; domain: string | null; lat: number | null; lng: number | null };

/** D4 (owner ruling): two rows are twins when they share a phone, or share a domain AND both have coordinates within 0.5 km. */
function twins(a: DupRow, b: DupRow): boolean {
  const pa = phoneKey(a.phone);
  if (pa !== null && pa === phoneKey(b.phone)) return true;
  const da = domainKey(a.domain);
  if (da === null || da !== domainKey(b.domain)) return false;
  if (a.lat === null || a.lng === null || b.lat === null || b.lng === null) return false;
  return haversineKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }) <= DUPLICATE_DOMAIN_KM;
}

/** D4: per row, true when it is a twin of at least one other shown row (<= 5 rows, so pairwise is fine). */
export function possibleDuplicates(rows: DupRow[]): boolean[] {
  return rows.map((r, i) => rows.some((o, j) => j !== i && twins(r, o)));
}
