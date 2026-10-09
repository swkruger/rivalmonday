import type { ChangeType } from '@cs/core';
import { capture, type ChangeDetails, changeEvent, detectedChange, eventChange, eventScore, move, moveEvent, type NumericChange, type ScoreFactors } from '@cs/db';
import { DAY } from './clock';
import type { SeedContext } from './context';
import { type PageMock, pageHtml, pageMockWebp, pageText, putEvidence, vendorCapture } from './evidence';
import type { ActiveClientKey, DemoCompetitor, Route } from './ids';
import { CLIENT_THRESHOLDS, DEMO_COLLECTOR } from './tenancy';

type Source = 'web' | 'google_ads' | 'meta_ads' | 'google_reviews' | 'google_business_profile' | 'google_jobs';

export interface EventSpec {
  client: ActiveClientKey;
  /** Index into `ids.competitors[client]`. */
  comp: number;
  /** Age in days (the event is placed at `days + 0.25` days ago). */
  days: number;
  source: Source;
  type: ChangeType;
  score: number;
  service: string | null;
  summary: (name: string) => string;
  page?: 'home' | 'pricing';
  before?: string;
  after?: string;
  facts?: NumericChange[];
  details?: ChangeDetails;
  zips?: string[];
}

export const routeFor = (client: ActiveClientKey, score: number): Route =>
  score >= CLIENT_THRESHOLDS[client].alert ? 'alert' : score >= CLIENT_THRESHOLDS[client].brief ? 'brief' : 'archive';

const usd = (value: number, context: string) => ({ kind: 'price' as const, value, unit: 'USD', raw: `$${value}`, context });

const price = (client: ActiveClientKey, comp: number, days: number, score: number, service: string, label: string, before: number, after: number): EventSpec => ({
  client, comp, days, score, service, source: 'web', type: 'price_change', page: 'pricing',
  summary: (n) => `${n} ${after < before ? 'cut' : 'raised'} its ${label} to $${after} (was $${before})`,
  before: `${label}: $${before}`, after: `${label}: $${after}`,
  facts: [{ kind: 'price', before: usd(before, label), after: usd(after, label), pct: Math.round(((after - before) / before) * 1000) / 10 }],
});

const promo = (client: ActiveClientKey, comp: number, days: number, score: number, service: string, offer: string): EventSpec => ({
  client, comp, days, score, service, source: 'web', type: 'promo', page: 'pricing',
  summary: (n) => `${n} launched a ${offer}`, before: 'Current specials: none listed', after: `Current special: ${offer}`, details: { offer: true },
});

const newService = (client: ActiveClientKey, comp: number, days: number, score: number, service: string, label: string): EventSpec => ({
  client, comp, days, score, service, source: 'web', type: 'new_service', page: 'home',
  summary: (n) => `${n} added ${label} to its services`, before: 'Our services: repair, maintenance, installation', after: `Our services: repair, maintenance, installation, ${label}`,
});

const content = (client: ActiveClientKey, comp: number, days: number, score: number, what: string): EventSpec => ({
  client, comp, days, score, service: null, source: 'web', type: 'content', page: 'home',
  summary: (n) => `${n} updated its ${what}`, before: `${what}: previous copy`, after: `${what}: refreshed copy`,
});

const ads = (kind: 'ad_started' | 'ad_stopped', client: ActiveClientKey, comp: number, days: number, score: number, source: 'google_ads' | 'meta_ads', count: number): EventSpec => ({
  client, comp, days, score, service: null, source, type: kind,
  summary: (n) => `${n} ${kind === 'ad_started' ? 'started' : 'stopped'} ${count} ${source === 'google_ads' ? 'Google' : 'Meta'} ad${count > 1 ? 's' : ''}`,
  details: { changeType: kind, count, items: Array.from({ length: count }, (_, i) => ({ id: `demo-ad-${comp}-${days}-${i}`, label: `Ad ${i + 1}` })) },
});

/** The ad ids an ad_started / ad_stopped spec names in its details; seedAds writes ad rows with exactly these external ids. */
export const adItemIds = (spec: EventSpec): string[] => ((spec.details as { items?: { id: string }[] } | undefined)?.items ?? []).map((x) => x.id);

const spike = (client: ActiveClientKey, comp: number, days: number, score: number, theme: string, themeName: string): EventSpec => ({
  client, comp, days, score, service: null, source: 'google_reviews', type: 'review_spike',
  summary: (n) => `${n}: complaints about ${themeName.toLowerCase()} spiked`,
  details: { changeType: 'review_spike', theme, themeName, verticalId: 'hvac_plumbing', windowDays: 14, count: 6 },
});

