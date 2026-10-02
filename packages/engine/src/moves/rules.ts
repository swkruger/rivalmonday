import type { ChangeType, MoveType } from '@cs/core';
import type { ChangeDetails, NumericChange } from '@cs/db';
import type { VerticalPack } from '@cs/verticals';

/** Spec §6.4: moves look at a competitor's last 90 days of events, per client. */
export const MOVE_WINDOW_DAYS = 90;
const DAY_MS = 86_400_000;

export interface MoveEvent {
  id: string;
  changeType: ChangeType;
  channels: string[];
  occurredAt: Date;
  services: Record<string, string | null>;
  facts: NumericChange[];
  zips: string[];
  summary: string;
  details: ChangeDetails;
}

export interface AdActivity {
  /** Ads active now. */
  activeNow: number;
  /** Average number of active ads over the past 90 days. */
  baseline: number;
}

export interface MoveContext {
  now: Date;
  verticalId: string;
  clientServices: string[];
  clientZips: string[];
  clientTowns: string[];
  thresholds: VerticalPack['move_thresholds'];
  ads: AdActivity;
}

export interface MoveFinding {
  type: MoveType;
  eventIds: string[];
  channels: string[];
  confidence: number;
  summary: string;
  lastEvidenceAt: Date;
  facts: Record<string, number | string>;
}

