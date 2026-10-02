import type { ChangeType, MoveType } from '@cs/core';
import type { ChangeDetails, NumericChange } from '@cs/db';
import type { VerticalPack } from '@cs/verticals';
import { COMPLAINT_WINDOW_DAYS } from '../reviews/complaints';

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
  /** Average number of active ads over the past 90 days (only weeks since we started collecting ads). */
  baseline: number;
  /** Weekly sample points behind `baseline`. */
  historyWeeks: number;
}

/** Ad surge needs this many weeks of ad history — a just-onboarded competitor has no baseline yet. */
export const AD_SURGE_MIN_HISTORY_WEEKS = 4;

export interface MoveContext {
  now: Date;
  verticalId: string;
  clientServices: string[];
  clientZips: string[];
  clientTowns: string[];
  thresholds: VerticalPack['move_thresholds'];
  ads: AdActivity;
  /** Service id → display name from the client's vertical pack (move summaries). */
  serviceNames: Record<string, string>;
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

/** Channels whose launch of a service confirms a web launch (spec §6.4 new service line). */
const CONFIRMING_CHANNELS = new Set(['google_business_profile', 'google_ads', 'meta_ads']);

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

/** Largest drop from the window's peak rating to any later rating: a later recovery does not cancel an earlier drop (3b final review). */
export function ratingDrawdown(ratings: MoveEvent[]): number {
  let peak = Number.NEGATIVE_INFINITY;
  let drop = 0;
  for (const e of [...ratings].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.id.localeCompare(b.id))) {
    peak = Math.max(peak, e.details.ratingBefore!);
    drop = Math.max(drop, peak - e.details.ratingAfter!);
    peak = Math.max(peak, e.details.ratingAfter!);
  }
  return Math.round(drop * 100) / 100;
}

/** Evaluates the seven spec §6.4 move rules over one competitor's events for one client. */
export function detectMoves(all: MoveEvent[], ctx: MoveContext): MoveFinding[] {
  const now = ctx.now;
  const t = ctx.thresholds;
  const events = all.filter((e) => e.occurredAt <= now && within(e, now, MOVE_WINDOW_DAYS));
  const service = (e: MoveEvent) => e.services[ctx.verticalId] ?? null;
  const out: MoveFinding[] = [];

  // Territory expansion — ≥ 2 kinds of signal referencing the client's ZIPs or towns, at least one of them a
  // service-area / location signal: ads and job posts naming the client's town alone mean already local.
  if (ctx.clientZips.length > 0 || ctx.clientTowns.length > 0) {
    const signals = new Map<string, MoveEvent[]>();
    const add = (kind: string, e: MoveEvent) => signals.set(kind, [...(signals.get(kind) ?? []), e]);
    for (const e of events.filter((x) => touchesTerritory(x, ctx))) {
      if ((e.changeType === 'service_area_change' || e.changeType === 'new_location') && e.channels.includes('web')) add('web_area', e);
      if (e.changeType === 'new_location' && e.channels.includes('google_business_profile')) add('gbp_area', e);
      if (e.changeType === 'ad_started') add('ads', e);
      if (e.changeType === 'hiring') add('jobs', e);
    }
    if (signals.size >= 2 && (signals.has('web_area') || signals.has('gbp_area'))) {
      out.push(finding('territory_expansion', [...signals.values()].flat(), 2, `Expanding into your area (${[...signals.keys()].sort().join(', ')})`, { signals: signals.size }));
    }
  }

  // Price war — repeated cuts on overlapping services, or a promo plus an ad burst.
  const overlapping = (e: MoveEvent) => ctx.clientServices.length === 0 || (service(e) !== null && ctx.clientServices.includes(service(e)!));
  const cuts = events.filter((e) => isCut(e) && overlapping(e));
  const recentStarts = events.filter((e) => e.changeType === 'ad_started' && within(e, now, 30));
  const startedAds = recentStarts.reduce((n, e) => n + count(e), 0);
  const promos = events.filter((e) => e.changeType === 'promo' && within(e, now, 30)); // a promo backed by the same 30-day ad burst
  if (cuts.length >= t.price_war_cuts_90d) {
    out.push(finding('price_war', cuts, 2, `${cuts.length} price cuts on services you offer`, { cuts: cuts.length }));
  } else if (promos.length > 0 && startedAds >= t.ad_burst_starts_30d) {
    out.push(finding('price_war', [...promos, ...recentStarts], 2, `Promotion backed by ${startedAds} new ads`, { promos: promos.length, adsStarted: startedAds }));
  }

  // New service line — a web launch confirmed by GBP or ads for the same service. Cross-channel merge folds
  // the GBP/ads launch into the web event, so a web event whose own channels include them is confirmed too.
  for (const web of events.filter((e) => e.changeType === 'new_service' && e.channels.includes('web') && service(e) !== null)) {
    const s = service(web)!;
    const confirm = events.filter(
      (e) => e !== web && service(e) === s && ((e.changeType === 'new_service' && e.channels.includes('google_business_profile')) || e.changeType === 'ad_started'),
    );
    if (confirm.length > 0 || web.channels.some((ch) => CONFIRMING_CHANNELS.has(ch))) {
      out.push(finding('new_service_line', [web, ...confirm], 2, `Launched a new service line: ${ctx.serviceNames[s] ?? s}`, { service: s }));
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

  // Reputation slump — a rating drawdown, or a complaint-theme spike (Phase 3c) for this client's vertical in the last 30 days.
  const ratings = events.filter((e) => e.changeType === 'rating_change' && e.details.ratingBefore !== undefined && e.details.ratingAfter !== undefined);
  const drop = ratingDrawdown(ratings);
  const ratingSlump = ratings.length > 0 && drop >= t.rating_drop_90d;
  const complaints = events.filter(
    (e) => e.changeType === 'review_spike' && e.details.theme !== undefined && (e.details.verticalId ?? ctx.verticalId) === ctx.verticalId && within(e, now, COMPLAINT_WINDOW_DAYS),
  );
  const themeNames = [...new Set(complaints.map((e) => e.details.themeName ?? e.details.theme!))];
  if (ratingSlump || complaints.length > 0) {
    const parts = [...(ratingSlump ? [`Google rating down ${drop} in 90 days`] : []), ...(themeNames.length > 0 ? [`rising complaints about ${themeNames.join(', ')}`] : [])];
    const summary = parts.join('; ');
    out.push(
      finding('reputation_slump', [...(ratingSlump ? ratings : []), ...complaints], 1, summary.charAt(0).toUpperCase() + summary.slice(1), {
        ...(ratingSlump ? { ratingDrop: drop } : {}),
        ...(themeNames.length > 0 ? { theme: themeNames.join(', ') } : {}),
      }),
    );
  }

  // Ad surge — active ads far above the 90-day baseline, backed by started-ad events.
  const started = events.filter((e) => e.changeType === 'ad_started');
  if (started.length > 0 && ctx.ads.historyWeeks >= AD_SURGE_MIN_HISTORY_WEEKS && ctx.ads.activeNow >= t.ad_surge_multiplier * Math.max(ctx.ads.baseline, 1)) {
    out.push(finding('ad_surge', started, 1, `${ctx.ads.activeNow} active ads vs ${ctx.ads.baseline} usually`, { activeNow: ctx.ads.activeNow, baseline: ctx.ads.baseline }));
  }
  return out;
}
