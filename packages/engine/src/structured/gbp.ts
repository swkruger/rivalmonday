import { capture, observation } from '@cs/db';
import { and, desc, eq, inArray, isNull, lt } from 'drizzle-orm';
import type { DifferResult, SourceDiffer, StructuredChange } from './vendor-diff';

/** GBP ratings move in tenths; smaller deltas are rounding noise between pulls. */
export const RATING_CHANGE_MIN = 0.1;
/** The "open now / closed now" status flips with the clock; only other values (e.g. closed_forever) are news. */
/** The documented closed values; any other unrecognised status is not compared. */
const CLOSED_STATUS = /^(temporarily_closed|closed_forever)$/i;
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
  description?: string | null;
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
const DESCRIPTION_CHARS = 300;

/** `open` for a transient status (open/close/closing_soon...), else the lowercased raw value (closed_forever...); null when absent. */
export const statusClass = (s: string | null | undefined): string | null =>
  !present(s) ? null : TRANSIENT_STATUS.test(s) ? 'open' : CLOSED_STATUS.test(s) ? s.toLowerCase() : null;

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
    if (a && b && norm(a) !== norm(b)) out.push({ kind: 'modified', blockKey: `gbp:${field}`, beforeText: `${field}: ${a}`, afterText: `${field}: ${b}`, details: { changeType: 'profile_change', field } });
  }
  const h0 = hoursText(before);
  const h1 = hoursText(after);
  if (h0 && h1 && h0 !== h1) out.push({ kind: 'modified', blockKey: 'gbp:hours', beforeText: h0, afterText: h1, details: { changeType: 'profile_change', field: 'hours' } });
  const d0 = before.description;
  const d1 = after.description;
  if (present(d0) && present(d1) && norm(d0) !== norm(d1)) {
    out.push({
      kind: 'modified', blockKey: 'gbp:description',
      beforeText: `description: ${d0.slice(0, DESCRIPTION_CHARS)}`, afterText: `description: ${d1.slice(0, DESCRIPTION_CHARS)}`,
      details: { changeType: 'profile_change', field: 'description' },
    });
  }
  const c0 = statusClass(before.currentStatus);
  const c1 = statusClass(after.currentStatus);
  if (c0 && c1 && c0 !== c1) {
    out.push({
      kind: 'modified', blockKey: 'gbp:status', beforeText: `status: ${before.currentStatus}`, afterText: `status: ${after.currentStatus}`,
      details: { changeType: 'status_change', field: 'status', direction: c1 === 'open' ? 'reopened' : 'closed', statusBefore: before.currentStatus!, statusAfter: after.currentStatus! },
    });
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
const text = (f: 'address' | 'title' | 'domain' | 'description') => (p: GbpProfile) => (present(p[f]) ? norm(p[f] as string) : null);
/** Fields held until a new value is seen on two pulls (vendor noise otherwise), with the comparable value of each. */
export const HELD_GBP = [
  { key: 'gbp:address', value: text('address') }, { key: 'gbp:title', value: text('title') }, { key: 'gbp:domain', value: text('domain') },
  { key: 'gbp:status', value: (p: GbpProfile) => statusClass(p.currentStatus) }, { key: 'gbp:hours', value: hoursText },
  { key: 'gbp:description', value: text('description') },
] as const;
export interface GbpSnapshot { captureId: string; profile: GbpProfile }

/** A review count that falls by more than 20 % or 50 votes in one pull is a vendor glitch, not a purge worth reporting. */
export function implausibleVotesDrop(before: GbpProfile, after: GbpProfile): boolean {
  const b = before.votes;
  const a = after.votes;
  if (typeof b !== 'number' || typeof a !== 'number' || a >= b) return false;
  return b - a > VOTES_DROP_MAX_ABS || (b - a) / b > VOTES_DROP_MAX_RATIO;
}

const heldValue = (s: GbpSnapshot | undefined, h: (typeof HELD_GBP)[number]) => (s ? h.value(s.profile) : null);
const pick = (from: GbpProfile, to: GbpProfile, key: string) => diffGbpProfiles(from, to).find((c) => c.blockKey === key);

/** snaps newest first: [after, prev, prev2?, prev3?]. */
export function guardedGbpDiff(snaps: GbpSnapshot[]): DifferResult {
  const [after, prev, prev2, prev3] = snaps;
  if (!after || !prev) return { changes: [], implausible: 0, held: 0 };
  const guarded = new Set(['gbp:rating', ...HELD_GBP.map((h) => h.key)]);
  const changes = diffGbpProfiles(prev.profile, after.profile).filter((c) => !guarded.has(c.blockKey));
  let implausible = 0;
  let held = 0;
  // (a) A glitch capture (votes collapsed vs an older one) that `after` recovered from is not a baseline (P6),
  // however many captures the glitch lasted. A drop that `after` shares is a persisting purge, not a glitch.
  const window = [prev, prev2, prev3].filter((s): s is GbpSnapshot => !!s);
  const isGlitch = (i: number) => window.slice(i + 1).some((o) => implausibleVotesDrop(o.profile, window[i]!.profile) && !implausibleVotesDrop(o.profile, after.profile));
  const base = window.find((_, i) => !isGlitch(i)) ?? prev;
  const rating = pick(base.profile, after.profile, 'gbp:rating');
  if (rating) {
    if (implausibleVotesDrop(base.profile, after.profile)) implausible++;
    else changes.push(base === prev ? rating : { ...rating, beforeCaptureId: base.captureId });
  }
  // (b) Emit once the new value is seen twice, from the last confirmed value.
  // Per key, over the snapshots that carry a value for it (a pull that omits the field says nothing).
  for (const h of HELD_GBP) {
    const vals = snaps.map((s) => ({ s, v: heldValue(s, h) })).filter((x): x is { s: GbpSnapshot; v: string } => x.v !== null);
    if (vals[0]?.s !== after || vals.length < 2) continue;
    const [now, last, v2, v3] = vals;
    if (now!.v !== last!.v) { held++; continue; }
    if (!v2 || v2.v === now!.v) continue;
    const from = v3 && v3.v !== v2.v ? v3.s : v2.s;
    if (heldValue(from, h) === now!.v) continue;
    const c = pick(from.profile, after.profile, h.key);
    if (c) changes.push({ ...c, beforeCaptureId: from.captureId });
  }
  return { changes, implausible, held };
}

/** Earlier captures GBP may look through to find 3 that carry a profile (an ok capture can lack one). */
const GBP_CANDIDATES = 6;

/**
 * The newest up-to-4 captures that carry a `gbp_profile` (cap first); captures without one are skipped, so they
 * never cut the window between a glitch and its recovery. No profile on `cap` itself: no GBP changes.
 */
export const diffGbp: SourceDiffer = async (db, cap, prev, older) => {
  const known = [prev, ...older];
  // Queried here, not via vendor-diff's previousVendorCaptures: that module imports this one (a value import would be circular).
  const more =
    known.length < GBP_CANDIDATES
      ? await db
          .select()
          .from(capture)
          .where(
            and(
              eq(capture.competitorId, cap.competitorId), eq(capture.source, cap.source), eq(capture.status, 'ok'),
              cap.url === null ? isNull(capture.url) : eq(capture.url, cap.url), lt(capture.capturedAt, cap.capturedAt),
            ),
          )
          .orderBy(desc(capture.capturedAt))
          .limit(GBP_CANDIDATES)
      : known;
  const ordered = [cap, ...more];
  const rows = await db
    .select({ captureId: observation.captureId, data: observation.data })
    .from(observation)
    .where(and(inArray(observation.captureId, ordered.map((c) => c.id)), eq(observation.kind, 'gbp_profile')));
  const byCapture = new Map(rows.map((r) => [r.captureId, r.data as GbpProfile]));
  if (!byCapture.has(cap.id)) return { changes: [], implausible: 0, held: 0 };
  const snaps: GbpSnapshot[] = [];
  for (const c of ordered) {
    const profile = byCapture.get(c.id);
    if (profile && snaps.length < 4) snaps.push({ captureId: c.id, profile });
  }
  if (snaps.length < 2) return { changes: [], implausible: 0, held: 0 };
  const res = guardedGbpDiff(snaps);
  if (res.implausible > 0 || res.held > 0) {
    console.info(`[engine] vendor_diff ${cap.id}: ${res.implausible} implausible rating change(s) suppressed, ${res.held} GBP field change(s) held`);
  }
  return res;
};