/** Spec §6.4 confidence from the count and channel diversity of supporting events. */
export function moveConfidence(eventCount: number, channelCount: number, minEvents: number): number {
  const c = 0.4 + 0.15 * Math.max(0, eventCount - minEvents) + 0.15 * Math.max(0, channelCount - 1);
  return Math.round(Math.min(1, c) * 100) / 100;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The event names one of the client's ZIPs, or one of its towns as a whole word. */
export function touchesTerritory(e: MoveEvent, ctx: Pick<MoveContext, 'clientZips' | 'clientTowns'>): boolean {
  if (e.zips.some((z) => ctx.clientZips.includes(z))) return true;
  return ctx.clientTowns.some((t) => t.trim().length > 0 && new RegExp(`\\b${escapeRe(t.trim())}\\b`, 'i').test(e.summary));
}

/** A promotion in any channel: a web promo, or an ad / change flagged as an offer. */
export const isPromo = (e: MoveEvent) => e.changeType === 'promo' || e.details.offer === true;
const isCut = (e: MoveEvent) => e.changeType === 'price_change' && e.facts.some((f) => f.kind === 'price' && f.pct !== null && f.pct < 0);
const count = (e: MoveEvent) => e.details.count ?? 1;
const within = (e: MoveEvent, now: Date, days: number) => e.occurredAt.getTime() >= now.getTime() - days * DAY_MS;

function finding(type: MoveType, support: MoveEvent[], minEvents: number, summary: string, facts: Record<string, number | string>): MoveFinding {
  const unique = [...new Map(support.map((e) => [e.id, e])).values()];
  const channels = [...new Set(unique.flatMap((e) => e.channels))].sort();
  return {
    type,
    eventIds: unique.map((e) => e.id),
    channels,
    confidence: moveConfidence(unique.length, channels.length, minEvents),
    summary,
    lastEvidenceAt: new Date(Math.max(...unique.map((e) => e.occurredAt.getTime()))),
    facts,
  };
}

/** Evaluates the seven spec §6.4 move rules over one competitor's events for one client. */
export function detectMoves(all: MoveEvent[], ctx: MoveContext): MoveFinding[] {
  const now = ctx.now;
  const t = ctx.thresholds;
  const events = all.filter((e) => e.occurredAt <= now && within(e, now, MOVE_WINDOW_DAYS));
  const service = (e: MoveEvent) => e.services[ctx.verticalId] ?? null;
  const out: MoveFinding[] = [];

  // Territory expansion — ≥ 2 kinds of signal referencing the client's ZIPs or towns.
  if (ctx.clientZips.length > 0 || ctx.clientTowns.length > 0) {
    const signals = new Map<string, MoveEvent[]>();
    const add = (kind: string, e: MoveEvent) => signals.set(kind, [...(signals.get(kind) ?? []), e]);
    for (const e of events.filter((x) => touchesTerritory(x, ctx))) {
      if ((e.changeType === 'service_area_change' || e.changeType === 'new_location') && e.channels.includes('web')) add('web_area', e);
      if (e.changeType === 'new_location' && e.channels.includes('google_business_profile')) add('gbp_area', e);
      if (e.changeType === 'ad_started') add('ads', e);
      if (e.changeType === 'hiring') add('jobs', e);
    }
    if (signals.size >= 2) {
      out.push(finding('territory_expansion', [...signals.values()].flat(), 2, `Expanding into your area (${[...signals.keys()].sort().join(', ')})`, { signals: signals.size }));
    }
  }

  // Price war — repeated cuts on overlapping services, or a promo plus an ad burst.
  const overlapping = (e: MoveEvent) => ctx.clientServices.length === 0 || (service(e) !== null && ctx.clientServices.includes(service(e)!));
  const cuts = events.filter((e) => isCut(e) && overlapping(e));
  const recentStarts = events.filter((e) => e.changeType === 'ad_started' && within(e, now, 30));
  const startedAds = recentStarts.reduce((n, e) => n + count(e), 0);
  const promos = events.filter((e) => e.changeType === 'promo');
  if (cuts.length >= t.price_war_cuts_90d) {
    out.push(finding('price_war', cuts, 2, `${cuts.length} price cuts on services you offer`, { cuts: cuts.length }));
  } else if (promos.length > 0 && startedAds >= t.ad_burst_starts_30d) {
    out.push(finding('price_war', [...promos, ...recentStarts], 2, `Promotion backed by ${startedAds} new ads`, { promos: promos.length, adsStarted: startedAds }));
  }

  // New service line — a web launch confirmed by GBP or ads for the same service.
  for (const web of events.filter((e) => e.changeType === 'new_service' && e.channels.includes('web') && service(e) !== null)) {
    const s = service(web)!;
    const confirm = events.filter(
      (e) => e !== web && service(e) === s && ((e.changeType === 'new_service' && e.channels.includes('google_business_profile')) || e.changeType === 'ad_started'),
    );
    if (confirm.length > 0) {
      out.push(finding('new_service_line', [web, ...confirm], 2, `Launched a new service line: ${s}`, { service: s }));
      break;
    }
  }

  // Hiring push — enough postings in 30 days.
  const hiring = events.filter((e) => e.changeType === 'hiring' && within(e, now, 30));
  const postings = hiring.reduce((n, e) => n + count(e), 0);
  if (postings >= t.hiring_push_postings_30d) out.push(finding('hiring_push', hiring, 1, `${postings} new job postings in 30 days`, { postings }));

  // Promo blitz — promotions in ≥ 2 channels at once.
  const blitz = events.filter((e) => isPromo(e) && within(e, now, t.promo_blitz_window_days));
  const blitzChannels = new Set(blitz.flatMap((e) => e.channels));
  if (blitzChannels.size >= 2) out.push(finding('promo_blitz', blitz, 2, `Promotions running in ${blitzChannels.size} channels`, { channels: blitzChannels.size }));

  // Reputation slump — rating drops add up (complaint-theme spike joins in Phase 3c).
  const ratings = events.filter((e) => e.changeType === 'rating_change' && e.details.ratingBefore !== undefined && e.details.ratingAfter !== undefined);
  const delta = Math.round(ratings.reduce((n, e) => n + (e.details.ratingAfter! - e.details.ratingBefore!), 0) * 100) / 100;
  if (ratings.length > 0 && delta <= -t.rating_drop_90d) out.push(finding('reputation_slump', ratings, 1, `Google rating down ${Math.abs(delta)} in 90 days`, { ratingDelta: delta }));

  // Ad surge — active ads far above the 90-day baseline, backed by started-ad events.
  const started = events.filter((e) => e.changeType === 'ad_started');
  if (started.length > 0 && ctx.ads.activeNow >= t.ad_surge_multiplier * Math.max(ctx.ads.baseline, 1)) {
    out.push(finding('ad_surge', started, 1, `${ctx.ads.activeNow} active ads vs ${ctx.ads.baseline} usually`, { activeNow: ctx.ads.activeNow, baseline: ctx.ads.baseline }));
  }
  return out;
}
