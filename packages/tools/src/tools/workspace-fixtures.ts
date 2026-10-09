/**
 * Shared test setup for the client-workspace tool tests (5c-1). Imported only by `*.test.ts` files —
 * never exported from the package index. Importing it opens the test Dbs and closes them after the file.
 */
import { randomUUID } from 'node:crypto';
import { type AccessContext, createAccessContext, type Feature } from '@cs/core';
import { ad, capture, changeEvent, type ChangeDetails, client, competitor, detectedChange, eventChange, eventScore, evidence, move, moveEvent, type NumericChange, observation, pricePoint, type PriceQualifier, rankScan, rankSnapshot, type RankResult, review, reviewAnalysis, type ScoreFactors, trackedPage } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createPackLoader } from '@cs/engine';
import { asc, eq } from 'drizzle-orm';
import { afterAll } from 'vitest';
import { createToolRegistry } from '../registry';

export const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

export const registry = createToolRegistry({ app: dbs.app, service: dbs.service, packs: createPackLoader() }, { audit: { record: async () => {} } });

export const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope'], features: Feature[] = [], agencyId: string = IDS.agencyA): AccessContext =>
  createAccessContext({ agencyId, userId: `u-${role}`, role, clientScope: scope, features });

export const day = 86_400_000;

export const FACTORS: ScoreFactors = {
  typeWeight: 1, size: 0.95, serviceOverlap: 1, territoryOverlap: 1, relevance: 1, novelty: 0.9, maxSimilarity: 0.1, needsReviewCap: false,
  thresholds: { alert: 70, brief: 40 }, scoringVersion: 1,
};

/** Competitor X's pricing page, set by `resetWorkspace()` (live binding — read it after the reset). */
export let pageId: string;

/** Inserts a daily tracked page; defaults to competitor X's pricing page. Returns its id. */
export async function seedPage(o: { competitorId?: string; url?: string; pageType?: string } = {}): Promise<string> {
  const competitorId = o.competitorId ?? IDS.competitorX;
  let url = o.url;
  if (!url) {
    const [c] = await dbs.owner.select({ domain: competitor.domain }).from(competitor).where(eq(competitor.id, competitorId));
    url = `https://${c?.domain ?? 'example.test'}/pricing`;
  }
  const [p] = await dbs.owner.insert(trackedPage).values({ competitorId, url, pageType: o.pageType ?? 'pricing', source: 'nav', cadence: 'daily' }).returning();
  return p!.id;
}

/** `beforeEach` body: empty `cs_test`, seed the tenancy (`seedTenancy`) and competitor X's pricing page (`pageId`). */
export async function resetWorkspace(): Promise<void> {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  pageId = await seedPage();
}

export interface SeedEventOptions {
  score: number;
  route: string;
  /** `occurred_at` = now − ageDays; the after capture and the change share it, the before capture is a day earlier. */
  ageDays: number;
  type?: string;
  summary?: string;
  retracted?: boolean;
  /** Default competitor X. */
  competitorId?: string;
  /** Default `{ hvac_plumbing: 'ac_tune_up' }`. */
  services?: Record<string, string | null>;
  facts?: NumericChange[];
  details?: ChangeDetails;
  /** The change's `source` (and the event's only channel). Default 'web'. */
  source?: string;
  /** The change's status. Default 'event'. */
  changeStatus?: string;
  /** Default: the competitor's first tracked page (one is created when it has none). */
  pageId?: string;
  /** Who the event is scored for. Default agency A / client A1. */
  agencyId?: string;
  clientId?: string;
  /** Default `occurred_at`. */
  scoredAt?: Date;
  /** Reuse existing captures for the change instead of inserting two new ones (e.g. from `seedCapture`). */
  captures?: { before: string; after: string };
}

export interface SeededEvent {
  eventId: string;
  changeId: string;
  beforeCaptureId: string;
  afterCaptureId: string;
  pageId: string;
}

async function pageOf(competitorId: string): Promise<string> {
  const [p] = await dbs.owner.select({ id: trackedPage.id }).from(trackedPage).where(eq(trackedPage.competitorId, competitorId)).orderBy(asc(trackedPage.createdAt)).limit(1);
  return p?.id ?? seedPage({ competitorId });
}

