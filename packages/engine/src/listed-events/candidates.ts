import { jsonLdEvents, type SerpKnowledge, type StructuredEvent, VENUE_PANEL_KIND } from '@cs/collectors';
import { type Db, ad, evidence, observation, type ListedEventSource, type ListedEventStatus } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { gunzipSync } from 'node:zlib';
import type { CaptureRow } from '../structured/vendor-diff';
import { localDate, normaliseEventName, panelDate } from './normalise';

export interface EventCandidate {
  source: ListedEventSource; name: string; nameNorm: string; startDate: string; startsAt: string | null; endsAt: string | null;
  status: ListedEventStatus; url: string | null; venue: string | null; ticketed: boolean;
}

const META_TZ = 'America/Chicago';
const DATE_RE = /^(\d{4}-\d{2}-\d{2})/;
const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;
const instant = (s: string | null): string | null => {
  if (!s || !INSTANT_RE.test(s)) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

export function panelCandidates(obs: { timeZone: string; events: SerpKnowledge['events'] }, capturedAt: Date): EventCandidate[] {
  const out: EventCandidate[] = [];
  for (const e of obs.events) {
    const d = panelDate(e.subtitle, capturedAt, obs.timeZone);
    if (!d) continue;
    out.push({ source: 'google_panel', name: e.title, nameNorm: normaliseEventName(e.title), startDate: d.startDate, startsAt: d.startsAt, endsAt: null, status: 'scheduled', url: e.url, venue: null, ticketed: false });
  }
  return out;
}

export function jsonLdCandidates(events: StructuredEvent[]): EventCandidate[] {
  const out: EventCandidate[] = [];
  for (const e of events) {
    const m = DATE_RE.exec(e.startDate);
    if (!m) continue;
    const raw = e.status ?? '';
    const status: ListedEventStatus = raw.endsWith('EventCancelled') ? 'cancelled' : raw.endsWith('EventPostponed') ? 'postponed' : e.soldOut ? 'sold_out' : 'scheduled';
    out.push({ source: 'web', name: e.name, nameNorm: normaliseEventName(e.name), startDate: m[1]!, startsAt: instant(e.startDate), endsAt: instant(e.endDate), status, url: e.url, venue: e.venue, ticketed: e.ticketed });
  }
  return out;
}

export function metaCandidates(ads: { event: { name: string; startsAt: string | null } | null }[]): EventCandidate[] {
  const out: EventCandidate[] = [];
  for (const a of ads) {
    if (!a.event?.startsAt) continue;
    const at = new Date(a.event.startsAt);
    if (Number.isNaN(at.getTime())) continue;
    out.push({ source: 'meta_ads', name: a.event.name, nameNorm: normaliseEventName(a.event.name), startDate: localDate(at, META_TZ), startsAt: at.toISOString(), endsAt: null, status: 'scheduled', url: null, venue: null, ticketed: false });
  }
  return out;
}

/** Candidates of one capture: venue panel (gbp:events), Event JSON-LD (web) or Meta ads last seen in it. */
export async function extractCandidates(deps: { db: Db; store: ObjectStore }, cap: CaptureRow): Promise<EventCandidate[]> {
  if (cap.source === 'google_business_profile') {
    const [o] = await deps.db.select({ data: observation.data }).from(observation).where(and(eq(observation.captureId, cap.id), eq(observation.kind, VENUE_PANEL_KIND), eq(observation.key, 'events'))).limit(1);
    if (!o) return [];
    const events = Array.isArray(o.data.events) ? (o.data.events as SerpKnowledge['events']) : [];
    return panelCandidates({ timeZone: typeof o.data.timeZone === 'string' ? o.data.timeZone : META_TZ, events }, cap.capturedAt);
  }
  if (cap.source === 'web') {
    const [ev] = await deps.db.select({ objectKey: evidence.objectKey }).from(evidence).where(and(eq(evidence.captureId, cap.id), eq(evidence.kind, 'html'))).limit(1);
    if (!ev) throw new Error(`capture ${cap.id} has no html evidence`);
    const gz = await deps.store.get(ev.objectKey);
    if (!gz) throw new Error(`evidence object ${ev.objectKey} is missing from the store`);
    return jsonLdCandidates(jsonLdEvents(new TextDecoder().decode(gunzipSync(gz))));
  }
  if (cap.source === 'meta_ads') {
    const rows = await deps.db.select({ event: ad.event }).from(ad).where(and(eq(ad.competitorId, cap.competitorId), eq(ad.platform, 'meta'), eq(ad.lastCaptureId, cap.id), isNotNull(sql`${ad.event}->>'startsAt'`)));
    return metaCandidates(rows);
  }
  return [];
}
