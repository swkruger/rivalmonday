import { observation } from '@cs/db';
import { and, eq } from 'drizzle-orm';
import type { SourceDiffer, StructuredChange } from './vendor-diff';

/** GBP ratings move in tenths; smaller deltas are rounding noise between pulls. */
export const RATING_CHANGE_MIN = 0.1;
/** The "open now / closed now" status flips with the clock; only other values (e.g. closed_forever) are news. */
const TRANSIENT_STATUS = /^(open|close|closed|opening_soon|closing_soon)$/i;

type Hm = { hour?: number; minute?: number };
/** The `gbp_profile` observation written by `extractGbpProfile` (Phase 2b, address added in 3b). */
export interface GbpProfile {
  title?: string | null;
  category?: string | null;
  additionalCategories?: string[] | null;
  rating?: number | null;
  votes?: number | null;
  phone?: string | null;
  url?: string | null;
  domain?: string | null;
  currentStatus?: string | null;
  address?: string | null;
  services?: unknown;
  workHours?: unknown;
}

const present = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
/**
 * A pull that omits a list (null, not []) says nothing about it — diffing it as empty would report every
 * entry removed, then added back on the next pull. So each part is compared only when both pulls carry it:
 * the primary category when both have one, the additional categories and services when both are arrays.
 */
const categories = (p: GbpProfile, other: GbpProfile) => [
  ...(present(p.category) && present(other.category) ? [p.category] : []),
  ...(Array.isArray(p.additionalCategories) && Array.isArray(other.additionalCategories) ? p.additionalCategories.filter(present) : []),
];
const services = (p: GbpProfile, other: GbpProfile) =>
  Array.isArray(p.services) && Array.isArray(other.services)
    ? p.services.map((s) => (s && typeof s === 'object' ? (s as { title?: unknown }).title : null)).filter(present)
    : [];
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

function hoursText(p: GbpProfile): string | null {
  const timetable = (p.workHours as { work_hours?: { timetable?: Record<string, { open?: Hm; close?: Hm }[] | null> } } | null | undefined)?.work_hours?.timetable;
  if (!timetable || typeof timetable !== 'object') return null;
  const hm = (x?: Hm) => (x ? `${String(x.hour ?? 0).padStart(2, '0')}:${String(x.minute ?? 0).padStart(2, '0')}` : '?');
  return `hours: ${Object.entries(timetable)
    .map(([day, spans]) => `${day} ${Array.isArray(spans) && spans.length > 0 ? spans.map((s) => `${hm(s.open)}–${hm(s.close)}`).join(', ') : 'closed'}`)
    .join('; ')}`;
}

/** Field-level differences between two GBP profiles. Each change type is fixed here (no model choice). */
export function diffGbpProfiles(before: GbpProfile, after: GbpProfile): StructuredChange[] {
  const out: StructuredChange[] = [];
  for (const [field, list] of [['category', categories], ['service', services]] as const) {
    const was = new Map(list(before, after).map((x) => [norm(x), x]));
    const now = new Map(list(after, before).map((x) => [norm(x), x]));
    for (const [k, x] of now) if (!was.has(k)) out.push({ kind: 'added', blockKey: `gbp:${field}:${k}`, beforeText: null, afterText: x, details: { changeType: 'new_service', field } });
    for (const [k, x] of was) if (!now.has(k)) out.push({ kind: 'removed', blockKey: `gbp:${field}:${k}`, beforeText: x, afterText: null, details: { changeType: 'service_removed', field } });
  }
  if (before.address && after.address && norm(before.address) !== norm(after.address)) {
    out.push({ kind: 'modified', blockKey: 'gbp:address', beforeText: before.address, afterText: after.address, details: { changeType: 'new_location', field: 'address' } });
  }
  for (const field of ['title', 'domain'] as const) {
    const a = before[field];
    const b = after[field];
    if (a && b && norm(a) !== norm(b)) out.push({ kind: 'modified', blockKey: `gbp:${field}`, beforeText: `${field}: ${a}`, afterText: `${field}: ${b}`, details: { changeType: 'content', field } });
  }
  const h0 = hoursText(before);
  const h1 = hoursText(after);
  if (h0 && h1 && h0 !== h1) out.push({ kind: 'modified', blockKey: 'gbp:hours', beforeText: h0, afterText: h1, details: { changeType: 'content', field: 'hours' } });
  const s0 = before.currentStatus;
  const s1 = after.currentStatus;
  if (s0 && s1 && s0 !== s1 && !(TRANSIENT_STATUS.test(s0) && TRANSIENT_STATUS.test(s1))) {
    out.push({ kind: 'modified', blockKey: 'gbp:status', beforeText: `status: ${s0}`, afterText: `status: ${s1}`, details: { changeType: 'content', field: 'status' } });
  }
  const r0 = before.rating;
  const r1 = after.rating;
  if (typeof r0 === 'number' && typeof r1 === 'number' && Math.abs(r1 - r0) >= RATING_CHANGE_MIN - 1e-9) {
    out.push({
      kind: 'modified', blockKey: 'gbp:rating',
      beforeText: `rating ${r0} (${before.votes ?? '?'} reviews)`, afterText: `rating ${r1} (${after.votes ?? '?'} reviews)`,
      details: { changeType: 'rating_change', field: 'rating', ratingBefore: r0, ratingAfter: r1, votesBefore: before.votes ?? null, votesAfter: after.votes ?? null },
    });
  }
  return out;
}

const loadProfile = async (db: Parameters<SourceDiffer>[0], captureId: string): Promise<GbpProfile | null> => {
  const [row] = await db.select({ data: observation.data }).from(observation).where(and(eq(observation.captureId, captureId), eq(observation.kind, 'gbp_profile'))).limit(1);
  return (row?.data as GbpProfile | undefined) ?? null;
};

export const diffGbp: SourceDiffer = async (db, cap, prev) => {
  const [before, after] = await Promise.all([loadProfile(db, prev.id), loadProfile(db, cap.id)]);
  return before && after ? diffGbpProfiles(before, after) : [];
};