const rating = (client: ActiveClientKey, comp: number, days: number, score: number, before: number, after: number): EventSpec => ({
  client, comp, days, score, service: null, source: 'google_business_profile', type: 'rating_change',
  summary: (n) => `${n}'s Google rating moved from ${before} to ${after}`,
  details: { changeType: 'rating_change', field: 'rating', ratingBefore: before, ratingAfter: after },
});

const gbp = (type: 'service_area_change' | 'new_location', client: ActiveClientKey, comp: number, days: number, score: number, text: string, zips: string[]): EventSpec => ({
  client, comp, days, score, service: null, source: 'google_business_profile', type, summary: (n) => `${n} ${text}`,
  details: { changeType: type, field: type === 'new_location' ? 'address' : 'service' }, zips,
});

const hiring = (client: ActiveClientKey, comp: number, days: number, score: number, count: number): EventSpec => ({
  client, comp, days, score, service: null, source: 'google_jobs', type: 'hiring', summary: (n) => `${n} posted ${count} new technician jobs`,
  details: { changeType: 'hiring', count },
});

/**
 * Spec §4.2: 40 events over 90 days. Lone Star competitors are indexes 0–5 (4 = no ads, 5 = no prices); Brazos 0–3.
 * The price events match the price series in pricing.ts (same client, competitor, service and day).
 */
export const EVENT_SPECS: readonly EventSpec[] = [
  price('loneStar', 0, 1, 82, 'ac_tune_up', 'AC tune-up', 99, 79),
  promo('loneStar', 1, 2, 74, 'ac_tune_up', '$59 AC tune-up special'),
  ads('ad_started', 'loneStar', 2, 3, 66, 'google_ads', 3),
  spike('loneStar', 3, 4, 58, 'scheduling', 'Scheduling & reliability'),
  price('loneStar', 0, 5, 61, 'furnace_tune_up', 'Furnace tune-up', 109, 89),
  hiring('loneStar', 1, 6, 44, 3),
  price('loneStar', 2, 12, 72, 'ac_repair', 'AC repair diagnostic', 89, 69),
  ads('ad_started', 'loneStar', 0, 14, 63, 'meta_ads', 2),
  newService('loneStar', 1, 18, 55, 'heat_pump', 'heat pump installation'),
  rating('loneStar', 3, 20, 48, 4.4, 4.1),
  content('loneStar', 5, 22, 18, 'About page'),
  promo('loneStar', 0, 25, 69, 'duct_cleaning', '$199 whole-home duct cleaning'),
  ads('ad_stopped', 'loneStar', 2, 28, 30, 'google_ads', 2),
  price('loneStar', 1, 31, 57, 'ac_tune_up', 'AC tune-up', 89, 99),
  gbp('service_area_change', 'loneStar', 2, 35, 62, 'now lists Tolar and Lipan in its service area', ['76476', '76462']),
  spike('loneStar', 3, 40, 52, 'response_time', 'Response time'),
  ads('ad_started', 'loneStar', 1, 44, 47, 'meta_ads', 4),
  content('loneStar', 3, 47, 12, 'blog'),
  price('loneStar', 3, 52, 66, 'ac_repair', 'AC repair visit', 129, 99),
  gbp('new_location', 'loneStar', 5, 58, 60, 'opened a second location in Granbury', ['76048']),
  ads('ad_stopped', 'loneStar', 0, 63, 25, 'meta_ads', 1),
  rating('loneStar', 0, 70, 33, 4.6, 4.7),
  content('loneStar', 2, 76, 9, 'team page'),
  price('loneStar', 0, 84, 49, 'ac_tune_up', 'AC tune-up', 109, 99),
  hiring('loneStar', 5, 88, 28, 2),
  price('brazos', 0, 2, 77, 'drain_cleaning', 'Drain cleaning', 149, 119),
  promo('brazos', 1, 4, 64, 'water_heater', '$100 off water heater installs'),
  ads('ad_started', 'brazos', 2, 9, 55, 'google_ads', 2),
  spike('brazos', 1, 15, 61, 'price_transparency', 'Price transparency'),
  price('brazos', 1, 21, 45, 'sewer_line', 'Sewer camera inspection', 199, 229),
  content('brazos', 3, 26, 14, 'FAQ page'),
  ads('ad_started', 'brazos', 0, 33, 42, 'meta_ads', 1),
  rating('brazos', 2, 41, 52, 4.3, 3.9),
  newService('brazos', 3, 49, 58, 'water_heater', 'tankless water heater installation'),
  ads('ad_stopped', 'brazos', 2, 57, 22, 'google_ads', 1),
  gbp('service_area_change', 'brazos', 3, 60, 50, 'added Cleburne to its service area', ['76031', '76033']),
  price('brazos', 0, 64, 72, 'emergency_service', '24/7 emergency call-out', 179, 149),
  hiring('brazos', 0, 71, 31, 2),
  content('brazos', 1, 79, 11, 'homepage hero'),
  promo('brazos', 2, 86, 38, 'drain_cleaning', 'free camera inspection with any drain cleaning'),
];

