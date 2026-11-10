import { createHash } from 'node:crypto';
import { capture, observation } from '@cs/db';
import { and, desc, eq, inArray, isNull, lt } from 'drizzle-orm';
import type { DifferResult, SourceDiffer, StructuredChange } from './vendor-diff';

/** GBP ratings move in tenths; smaller deltas are rounding noise between pulls. */
export const RATING_CHANGE_MIN = 0.1;
/** The documented closed values; any other unrecognised status is not compared. */
const CLOSED_STATUS = /^(temporarily_closed|closed_forever)$/i;
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
  description?: string | null;
  services?: unknown;
  workHours?: unknown;
  /** Raw `attributes` ({ available_attributes: { <group>: string[] } | null, ... }). */
  attributes?: unknown;
  /** 18b-1: `total_photos`; absent on older observations. */
  totalPhotos?: number | null;
  /** 18b-1: the URL; `''` = the pull carries the field but no link; null/absent = the pull says nothing (collect-gbp.ts). */
  bookOnlineUrl?: string | null;
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
/** Short fingerprint of a field's new normalised value: lets novelty tell two different edits of one field apart. */
const valueHash = (s: string) => createHash('sha256').update(norm(s)).digest('hex').slice(0, 12);
const DESCRIPTION_CHARS = 300;

/** Photo push (18b-1 D7): at least this many new photos against a base captured 21–35 days earlier. */
export const PHOTO_PUSH_MIN = 20;
const PHOTO_BASE_MIN_DAYS = 21;
const PHOTO_BASE_MAX_DAYS = 35;
const DAY_MS = 86_400_000;

/**
 * Comparable booking-link value: null when the pull says nothing, `'none'` when it carries no link, else the lowercased
 * host + path (no scheme, query, fragment, `www.` or trailing slash: tracking parameters are not a new link).
 */
