import { capture, changeEvent, detectedChange, type Db, evidence, eventChange, eventScore, type ScoreFactors, trackedPage } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { diffFacts, extractNumericFacts } from '../src/facts/numeric';

export async function seedPage(db: Db, competitorId: string, url = 'https://smithhvac.example/', pageType = 'home'): Promise<string> {
  const [row] = await db.insert(trackedPage).values({ competitorId, url, pageType, source: 'manual', cadence: 'daily' }).returning({ id: trackedPage.id });
  return row!.id;
}

/** Inserts an ok web capture whose html evidence lives in `store`, exactly as recordWebCapture stores it. */
export async function seedWebCapture(
  db: Db,
  store: ObjectStore,
  input: { competitorId: string; trackedPageId: string; html: string; capturedAt: Date; url?: string },
): Promise<string> {
  const id = randomUUID();
  const key = `evidence/${input.competitorId}/${id}/page.html.gz`;
  const body = new Uint8Array(gzipSync(input.html));
  await store.put(key, body, 'application/gzip');
  await db.insert(capture).values({
    id, competitorId: input.competitorId, trackedPageId: input.trackedPageId, source: 'web', url: input.url ?? 'https://smithhvac.example/',
    status: 'ok', httpStatus: 200, collectorVersion: 'web/1', capturedAt: input.capturedAt,
  });
  await db.insert(evidence).values({
    captureId: id, kind: 'html', objectKey: key, sha256: createHash('sha256').update(input.html).digest('hex'), bytes: body.byteLength, contentType: 'application/gzip',
  });
  return id;
}

/** Inserts an ok vendor capture row (no evidence object — structured differs read the rows collectors wrote). */
export async function seedVendorCapture(db: Db, input: { competitorId: string; source: string; capturedAt: Date; url?: string | null }): Promise<string> {
  const id = randomUUID();
  await db.insert(capture).values({ id, competitorId: input.competitorId, source: input.source, url: input.url ?? null, status: 'ok', collectorVersion: 'test/1', capturedAt: input.capturedAt });
  return id;
}

/** 06:00 UTC on 2026-10-01 plus n days. */
export const day = (n: number) => new Date(Date.UTC(2026, 9, 1 + n, 6));

export const fixture = (name: string) => readFile(fileURLToPath(new URL(`./fixtures/web/${name}`, import.meta.url)), 'utf8');

export const TEST_FACTORS: ScoreFactors = {
  typeWeight: 1, size: 1, serviceOverlap: 1, territoryOverlap: 1, relevance: 1, novelty: 1, maxSimilarity: null, needsReviewCap: false, thresholds: { alert: 70, brief: 40 }, scoringVersion: 2,
};

/** Seeds a fully-scored event: a web capture with one metadata-only evidence row, a live (`status: 'event'`) detected_change, the event, its event_change link and the client's event_score. */
export async function seedScoredEvent(db: Db, input: {
  competitorId: string; clientId: string; agencyId: string; changeType?: string; score?: number; route?: 'alert' | 'brief' | 'archive';
  occurredAt: Date; createdAt?: Date; summary?: string; before?: string; after?: string; services?: Record<string, string | null>;
}): Promise<{ eventId: string; changeId: string; captureId: string }> {
  const pageId = await seedPage(db, input.competitorId, `https://smithhvac.example/p-${randomUUID().slice(0, 8)}`, 'pricing');
  // Metadata rows only (no object store needed): briefs read evidence ids, never the stored bytes.
  const captureId = randomUUID();
  await db.insert(capture).values({ id: captureId, competitorId: input.competitorId, trackedPageId: pageId, source: 'web', url: 'https://smithhvac.example/pricing', status: 'ok', httpStatus: 200, collectorVersion: 'web/1', capturedAt: input.occurredAt });
  await db.insert(evidence).values({ captureId, kind: 'html', objectKey: `evidence/${captureId}/page.html.gz`, sha256: captureId.replace(/-/g, ''), bytes: 1, contentType: 'application/gzip' });
  const before = input.before ?? 'AC tune-up $89';
  const after = input.after ?? 'AC tune-up $69';
  const [ch] = await db.insert(detectedChange).values({
    competitorId: input.competitorId, trackedPageId: pageId, source: 'web', kind: 'modified', afterCaptureId: captureId, blockKey: 'p#0',
    beforeText: before, afterText: after, numericChanges: diffFacts(extractNumericFacts(before), extractNumericFacts(after)), status: 'event', stageVersion: 1,
  }).returning({ id: detectedChange.id });
  const [ev] = await db.insert(changeEvent).values({
    competitorId: input.competitorId, changeType: input.changeType ?? 'price_change', channels: ['web'], services: input.services ?? { hvac_plumbing: 'ac_tune_up' },
    summary: input.summary ?? `/pricing: price changed from $89 to $69 (-22.5%) — "${after}"`, facts: diffFacts(extractNumericFacts(before), extractNumericFacts(after)),
    confidence: 0.95, occurredAt: input.occurredAt, ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  }).returning({ id: changeEvent.id });
  await db.insert(eventChange).values({ eventId: ev!.id, changeId: ch!.id });
  await db.insert(eventScore).values({ agencyId: input.agencyId, clientId: input.clientId, eventId: ev!.id, score: input.score ?? 55, route: input.route ?? 'brief', factors: TEST_FACTORS, packVersion: 1 });
  return { eventId: ev!.id, changeId: ch!.id, captureId };
}
