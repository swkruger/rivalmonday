import type { Feature } from '@cs/core';
import type { ServiceArea } from '@cs/db';
import type { VerticalPack } from '@cs/verticals';

export interface ClientInput {
  name: string;
  services: string[];
  keywords: string[];
  serviceArea: ServiceArea | null;
  placeId: string | null;
  features: Feature[];
}

export const MAX_KEYWORDS = 5;
const ZIP = /^\d{5}$/;
const PLACE_ID = /^[A-Za-z0-9_-]{10,200}$/;

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = raw.trim().replace(/\s+/g, ' ');
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out;
}

export function cleanClientInput(input: ClientInput): ClientInput {
  const area = input.serviceArea;
  return {
    name: input.name.trim(),
    services: [...new Set(input.services)],
    keywords: dedupe(input.keywords),
    placeId: input.placeId?.trim() || null,
    features: [...new Set(input.features)],
    serviceArea: area
      ? { center: area.center, radiusKm: area.radiusKm, zips: [...new Set(area.zips.map((z) => z.trim()).filter(Boolean))], ...(area.towns ? { towns: dedupe(area.towns) } : {}) }
      : null,
  };
}

/** Decision 4. Messages are shown to the AM as-is. */
export function clientInputProblems(input: ClientInput, pack: VerticalPack): string[] {
  const p: string[] = [];
  if (input.name.length < 1 || input.name.length > 120) p.push('Name is required (up to 120 characters)');
  const known = new Set(pack.services.map((s) => s.id));
  for (const s of input.services) if (!known.has(s)) p.push(`Unknown service: ${s}`);
  if (input.keywords.length > MAX_KEYWORDS) p.push(`Use at most ${MAX_KEYWORDS} keywords`);
  if (input.keywords.some((k) => k.length < 2 || k.length > 60)) p.push('Keywords must be 2–60 characters');
  if (input.placeId !== null && !PLACE_ID.test(input.placeId)) p.push('Google place id looks wrong');
  const a = input.serviceArea;
  if (a) {
    if (!(a.center.lat >= -90 && a.center.lat <= 90)) p.push('Latitude must be between -90 and 90');
    if (!(a.center.lng >= -180 && a.center.lng <= 180)) p.push('Longitude must be between -180 and 180');
    if (!(a.radiusKm >= 1 && a.radiusKm <= 80)) p.push('Radius must be 1–80 km');
    const badZips = a.zips.filter((z) => !ZIP.test(z));
    if (badZips.length) p.push(`ZIP codes must be 5 digits: ${badZips.join(', ')}`);
    if (a.zips.length > 100) p.push('Use at most 100 ZIP codes');
    if ((a.towns?.length ?? 0) > 30) p.push('Use at most 30 towns');
    if (a.towns?.some((t) => t.length < 2 || t.length > 60)) p.push('Town names must be 2–60 characters');
  }
  return p;
}