export function bookingValue(p: GbpProfile): string | null {
  const u = p.bookOnlineUrl;
  if (u === null || u === undefined) return null;
  const t = u.trim();
  if (!t) return 'none';
  let hostPath: string;
  try {
    const x = new URL(t);
    hostPath = `${x.host}${x.pathname}`;
  } catch {
    hostPath = t.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/[?#].*$/, '');
  }
  return hostPath.toLowerCase().replace(/^www\./, '').replace(/\/+$/, '') || 'none';
}

/** Sorted `group/name` list of `attributes.available_attributes`; null when the pull omits it (says nothing). */
export function attributeList(p: GbpProfile): string[] | null {
  const a = p.attributes;
  const av = a && typeof a === 'object' ? (a as { available_attributes?: unknown }).available_attributes : undefined;
  if (!av || typeof av !== 'object' || Array.isArray(av)) return null;
  const out = new Set<string>();
  for (const [group, names] of Object.entries(av as Record<string, unknown>)) {
    if (Array.isArray(names)) for (const n of names) if (present(n)) out.add(`${group}/${n}`);
  }
  return [...out].sort();
}

/** Client-facing label of a GBP attribute id (`group/` prefix allowed): `has_`/`is_` dropped, `offers_` kept as a word. */
export function humanizeAttribute(name: string): string {
  const bare = name.slice(name.lastIndexOf('/') + 1);
  return bare.replace(/^(has|is)_/, '').replace(/_+/g, ' ').trim();
}

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
    if (a && b && norm(a) !== norm(b)) out.push({ kind: 'modified', blockKey: `gbp:${field}`, beforeText: `${field}: ${a}`, afterText: `${field}: ${b}`, details: { changeType: 'profile_change', field, after: valueHash(b) } });
  }
  const h0 = hoursText(before);
  const h1 = hoursText(after);
  if (h0 && h1 && h0 !== h1) out.push({ kind: 'modified', blockKey: 'gbp:hours', beforeText: h0, afterText: h1, details: { changeType: 'profile_change', field: 'hours', after: valueHash(h1) } });
  const d0 = before.description;
  const d1 = after.description;
  if (present(d0) && present(d1) && norm(d0) !== norm(d1)) {
    out.push({
      kind: 'modified', blockKey: 'gbp:description',
      beforeText: `description: ${d0.slice(0, DESCRIPTION_CHARS)}`, afterText: `description: ${d1.slice(0, DESCRIPTION_CHARS)}`,
      details: { changeType: 'profile_change', field: 'description', after: valueHash(d1) },
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
  const b0 = bookingValue(before);
  const b1 = bookingValue(after);
  if (b0 !== null && b1 !== null && b0 !== b1) {
    out.push({
      kind: b0 === 'none' ? 'added' : b1 === 'none' ? 'removed' : 'modified', blockKey: 'gbp:booking',
      beforeText: b0 === 'none' ? null : `booking: ${before.bookOnlineUrl!.trim()}`, afterText: b1 === 'none' ? null : `booking: ${after.bookOnlineUrl!.trim()}`,
      details: { changeType: 'profile_change', field: 'booking', after: valueHash(b1) },
    });
  }
  const l0 = attributeList(before);
  const l1 = attributeList(after);
  if (l0 && l1) {
    const was = new Set(l0);
    const now = new Set(l1);
    for (const x of l1) if (!was.has(x)) out.push({ kind: 'added', blockKey: `gbp:attribute:${x}`, beforeText: null, afterText: `attribute: ${x}`, details: { changeType: 'profile_change', field: 'attribute', after: valueHash(`added ${x}`) } });
    for (const x of l0) if (!now.has(x)) out.push({ kind: 'removed', blockKey: `gbp:attribute:${x}`, beforeText: `attribute: ${x}`, afterText: null, details: { changeType: 'profile_change', field: 'attribute', after: valueHash(`removed ${x}`) } });
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
interface HeldField {
  key: string;
  value: (p: GbpProfile) => string | null;
  /** The change block keys this held field owns (default: its own key); attributes own one key per attribute. */
  owns?: (blockKey: string) => boolean;
}
/** Fields held until a new value is seen on two pulls (vendor noise otherwise), with the comparable value of each. */
export const HELD_GBP: readonly HeldField[] = [
  { key: 'gbp:address', value: text('address') }, { key: 'gbp:title', value: text('title') }, { key: 'gbp:domain', value: text('domain') },
  { key: 'gbp:status', value: (p: GbpProfile) => statusClass(p.currentStatus) }, { key: 'gbp:hours', value: hoursText },
  { key: 'gbp:description', value: text('description') },
  { key: 'gbp:booking', value: bookingValue },
  { key: 'gbp:attributes', value: (p: GbpProfile) => attributeList(p)?.join('|') ?? null, owns: (k) => k.startsWith('gbp:attribute:') },
];
const owns = (h: HeldField, blockKey: string) => (h.owns ? h.owns(blockKey) : blockKey === h.key);
export interface GbpSnapshot { captureId: string; profile: GbpProfile; capturedAt: Date }

/** A review count that falls by more than 20 % or 50 votes in one pull is a vendor glitch, not a purge worth reporting. */
export function implausibleVotesDrop(before: GbpProfile, after: GbpProfile): boolean {
  const b = before.votes;
  const a = after.votes;
  if (typeof b !== 'number' || typeof a !== 'number' || a >= b) return false;
  return b - a > VOTES_DROP_MAX_ABS || (b - a) / b > VOTES_DROP_MAX_RATIO;
}

const heldValue = (s: GbpSnapshot | undefined, h: HeldField) => (s ? h.value(s.profile) : null);
const pick = (from: GbpProfile, to: GbpProfile, key: string) => diffGbpProfiles(from, to).find((c) => c.blockKey === key);

/**
 * Photo push (not held: counts don't flicker): `after` gained at least PHOTO_PUSH_MIN photos against the newest snapshot
 * captured 21–35 days earlier that carries a count. No such base, or a drop: nothing. snaps newest first.
 */
function photoPush(snaps: GbpSnapshot[]): StructuredChange | null {
  const [after, ...rest] = snaps;
  const n1 = after?.profile.totalPhotos;
  if (!after || typeof n1 !== 'number') return null;
  const daysBefore = (s: GbpSnapshot) => Math.round((after.capturedAt.getTime() - s.capturedAt.getTime()) / DAY_MS);
  const base = rest.find((s) => typeof s.profile.totalPhotos === 'number' && daysBefore(s) >= PHOTO_BASE_MIN_DAYS && daysBefore(s) <= PHOTO_BASE_MAX_DAYS);
  if (!base) return null;
  const n0 = base.profile.totalPhotos as number;
  if (n1 - n0 < PHOTO_PUSH_MIN) return null;
  return {
    kind: 'modified', blockKey: 'gbp:photos', beforeText: `photos: ${n0}`, afterText: `photos: ${n1}`, beforeCaptureId: base.captureId,
    // `after` = month bucket: novelty treats repeat pushes within a month as one story.
    details: { changeType: 'profile_change', field: 'photos', count: n1 - n0, days: daysBefore(base), after: after.capturedAt.toISOString().slice(0, 7) },
  };
}

/**
 * snaps newest first: [after, prev, prev2?, prev3?, ...older]. The rating guard and held fields look at the newest 4;
 * the photo push looks through all of them for its 21–35-day base.
 */
export function guardedGbpDiff(snaps: GbpSnapshot[]): DifferResult {
  const recent = snaps.slice(0, 4);
  const [after, prev, prev2, prev3] = recent;
  if (!after || !prev) return { changes: [], implausible: 0, held: 0 };
  const changes = diffGbpProfiles(prev.profile, after.profile).filter((c) => c.blockKey !== 'gbp:rating' && !HELD_GBP.some((h) => owns(h, c.blockKey)));
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
    const vals = recent.map((s) => ({ s, v: heldValue(s, h) })).filter((x): x is { s: GbpSnapshot; v: string } => x.v !== null);
    if (vals[0]?.s !== after || vals.length < 2) continue;
    const [now, last, v2, v3] = vals;
    if (now!.v !== last!.v) { held++; continue; }
    if (!v2 || v2.v === now!.v) continue;
    const from = v3 && v3.v !== v2.v ? v3.s : v2.s;
    if (heldValue(from, h) === now!.v) continue;
    for (const c of diffGbpProfiles(from.profile, after.profile)) if (owns(h, c.blockKey)) changes.push({ ...c, beforeCaptureId: from.captureId });
  }
  const photos = photoPush(snaps);
  if (photos) changes.push(photos);
  return { changes, implausible, held };
}

/**
 * Earlier captures GBP may look through: 3 that carry a profile for the held fields (an ok capture can lack one), and
 * a photo-push base 21–35 days back (5 weekly pulls, plus room for profile-less captures).
 */
const GBP_CANDIDATES = 8;

/**
 * The captures that carry a `gbp_profile` (cap first; guardedGbpDiff uses the newest 4 for held fields); captures without
 * one are skipped, so they never cut the window between a glitch and its recovery. No profile on `cap` itself: no GBP changes.
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
    if (profile) snaps.push({ captureId: c.id, profile, capturedAt: c.capturedAt });
  }
  if (snaps.length < 2) return { changes: [], implausible: 0, held: 0 };
  const res = guardedGbpDiff(snaps);
  if (res.implausible > 0 || res.held > 0) {
    console.info(`[engine] vendor_diff ${cap.id}: ${res.implausible} implausible rating change(s) suppressed, ${res.held} GBP field change(s) held`);
  }
  return res;
};