const factorsFor = (client: ActiveClientKey, score: number): ScoreFactors => ({
  typeWeight: 1, size: Math.min(1, Math.round((score / 90) * 100) / 100), serviceOverlap: 1, territoryOverlap: 1, relevance: 1, novelty: 0.9,
  maxSimilarity: 0.2, needsReviewCap: false, thresholds: CLIENT_THRESHOLDS[client], scoringVersion: 2,
});

function pageBlocks(comp: DemoCompetitor, spec: EventSpec): { before: string[]; after: string[]; changed: number } {
  const pricing = spec.page === 'pricing';
  const head = pricing ? `${comp.name} pricing` : `Welcome to ${comp.name}`;
  const filler = pricing ? ['Service call: $89 (waived with repair)', 'Financing available on approved credit'] : ['Family owned, serving Hood County since 2004', 'Call (817) 555-0142 for same-day service'];
  return { before: [head, filler[0]!, spec.before ?? '', filler[1]!], after: [head, filler[0]!, spec.after ?? '', filler[1]!], changed: 2 };
}

async function webCapture(ctx: SeedContext, comp: DemoCompetitor, pageId: string, url: string, at: Date, mock: PageMock): Promise<{ captureId: string; screenshotId: string }> {
  const [c] = await ctx.db.insert(capture).values({ competitorId: comp.id, trackedPageId: pageId, source: 'web', url, status: 'ok', httpStatus: 200, collectorVersion: DEMO_COLLECTOR, capturedAt: at }).returning({ id: capture.id });
  const enc = new TextEncoder();
  const base = { captureId: c!.id, competitorId: comp.id };
  await putEvidence(ctx, { ...base, kind: 'html', body: enc.encode(pageHtml(mock)), contentType: 'text/html' });
  await putEvidence(ctx, { ...base, kind: 'text', body: enc.encode(pageText(mock)), contentType: 'text/plain' });
  const screenshotId = await putEvidence(ctx, { ...base, kind: 'screenshot', body: await pageMockWebp(mock), contentType: 'image/webp' });
  return { captureId: c!.id, screenshotId };
}

async function seedEvent(ctx: SeedContext, spec: EventSpec, i: number): Promise<void> {
  const { db, ids } = ctx;
  const comp = ids.competitors[spec.client][spec.comp];
  if (!comp) throw new Error(`EVENT_SPECS[${i}]: no competitor ${spec.comp} for ${spec.client}`);
  const at = ctx.clock.daysAgo(spec.days + 0.25);
  const summary = spec.summary(comp.name);
  const route = routeFor(spec.client, spec.score);
  let beforeCaptureId: string | null = null;
  let afterCaptureId: string;
  let trackedPageId: string | null = null;
  let evidenceIds: string[];
  if (spec.source === 'web') {
    const page = spec.page ?? 'home';
    trackedPageId = ids.pages[comp.id]![page];
    const url = `https://${comp.domain}${page === 'pricing' ? '/pricing' : '/'}`;
    const blocks = pageBlocks(comp, spec);
    const before = await webCapture(ctx, comp, trackedPageId, url, new Date(at.getTime() - DAY), { title: comp.name, url, blocks: blocks.before, highlight: null });
    const after = await webCapture(ctx, comp, trackedPageId, url, at, { title: comp.name, url, blocks: blocks.after, highlight: blocks.changed });
    beforeCaptureId = before.captureId;
    afterCaptureId = after.captureId;
    evidenceIds = [after.screenshotId];
  } else {
    const v = await vendorCapture(ctx, comp.id, spec.source, at, { demo: true, source: spec.source, competitor: comp.name, summary, details: spec.details ?? {} });
    afterCaptureId = v.captureId;
    evidenceIds = [v.evidenceId];
  }
  const [ch] = await db.insert(detectedChange).values({
    competitorId: comp.id, trackedPageId, source: spec.source, kind: spec.source === 'web' ? 'modified' : 'added', beforeCaptureId, afterCaptureId,
    blockKey: `demo-${i}`, beforeText: spec.before ?? null, afterText: spec.after ?? null, similarity: spec.source === 'web' ? 0.64 : null,
    numericChanges: spec.facts ?? [], details: spec.details ?? {}, status: 'event', stageVersion: 1, detectedAt: at,
  }).returning({ id: detectedChange.id });
  const [ev] = await db.insert(changeEvent).values({
    competitorId: comp.id, changeType: spec.type, channels: [spec.source], services: { hvac_plumbing: spec.service }, summary,
    facts: spec.facts ?? [], details: spec.details ?? {}, zips: spec.zips ?? [], confidence: 0.86, occurredAt: at, createdAt: at,
  }).returning({ id: changeEvent.id });
  await db.insert(eventChange).values({ eventId: ev!.id, changeId: ch!.id });
  await db.insert(eventScore).values({
    agencyId: ids.agencyId, clientId: ids.clients[spec.client], eventId: ev!.id, score: spec.score, route, factors: factorsFor(spec.client, spec.score),
    packVersion: 1, scoredAt: new Date(at.getTime() + 3_600_000),
  });
  ids.events.push({ id: ev!.id, client: spec.client, competitorId: comp.id, changeId: ch!.id, changeType: spec.type, source: spec.source, route, score: spec.score, occurredAt: at, summary, evidenceIds });
}