/** A scored event built from one web change between two captures (capture → detected_change → event → event_change → event_score). */
export async function seedEvent(o: SeedEventOptions): Promise<SeededEvent> {
  const at = new Date(Date.now() - o.ageDays * day);
  const competitorId = o.competitorId ?? IDS.competitorX;
  const source = o.source ?? 'web';
  const trackedPageId = o.pageId ?? (await pageOf(competitorId));
  const [page] = await dbs.owner.select({ url: trackedPage.url }).from(trackedPage).where(eq(trackedPage.id, trackedPageId));
  const shot = { competitorId, trackedPageId, source, url: page!.url, status: 'ok', collectorVersion: 't' };
  const before = o.captures ? { id: o.captures.before } : (await dbs.owner.insert(capture).values({ ...shot, capturedAt: new Date(at.getTime() - day) }).returning())[0];
  const after = o.captures ? { id: o.captures.after } : (await dbs.owner.insert(capture).values({ ...shot, capturedAt: at }).returning())[0];
  const [ch] = await dbs.owner.insert(detectedChange).values({
    competitorId, trackedPageId, source, kind: 'modified', beforeCaptureId: before!.id, afterCaptureId: after!.id, beforeText: 'AC tune-up $99', afterText: 'AC tune-up $79',
    numericChanges: o.facts ?? [], details: o.details ?? {}, status: o.changeStatus ?? 'event', stageVersion: 1, detectedAt: at,
  }).returning();
  const [e] = await dbs.owner.insert(changeEvent).values({
    competitorId, changeType: o.type ?? 'price_change', channels: [source], services: o.services ?? { hvac_plumbing: 'ac_tune_up' },
    summary: o.summary ?? 'Smith HVAC cut its AC tune-up to $79', facts: o.facts ?? [], details: o.details ?? {}, confidence: 0.9, occurredAt: at, retractedAt: o.retracted ? at : null,
  }).returning();
  await dbs.owner.insert(eventChange).values({ eventId: e!.id, changeId: ch!.id });
  await dbs.owner.insert(eventScore).values({
    agencyId: o.agencyId ?? IDS.agencyA, clientId: o.clientId ?? IDS.clientA1, eventId: e!.id, score: o.score, route: o.route, factors: FACTORS, packVersion: 1, scoredAt: o.scoredAt ?? at,
  });
  return { eventId: e!.id, changeId: ch!.id, beforeCaptureId: before!.id, afterCaptureId: after!.id, pageId: trackedPageId };
}

export type EvidenceKind = 'html' | 'text' | 'screenshot' | 'vendor_json';

export interface SeedCaptureOptions {
  /** `captured_at`. Default now. */
  at?: Date;
  /** Capture status. Default 'ok'. */
  status?: string;
  /** One evidence row per kind. Default `['html', 'text', 'screenshot']`; `[]` for none (an `unchanged` capture). */
  kinds?: EvidenceKind[];
  /** Default competitor X. */
  competitorId?: string;
  /** Default: the competitor's first tracked page (one is created when it has none). */
  pageId?: string;
  /** Default 'web'. */
  source?: string;
}

export interface SeededCapture {
  captureId: string;
  /** Evidence id per seeded kind. */
  ids: Partial<Record<EvidenceKind, string>>;
  /** Object-store key per seeded kind (`evidence/<competitorId>/<captureId>/<kind>`) — nothing is written to the store. */
  objectKeys: Partial<Record<EvidenceKind, string>>;
}

/**
 * A capture of a tracked page plus its evidence rows. sha256 is `<kind>-sha-<first 4 chars of the capture id>`, bytes 10,
 * content type `image/webp` for screenshots, `text/html` for html, `application/json` for vendor_json, else `text/plain`.
 */
export async function seedCapture(o: SeedCaptureOptions = {}): Promise<SeededCapture> {
  const competitorId = o.competitorId ?? IDS.competitorX;
  const trackedPageId = o.pageId ?? (await pageOf(competitorId));
  const [page] = await dbs.owner.select({ url: trackedPage.url }).from(trackedPage).where(eq(trackedPage.id, trackedPageId));
  const [c] = await dbs.owner.insert(capture).values({
    competitorId, trackedPageId, source: o.source ?? 'web', url: page!.url, status: o.status ?? 'ok', collectorVersion: 't', capturedAt: o.at ?? new Date(),
  }).returning();
  const ids: SeededCapture['ids'] = {};
  const objectKeys: SeededCapture['objectKeys'] = {};
  for (const kind of o.kinds ?? ['html', 'text', 'screenshot']) {
    const objectKey = `evidence/${competitorId}/${c!.id}/${kind}`;
    const contentType = { screenshot: 'image/webp', html: 'text/html', vendor_json: 'application/json', text: 'text/plain' }[kind];
    const [e] = await dbs.owner.insert(evidence).values({ captureId: c!.id, kind, objectKey, sha256: `${kind}-sha-${c!.id.slice(0, 4)}`, bytes: 10, contentType }).returning();
    ids[kind] = e!.id;
    objectKeys[kind] = objectKey;
  }
  return { captureId: c!.id, ids, objectKeys };
}

