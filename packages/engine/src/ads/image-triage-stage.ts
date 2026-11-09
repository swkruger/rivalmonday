import type { Ai, DecisionResult } from '@cs/ai';
import {
  AD_IMAGE_COLLECTOR_VERSION, AD_IMAGE_SOURCE, type AdImageRejection, type AdMediaDeps, adImageObjectKey, fetchAdImage, libraryUrl, normalizeAdImage, redactForModel, sha256Hex,
  toDecisionJpeg,
} from '@cs/collectors';
import { AiPausedError } from '@cs/core';
import { ad, adImage, capture, competitor, type Db, evidence } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { and, desc, eq, isNotNull, ne } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { runStage } from '../stage';
import { competitorVerticals, type PackLoader } from '../tag/tag-stage';
import { AD_IMAGE_SINCE, AD_IMAGE_SKIP_FORMATS, AD_IMAGE_TRIAGE_STAGE, AD_IMAGE_TRIAGE_VERSION, adImageSubjectId, anyWorkableTracker } from './images';
import { AD_IMAGE_DECISION_TASK, buildImageTriageQuestions, type ImageTriage, resolveImageTriage } from './triage-questions';

export type AdImageOutcome = 'rejected' | 'person' | 'stored' | 'not_stored';
export type TriageAdImageResult =
  | { status: 'skipped'; reason: string }
  | { status: 'deferred'; retryInMs: number }
  | { status: 'ran' | 'not_claimed'; adImageId: string; outcome?: AdImageOutcome };

export interface TriageAdImageDeps {
  db: Db;
  store: ObjectStore;
  ai: Ai;
  packs: PackLoader;
  media: AdMediaDeps;
  now?: () => Date;
}

type TriageMeta = { provider: string; model: string; confidences: Record<string, number>; copiedFrom?: string };
type Stored = { captureId: string; objectKey: string; sha256: string; bytes: number };
type Computed =
  | { kind: 'rejected'; reason: AdImageRejection; sourceSha256: string | null }
  | { kind: 'triaged'; sourceSha256: string; answers: Omit<ImageTriage, 'confidences'>; triage: TriageMeta; stored: Stored | null };

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return '?';
  }
};
const isHttpUrl = (url: unknown): url is string => {
  if (typeof url !== 'string') return false;
  try {
    const p = new URL(url).protocol;
    return p === 'http:' || p === 'https:';
  } catch {
    return false;
  }
};

/** Providers and models that answered (Jev, or the escalation LLM, or both). */
function triageMeta(r: DecisionResult<string>, confidences: Record<string, number>): TriageMeta {
  const provider = [...new Set(Object.values(r.answers).map((a) => a.provider))].sort().join('+') || 'unknown';
  const model = [r.trace?.primary?.model, r.trace?.fallback?.model].filter((m): m is string => typeof m === 'string' && m.length > 0).join('+') || 'unknown';
  return { provider, model, confidences };
}

/**
 * D3 + D4 (`ad_image_triage` v1): one Google ad's image URL → fetch → normalise → dedupe → Jev triage → store as evidence.
 * Candidate, tracker and busy-host checks run before any claim (R4); a busy host returns `deferred` with no row seeded.
 * Transient fetch failures throw into the stage backoff; 403/404/410 and validation failures are final (`rejected`).
 * A person image keeps only `shows_person = true` and its bytes are dropped; a price/offer image is stored (R8, D4).
 * Logs and errors carry the ad id and host only, never the URL's path/query or bytes.
 */
