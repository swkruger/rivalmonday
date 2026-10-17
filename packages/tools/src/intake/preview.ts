import type { MapsPlace } from '@cs/collectors';
import type { JsonSchemaFormat } from '@cs/ai';
import type { LeadPreview, SetupLookup } from '@cs/db';

// Phase 11c Task 29 (spec §4): pure snapshot, facts and summary validation for the free competitive preview.

type Snap = Extract<LeadPreview, { status: 'ready' }>;

const MAX_NEARBY = 5;

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Own listing excluded, nearest 5 with coordinates (distance to one decimal). Null when no usable nearby business remains. */
export function buildSnapshot(self: SetupLookup, nearby: MapsPlace[]): Snap | null {
  const origin = { lat: self.lat, lng: self.lng };
  const rows = nearby
    .filter((p) => p.placeId !== self.placeId && p.lat != null && p.lng != null && !p.closed && p.title.trim() !== '')
    .map((p) => ({ name: p.title, rating: p.rating, votes: p.votes, distanceKm: Math.round(haversineKm(origin, { lat: p.lat as number, lng: p.lng as number }) * 10) / 10 }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, MAX_NEARBY);
  if (rows.length === 0) return null;
  const category = self.category ?? '';
  const snap = { status: 'ready' as const, self: { name: self.title, rating: self.rating, votes: self.votes }, nearby: rows, facts: [] as string[], summary: null, category, generatedAt: new Date().toISOString() };
  snap.facts = snapshotFacts(snap);
  return snap;
}

/** Deterministic facts: review-count rank, rating rank and the closest competitor. */
export function snapshotFacts(s: Pick<Snap, 'self' | 'nearby' | 'category'>): string[] {
  const total = s.nearby.length + 1;
  const facts: string[] = [];
  const noun = s.category.trim() ? `nearby ${s.category.trim().toLowerCase()} businesses` : 'nearby businesses';
  const rank = (mine: number, others: (number | null)[]) => 1 + others.filter((o) => o != null && o > mine).length;
  facts.push(`You rank ${rank(s.self.votes ?? 0, s.nearby.map((b) => b.votes))} of ${total} for review count among you and the ${noun}.`);
  if (s.self.rating != null) facts.push(`You rank ${rank(s.self.rating, s.nearby.map((b) => b.rating))} of ${total} for Google rating among you and the ${noun}.`);
  const closest = [...s.nearby].sort((a, b) => a.distanceKm - b.distanceKm)[0];
  if (closest) facts.push(`The closest competitor is ${closest.name}, ${closest.distanceKm.toFixed(1)} km away.`);
  return facts;
}

/** Returns the trimmed summary, or null when it states a number or capitalised name that is not in the snapshot, or uses a deny-listed word. */
export function validateSummary(summary: string, s: Pick<Snap, 'self' | 'nearby'>): string | null {
  const DENY = /\b(best|guarantee[ds]?|#\s?1|number one|will rank|lawsuit|sue)\b/i;
  if (DENY.test(summary) || summary.length > 600) return null;
  const allowed = new Set<string>();
  const add = (n: number | null | undefined) => {
    if (n == null) return;
    allowed.add(String(n));
    allowed.add(n.toFixed(1));
    allowed.add(String(Math.round(n)));
  };
  add(s.self.rating);
  add(s.self.votes);
  s.nearby.forEach((b) => {
    add(b.rating);
    add(b.votes);
    add(b.distanceKm);
  });
  add(s.nearby.length);
  for (let i = 1; i <= s.nearby.length; i++) add(i);
  for (const m of summary.matchAll(/\d+(?:\.\d+)?/g)) if (!allowed.has(m[0])) return null;
  const names = [s.self.name, ...s.nearby.map((b) => b.name)].map((n) => n.toLowerCase());
  for (const m of summary.matchAll(/\b[A-Z][\w'&-]*(?:\s+[A-Z][\w'&-]*)+/g)) {
    const cand = m[0].toLowerCase();
    if (!names.some((n) => n.includes(cand) || cand.includes(n))) return null;
  }
  return summary.trim();
}

export const LEAD_SUMMARY_SYSTEM =
  'Write 2–3 plain sentences for a local business owner comparing their Google rating and review count with these nearby businesses. Use only the numbers and names in the JSON. No advice, no promises.';

export const leadSummaryJsonSchema: JsonSchemaFormat = {
  name: 'lead_preview_summary',
  schema: { type: 'object', additionalProperties: false, required: ['summary'], properties: { summary: { type: 'string' } } },
};
