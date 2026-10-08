/**
 * Shared test setup for the client-workspace tool tests (5c-1). Imported only by `*.test.ts` files —
 * never exported from the package index. Importing it opens the test Dbs and closes them after the file.
 */
import { type AccessContext, createAccessContext, type Feature } from '@cs/core';
import { capture, changeEvent, type ChangeDetails, competitor, detectedChange, eventChange, eventScore, type NumericChange, type ScoreFactors, trackedPage } from '@cs/db';
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
  const [before] = await dbs.owner.insert(capture).values({ ...shot, capturedAt: new Date(at.getTime() - day) }).returning();
  const [after] = await dbs.owner.insert(capture).values({ ...shot, capturedAt: at }).returning();
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