export async function triageAdImage(deps: TriageAdImageDeps, adId: string): Promise<TriageAdImageResult> {
  const now = deps.now ?? (() => new Date());
  const [a] = await deps.db.select().from(ad).where(eq(ad.id, adId)).limit(1);
  if (!a) return { status: 'skipped', reason: 'no such ad' };
  if (a.platform !== 'google') return { status: 'skipped', reason: 'not a Google ad' };
  if (!a.isActive) return { status: 'skipped', reason: 'ad not active' };
  if (a.firstSeenAt < AD_IMAGE_SINCE) return { status: 'skipped', reason: 'ad first seen before the cutoff' };
  if (a.format !== null && AD_IMAGE_SKIP_FORMATS.includes(a.format)) return { status: 'skipped', reason: `format ${a.format} is not read` };
  const url = a.mediaUrls[0];
  if (!isHttpUrl(url)) return { status: 'skipped', reason: 'no http(s) image url' };
  if (!(await anyWorkableTracker(deps.db, a.competitorId))) return { status: 'skipped', reason: 'no workable tracker' };
  const sourceUrlSha = sha256Hex(url);
  const [existing] = await deps.db.select({ status: adImage.status }).from(adImage).where(and(eq(adImage.adId, a.id), eq(adImage.sourceUrlSha, sourceUrlSha))).limit(1);
  if (existing && existing.status !== 'pending') return { status: 'skipped', reason: `image already ${existing.status}` };
  const host = hostOf(url);

  const fetched = await fetchAdImage(deps.media, url);
  if (fetched.kind === 'deferred') return { status: 'deferred', retryInMs: fetched.retryInMs };

  await deps.db.insert(adImage).values({ adId: a.id, competitorId: a.competitorId, sourceUrlSha }).onConflictDoNothing({ target: [adImage.adId, adImage.sourceUrlSha] });
  const [row] = await deps.db.select({ id: adImage.id }).from(adImage).where(and(eq(adImage.adId, a.id), eq(adImage.sourceUrlSha, sourceUrlSha))).limit(1);
  if (!row) throw new Error(`ad image row for ad ${a.id} was not seeded`);
  const adImageId = row.id;

  const outcome = await runStage(
    deps.db,
    { stage: AD_IMAGE_TRIAGE_STAGE, version: AD_IMAGE_TRIAGE_VERSION, subjectId: adImageSubjectId(adImageId, sourceUrlSha) },
    async (): Promise<Computed> => {
      if (fetched.kind === 'transient') throw new Error(`ad ${a.id} image fetch from ${host} failed: ${fetched.error}`);
      if (fetched.kind === 'rejected') {
        console.warn(`[engine] ad_image ad ${a.id} host ${host} rejected: ${fetched.reason}`);
        return { kind: 'rejected', reason: fetched.reason, sourceSha256: null };
      }
      const norm = await normalizeAdImage(fetched.bytes);
      if (!norm.ok) {
        console.warn(`[engine] ad_image ad ${a.id} host ${host} rejected: ${norm.reason}`);
        return { kind: 'rejected', reason: norm.reason, sourceSha256: norm.sourceSha256 };
      }

      // R10: the same original bytes were triaged before ⇒ copy those answers, no model call.
      const [prev] = await deps.db
        .select()
        .from(adImage)
        .where(and(eq(adImage.sourceSha256, norm.sourceSha256), eq(adImage.status, 'triaged'), ne(adImage.id, adImageId)))
        .orderBy(desc(adImage.triagedAt), desc(adImage.createdAt))
        .limit(1);
      let answers: Omit<ImageTriage, 'confidences'>;
      let triage: TriageMeta;
      if (prev) {
        answers = prev.showsPerson !== false
          ? { showsPerson: true, showsPrice: null, showsOffer: null, serviceIds: null, theme: null }
          : { showsPerson: false, showsPrice: prev.showsPrice, showsOffer: prev.showsOffer, serviceIds: prev.serviceIds, theme: prev.theme };
        triage = { provider: prev.triage?.provider ?? 'unknown', model: prev.triage?.model ?? 'unknown', confidences: prev.triage?.confidences ?? {}, copiedFrom: prev.id };
      } else {
        // R13-style re-check right before the paid call.
        if (!(await anyWorkableTracker(deps.db, a.competitorId))) throw new AiPausedError('client');
        const [comp] = await deps.db.select({ name: competitor.name }).from(competitor).where(eq(competitor.id, a.competitorId)).limit(1);
        const name = comp?.name ?? null;
        const verticalIds = await competitorVerticals(deps.db, a.competitorId);
        const packs = await Promise.all(verticalIds.map(deps.packs));
        const state = { competitor: name, ad_title: redactForModel(a.title ?? '', { businessNames: [name] }) };
        // P15: Jev takes JPEG/PNG, not WebP — the model sees a JPEG of exactly the stored WebP.
        const result = await deps.ai.decide(
          AD_IMAGE_DECISION_TASK, state, buildImageTriageQuestions(packs), { agencyId: null, clientId: null, competitorIds: [a.competitorId] },
          { images: [{ mediaType: 'image/jpeg', ...(await toDecisionJpeg(norm.webp)) }] },
        );
        const { confidences, ...resolved } = resolveImageTriage(result, verticalIds);
        answers = resolved;
        triage = triageMeta(result, confidences);
      }

      // D4: stored only when no person and a price or an offer shows. A person's bytes are dropped here.
      let stored: Stored | null = null;
      if (!answers.showsPerson && (answers.showsPrice === true || answers.showsOffer === true)) {
        const captureId = randomUUID();
        const [same] = await deps.db
          .select({ objectKey: evidence.objectKey, sha256: evidence.sha256, bytes: evidence.bytes })
          .from(adImage)
          .innerJoin(evidence, eq(evidence.id, adImage.evidenceId))
          .where(and(eq(adImage.competitorId, a.competitorId), eq(adImage.sourceSha256, norm.sourceSha256), isNotNull(adImage.evidenceId)))
          .limit(1);
        if (same) {
          stored = { captureId, ...same };
        } else {
          const objectKey = adImageObjectKey(a.competitorId, captureId);
          await deps.store.put(objectKey, norm.webp, 'image/webp');
          stored = { captureId, objectKey, sha256: norm.sha256, bytes: norm.webp.byteLength };
        }
      }
      return { kind: 'triaged', sourceSha256: norm.sourceSha256, answers, triage, stored };
    },
    async (tx, c): Promise<AdImageOutcome> => {
      if (c.kind === 'rejected') {
        await tx.update(adImage).set({ status: 'rejected', failReason: c.reason, sourceSha256: c.sourceSha256 }).where(eq(adImage.id, adImageId));
        return 'rejected';
      }
      const at = now();
      let evidenceId: string | null = null;
      if (c.stored) {
        await tx.insert(capture).values({
          id: c.stored.captureId, competitorId: a.competitorId, source: AD_IMAGE_SOURCE, url: libraryUrl(a), status: 'ok', collectorVersion: AD_IMAGE_COLLECTOR_VERSION, capturedAt: at,
        });
        const [ev] = await tx
          .insert(evidence)
          .values({ captureId: c.stored.captureId, kind: 'image', objectKey: c.stored.objectKey, sha256: c.stored.sha256, bytes: c.stored.bytes, contentType: 'image/webp' })
          .returning({ id: evidence.id });
        evidenceId = ev!.id;
      }
      await tx
        .update(adImage)
        .set({
          status: 'triaged', failReason: null, sourceSha256: c.sourceSha256, showsPerson: c.answers.showsPerson, showsPrice: c.answers.showsPrice, showsOffer: c.answers.showsOffer,
          serviceIds: c.answers.serviceIds, theme: c.answers.theme, triage: c.triage, evidenceId, triagedAt: at,
        })
        .where(eq(adImage.id, adImageId));
      return c.answers.showsPerson ? 'person' : evidenceId ? 'stored' : 'not_stored';
    },
  );
  return outcome.ran ? { status: 'ran', adImageId, outcome: outcome.result } : { status: 'not_claimed', adImageId };
}