export interface SeedMoveOptions {
  closed?: boolean;
  /** `move.status` when not closed (the shown status is 'closed' once `closedAt` is set). Default 'active'. */
  status?: string;
  /** Default competitor X. */
  competitorId?: string;
  /** `move_open_unique` only blocks a second OPEN move of the same (client, competitor, moveType) — use a different type, or close the first. Default 'price_war'. */
  moveType?: string;
  agencyId?: string;
  clientId?: string;
}

/** A move plus its `move_event` evidence-chain rows (Task 3's `move`/`move_event` schema). Returns the move id. */
export async function seedMove(eventIds: string[], o: SeedMoveOptions = {}): Promise<string> {
  const now = new Date();
  const [m] = await dbs.owner.insert(move).values({
    agencyId: o.agencyId ?? IDS.agencyA,
    clientId: o.clientId ?? IDS.clientA1,
    competitorId: o.competitorId ?? IDS.competitorX,
    moveType: o.moveType ?? 'price_war',
    status: o.status ?? 'active',
    confidence: 0.7,
    summary: 'Price war',
    ruleVersion: 1,
    firstDetectedAt: now,
    lastHeldAt: now,
    lastEvidenceAt: now,
    closedAt: o.closed ? now : null,
  }).returning();
  for (const eventId of eventIds) await dbs.owner.insert(moveEvent).values({ moveId: m!.id, eventId });
  return m!.id;
}

export interface SeedAdsOptions {
  /** `captured_at` of an ok `google_ads` capture — decision 13's "first ad check". Omit for none. */
  firstCheckAt?: Date;
  /** Default competitor X. */
  competitorId?: string;
  ads?: Omit<typeof ad.$inferInsert, 'competitorId'>[];
}

/** Ad rows for a competitor, optionally preceded by the ok ad capture that starts its weekly series (decision 13). */
export async function seedAds(o: SeedAdsOptions): Promise<void> {
  const competitorId = o.competitorId ?? IDS.competitorX;
  if (o.firstCheckAt) await dbs.owner.insert(capture).values({ competitorId, source: 'google_ads', status: 'ok', collectorVersion: 't', capturedAt: o.firstCheckAt });
  if (o.ads?.length) await dbs.owner.insert(ad).values(o.ads.map((a) => ({ ...a, competitorId })));
}

/** A `gbp_profile` observation (with its GBP capture) carrying `rating` and 10 votes, observed at `at` (default now). */
export async function seedGbpRating(competitorId: string, rating: number, at: Date = new Date()): Promise<void> {
  const [c] = await dbs.owner.insert(capture).values({ competitorId, source: 'google_business_profile', status: 'ok', collectorVersion: 't', capturedAt: at }).returning();
  await dbs.owner.insert(observation).values({ competitorId, captureId: c!.id, kind: 'gbp_profile', key: 'profile', data: { rating, votes: 10 }, observedAt: at });
}

/** A date `days` days before now (controller ruling: shared by the 5c-2 test files). */
export const ago = (days: number): Date => new Date(Date.now() - days * day);

/** The client's own business as a global competitor row linked by `client.self_competitor_id` (spec §6.5). Returns its id. */
export async function seedSelf(o: { clientId?: string; name?: string; placeId?: string | null; domain?: string | null } = {}): Promise<string> {
  const [s] = await dbs.owner.insert(competitor).values({ name: o.name ?? 'A1 HVAC', placeId: o.placeId === undefined ? 'self-place' : o.placeId, domain: o.domain ?? null }).returning();
  await dbs.owner.update(client).set({ selfCompetitorId: s!.id }).where(eq(client.id, o.clientId ?? IDS.clientA1));
  return s!.id;
}

/** Sets a competitor's Google place id (rank results match on it). */
export async function setPlace(competitorId: string, placeId: string): Promise<void> {
  await dbs.owner.update(competitor).set({ placeId }).where(eq(competitor.id, competitorId));
}

export interface SeedPriceOptions {
  serviceId: string;
  amount: number;
  /** `first_seen_at`. */
  from: Date;
  /** `ended_at`; omit or null for a price still shown. */
  to?: Date | null;
  /** Default competitor X. */
  competitorId?: string;
  /** Default 'USD'. */
  unit?: string;
  /** Default 'exact'. */
  qualifier?: PriceQualifier;
  promo?: boolean;
  /** Default 'hvac_plumbing'. */
  verticalId?: string;
}

/**
 * A `price_point` span on the competitor's first tracked page, with a capture at `from` (and one at `to` when ended).
 * `price_point_open_unique` forbids two OPEN rows with the same (page, vertical, service, unit, qualifier, amount).
 */