interface MoveSpec {
  client: ActiveClientKey;
  comp: number;
  moveType: string;
  status: 'emerging' | 'active' | 'fading';
  closed: boolean;
  confidence: number;
  summary: (name: string) => string;
}

/** Spec §4.2: six moves, four open and two resolved. */
const MOVE_SPECS: readonly MoveSpec[] = [
  { client: 'loneStar', comp: 0, moveType: 'price_war', status: 'active', closed: false, confidence: 0.82, summary: (n) => `${n} cut prices on several tune-up services` },
  { client: 'loneStar', comp: 1, moveType: 'promo_blitz', status: 'emerging', closed: false, confidence: 0.64, summary: (n) => `${n} is stacking specials with new ads` },
  { client: 'loneStar', comp: 2, moveType: 'ad_surge', status: 'active', closed: false, confidence: 0.71, summary: (n) => `${n} doubled its active ads` },
  { client: 'loneStar', comp: 3, moveType: 'reputation_slump', status: 'fading', closed: true, confidence: 0.68, summary: (n) => `${n}'s rating slid on scheduling complaints` },
  { client: 'brazos', comp: 0, moveType: 'price_war', status: 'fading', closed: false, confidence: 0.74, summary: (n) => `${n} undercut drain and emergency call-out prices` },
  { client: 'brazos', comp: 3, moveType: 'territory_expansion', status: 'active', closed: true, confidence: 0.6, summary: (n) => `${n} expanded its service area toward Cleburne` },
];

async function seedMoves(ctx: SeedContext): Promise<void> {
  const { db, ids, clock } = ctx;
  for (const m of MOVE_SPECS) {
    const comp = ids.competitors[m.client][m.comp]!;
    const evs = ids.events.filter((e) => e.client === m.client && e.competitorId === comp.id);
    if (evs.length === 0) throw new Error(`move ${m.moveType} for ${comp.name} has no events`);
    const times = evs.map((e) => e.occurredAt.getTime());
    const summary = m.summary(comp.name);
    const [row] = await db.insert(move).values({
      agencyId: ids.agencyId, clientId: ids.clients[m.client], competitorId: comp.id, moveType: m.moveType, status: m.status, confidence: m.confidence, summary,
      details: { eventCount: evs.length, channels: [...new Set(evs.map((e) => e.source))], facts: { events: evs.length } }, ruleVersion: 2,
      firstDetectedAt: new Date(Math.min(...times)), lastHeldAt: m.closed ? clock.daysAgo(12) : clock.daysAgo(0.5), lastEvidenceAt: new Date(Math.max(...times)),
      closedAt: m.closed ? clock.daysAgo(10) : null, updatedAt: clock.daysAgo(m.closed ? 10 : 0.5),
    }).returning({ id: move.id });
    await db.insert(moveEvent).values(evs.map((e) => ({ moveId: row!.id, eventId: e.id })));
    ids.moves.push({ id: row!.id, client: m.client, competitorId: comp.id, moveType: m.moveType, open: !m.closed, summary });
  }
}

/** Spec §4.2. */
export async function seedChanges(ctx: SeedContext): Promise<void> {
  for (const [i, spec] of EVENT_SPECS.entries()) await seedEvent(ctx, spec, i);
  await seedMoves(ctx);
}
