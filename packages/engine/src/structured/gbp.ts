import { observation } from '@cs/db';
import { and, eq, inArray } from 'drizzle-orm';
import type { DifferResult, SourceDiffer, StructuredChange } from './vendor-diff';

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

export const VOTES_DROP_MAX_RATIO = 0.2;
export const VOTES_DROP_MAX_ABS = 50;
export const HELD_GBP_FIELDS = ['address', 'title', 'domain'] as const;
export interface GbpSnapshot { captureId: string; profile: GbpProfile }

/** A review count that falls by more than 20 % or 50 votes in one pull is a vendor glitch, not a purge worth reporting. */
export function implausibleVotesDrop(before: GbpProfile, after: GbpProfile): boolean {
  const b = before.votes;
  const a = after.votes;
  if (typeof b !== 'number' || typeof a !== 'number' || a >= b) return false;
  return b - a > VOTES_DROP_MAX_ABS || (b - a) / b > VOTES_DROP_MAX_RATIO;
}

const heldValue = (s: GbpSnapshot | undefined, f: (typeof HELD_GBP_FIELDS)[number]) => (present(s?.profile[f]) ? norm(s!.profile[f] as string) : null);
const pick = (from: GbpProfile, to: GbpProfile, key: string) => diffGbpProfiles(from, to).find((c) => c.blockKey === key);

/** snaps newest first: [after, prev, prev2?, prev3?]. */
export function guardedGbpDiff(snaps: GbpSnapshot[]): DifferResult {
  const [after, prev, prev2, prev3] = snaps;
  if (!after || !prev) return { changes: [], implausible: 0, held: 0 };
  const guarded = new Set(['gbp:rating', ...HELD_GBP_FIELDS.map((f) => `gbp:${f}`)]);
  const changes = diffGbpProfiles(prev.profile, after.profile).filter((c) => !guarded.has(c.blockKey));
  let implausible = 0;
  let held = 0;
  // (a) A glitch capture that `after` recovered from is not a baseline (P6).
  const base = prev2 && implausibleVotesDrop(prev2.profile, prev.profile) && !implausibleVotesDrop(prev2.profile, after.profile) ? prev2 : prev;
  const rating = pick(base.profile, after.profile, 'gbp:rating');
  if (rating) {
    if (implausibleVotesDrop(base.profile, after.profile)) implausible++;
    else changes.push(base === prev ? rating : { ...rating, beforeCaptureId: base.captureId });
  }
  // (b) Emit once the new value is seen twice, from the last confirmed value.
  for (const f of HELD_GBP_FIELDS) {
    const now = heldValue(after, f);
    const last = heldValue(prev, f);
    if (now === null || last === null) continue;
    if (now !== last) { held++; continue; }
    const v2 = heldValue(prev2, f);
    if (v2 === null || v2 === now) continue;
    const v3 = heldValue(prev3, f);
    const from = prev3 && v3 !== null && v3 !== v2 ? prev3 : prev2!;
    if (heldValue(from, f) === now) continue;
    const c = pick(from.profile, after.profile, `gbp:${f}`);
    if (c) changes.push({ ...c, beforeCaptureId: from.captureId });
  }
  return { changes, implausible, held };
}

export const diffGbp: SourceDiffer = async (db, cap, prev, older) => {
  const ordered = [cap, prev, ...older];
  const rows = await db
    .select({ captureId: observation.captureId, data: observation.data })
    .from(observation)
    .where(and(inArray(observation.captureId, ordered.map((c) => c.id)), eq(observation.kind, 'gbp_profile')));
  const byCapture = new Map(rows.map((r) => [r.captureId, r.data as GbpProfile]));
  const snaps: GbpSnapshot[] = [];
  for (const c of ordered) {
    const profile = byCapture.get(c.id);
    if (!profile) break;
    snaps.push({ captureId: c.id, profile });
  }
  if (snaps.length < 2) return { changes: [], implausible: 0, held: 0 };
  const res = guardedGbpDiff(snaps);
  if (res.implausible > 0 || res.held > 0) {
    console.info(`[engine] vendor_diff ${cap.id}: ${res.implausible} implausible rating change(s) suppressed, ${res.held} GBP field change(s) held`);
  }
  return res;
};