export async function seedPrice(o: SeedPriceOptions): Promise<string> {
  const competitorId = o.competitorId ?? IDS.competitorX;
  const trackedPageId = await pageOf(competitorId);
  const first = await seedCapture({ competitorId, pageId: trackedPageId, at: o.from, kinds: [] });
  const ended = o.to ? await seedCapture({ competitorId, pageId: trackedPageId, at: o.to, kinds: [] }) : null;
  const [p] = await dbs.owner.insert(pricePoint).values({
    competitorId, trackedPageId, verticalId: o.verticalId ?? 'hvac_plumbing', serviceId: o.serviceId, amount: o.amount, unit: o.unit ?? 'USD',
    qualifier: o.qualifier ?? 'exact', promo: o.promo ?? false, raw: `$${o.amount}`, context: `${o.serviceId} $${o.amount}`,
    firstSeenAt: o.from, lastSeenAt: o.to ?? new Date(), firstCaptureId: first.captureId, lastCaptureId: first.captureId,
    endedAt: o.to ?? null, endedCaptureId: ended?.captureId ?? null,
  }).returning();
  return p!.id;
}

export interface SeedReviewOptions {
  /** Default competitor X. */
  competitorId?: string;
  /** Default 5; null for a rating-less review. */
  rating?: number | null;
  /** Default 'Great service'. */
  text?: string | null;
  /** Default now; null for an undated review. */
  postedAt?: Date | null;
  ownerAnswer?: string | null;
  /** Default 'hash-secret' — tests assert it never appears in tool output. */
  reviewerHash?: string;
  /** A `review_analysis` row for `verticalId` (default 'hvac_plumbing'); omit for an unanalysed review. */
  analysis?: { asked: string[]; themes: string[]; sentiment: number | null };
  verticalId?: string;
}

export async function seedReview(o: SeedReviewOptions = {}): Promise<string> {
  const competitorId = o.competitorId ?? IDS.competitorX;
  const [r] = await dbs.owner.insert(review).values({
    competitorId, dedupeKey: randomUUID(), rating: o.rating === undefined ? 5 : o.rating, text: o.text === undefined ? 'Great service' : o.text,
    reviewerHash: o.reviewerHash ?? 'hash-secret', postedAt: o.postedAt === undefined ? new Date() : o.postedAt,
    ownerAnswer: o.ownerAnswer ?? null, ownerAnsweredAt: o.ownerAnswer ? new Date() : null,
  }).returning();
  if (o.analysis) {
    await dbs.owner.insert(reviewAnalysis).values({
      reviewId: r!.id, verticalId: o.verticalId ?? 'hvac_plumbing', competitorId, textSha: 'sha', asked: o.analysis.asked, themes: o.analysis.themes,
      sentiment: o.analysis.sentiment, confidence: 0.9, analysisVersion: 1,
    });
  }
  return r!.id;
}

/** A local-pack result matched by place id. */
export const rr = (rank: number, placeId: string, title: string = placeId): RankResult => ({ rank, placeId, cid: null, domain: null, title });

export interface GridSnapshot {
  keyword: string;
  lat: number;
  lng: number;
  results: RankResult[];
}

/**
 * Snapshots of a size×size grid for one keyword, laid out like `gridPoints`: row r (north → south) is lat 32 − 0.01·r,
 * column c (west → east) is lng −97 + 0.01·c. `results(r, c)` gives that point's local pack, or null for a failed point.
 */
export function gridSnapshots(keyword: string, size: number, results: (row: number, col: number) => RankResult[] | null): GridSnapshot[] {
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  const out: GridSnapshot[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const res = results(r, c);
      if (res) out.push({ keyword, lat: round(32 - 0.01 * r), lng: round(-97 + 0.01 * c), results: res });
    }
  }
  return out;
}

export interface SeedRankScanOptions {
  finishedAt: Date;
  snapshots: GridSnapshot[];
  /** Default 'done'. */
  status?: 'done' | 'failed' | 'running';
  /** Default agency A / client A1. */
  agencyId?: string;
  clientId?: string;
}

/** A rank scan with its snapshots (tenant rows). Returns the scan id. */
export async function seedRankScan(o: SeedRankScanOptions): Promise<string> {
  const agencyId = o.agencyId ?? IDS.agencyA;
  const clientId = o.clientId ?? IDS.clientA1;
  const status = o.status ?? 'done';
  const [s] = await dbs.owner.insert(rankScan).values({
    agencyId, clientId, status, snapshots: o.snapshots.length, startedAt: o.finishedAt, finishedAt: status === 'running' ? null : o.finishedAt,
  }).returning();
  if (o.snapshots.length) {
    await dbs.owner.insert(rankSnapshot).values(o.snapshots.map((x) => ({ agencyId, clientId, scanId: s!.id, keyword: x.keyword, lat: x.lat, lng: x.lng, results: x.results, capturedAt: o.finishedAt })));
  }
  return s!.id;
}
