import type { DecisionQuestion, ResolvedAnswer } from '@cs/ai';
import { type FetchBytes, HostRateLimiter, libraryUrl, normalizeAdImage, type RobotsPolicy, type RobotsVerdict, sha256Hex } from '@cs/collectors';
import { ad, adImage, capture, decisionSample, evidence, stageRun } from '@cs/db';
import { IDS, openTestDbs, pauseClient, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore, type ObjectStore } from '@cs/storage';
import { asc, eq } from 'drizzle-orm';
import { crc32, deflateSync } from 'node:zlib';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { choice, createFakeAi, type DecideFn, noul } from '../../test/fake-ai';
import { createPackLoader } from '../tag/tag-stage';
import { AD_IMAGE_SINCE, AD_IMAGE_TRIAGE_STAGE, adImageSubjectId } from './images';
import { triageAdImage } from './image-triage-stage';
import { buildImageTriageQuestions } from './triage-questions';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
const at = (h: number) => new Date(AD_IMAGE_SINCE.getTime() + h * 3_600_000);
const URL1 = 'https://tpc.googlesyndication.com/simgad/111?sig=secret';
const URL2 = 'https://tpc.googlesyndication.com/simgad/222?sig=secret';

/** Minimal truecolour PNG (fixtures without a native image dependency in this package). */
function png(w: number, h: number, rgb: [number, number, number]): Uint8Array {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const row = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
const RED = png(60, 30, [200, 30, 30]);

type Res = Awaited<ReturnType<FetchBytes>>;
const allow: RobotsVerdict = { allowed: true, reason: 'allowed', crawlDelaySeconds: null, sitemaps: [] };
function media(over: { fetch?: (url: string) => Res | Promise<Res>; busy?: boolean } = {}) {
  const fetched: string[] = [];
  const fetchBytes: FetchBytes = async (url) => {
    fetched.push(url);
    return over.fetch ? over.fetch(url) : { status: 200, bytes: RED, finalUrl: url, tooLarge: false };
  };
  const robots = { peek: () => allow, check: async () => allow } as unknown as RobotsPolicy;
  const limiter = new HostRateLimiter({ sleep: async () => {} });
  if (over.busy) limiter.nextSlotIn = () => 11_000;
  else limiter.nextSlotIn = () => 0;
  return { deps: { fetchBytes, robots, limiter }, fetched };
}

/** Memory store counting puts. */
function countingStore(): ObjectStore & { puts: string[] } {
  const inner = createMemoryStore();
  const puts: string[] = [];
  return Object.assign(Object.create(null) as object, inner, {
    puts,
    put: async (...a: Parameters<ObjectStore['put']>) => {
      puts.push(a[0]);
      return inner.put(...a);
    },
  }) as ObjectStore & { puts: string[] };
}

/** Answers every triage question; `needsReview` lists keys left below τ. */
function triage(input: { person?: boolean; price?: boolean; offer?: boolean; service?: string; theme?: string; needsReview?: string[] }): DecideFn {
  return (_state, questions: Record<string, DecisionQuestion>) => {
    const answers: Record<string, ResolvedAnswer> = {};
    for (const k of Object.keys(questions)) {
      if (k === 'shows_person') answers[k] = noul(input.person ?? false);
      else if (k === 'shows_price') answers[k] = noul(input.price ?? false);
      else if (k === 'shows_offer') answers[k] = noul(input.offer ?? false);
      else if (k === 'theme') answers[k] = choice(input.theme ?? 'price_promo');
      else answers[k] = choice(input.service ?? 'none');
    }
    return { answers, needsReview: input.needsReview ?? [] };
  };
}

const googleAd = async (over: Partial<typeof ad.$inferInsert> = {}) => {
  const [row] = await dbs.service
    .insert(ad)
    .values({
      competitorId: IDS.competitorX, platform: 'google', externalId: `CR${Math.random().toString(36).slice(2)}`, advertiserId: 'AR123', format: 'image',
      title: 'Smith HVAC tune-up', mediaUrls: [URL1], isActive: true, firstSeenAt: at(1), ...over,
    })
    .returning();
  return row!;
};
const rows = () => dbs.owner.select().from(adImage).orderBy(asc(adImage.createdAt));
const evidenceOf = async (id: string | null) => (id ? (await dbs.owner.select().from(evidence).where(eq(evidence.id, id)))[0] : undefined);

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('buildImageTriageQuestions', () => {
  it('asks the exact triage questions, one service choice per vertical', async () => {
    const q = buildImageTriageQuestions([await packs('hvac_plumbing')]);
    expect(Object.keys(q)).toEqual(['shows_person', 'shows_price', 'shows_offer', 'service_hvac_plumbing', 'theme']);
    expect(q.shows_person).toEqual({ type: 'noul', instructions: 'The image shows a real person: a face, a body or a body part in a photo. Drawings, cartoons, logos and mascots are not people.' });
    expect(q.service_hvac_plumbing).toMatchObject({ type: 'choice', options: expect.objectContaining({ none: 'No single service', ac_tune_up: expect.any(String) }) });
    expect(q.theme).toMatchObject({ type: 'choice', instructions: 'What is the main theme of this ad image?' });
  });
});

describe('triageAdImage', () => {
  it('price image ⇒ triaged, stored, evidence kind image, capture url = library url', async () => {
    const store = countingStore();
    const ai = createFakeAi({ decide: triage({ price: true, service: 'ac_tune_up', theme: 'price_promo' }) });
    const a = await googleAd();
    const out = await triageAdImage({ db: dbs.service, store, ai, packs, media: media().deps, now: () => at(5) }, a.id);
    expect(out).toMatchObject({ status: 'ran', outcome: 'stored' });
    const [r, ...rest] = await rows();
    expect(rest).toEqual([]);
    expect(r).toMatchObject({
      adId: a.id, competitorId: IDS.competitorX, sourceUrlSha: sha256Hex(URL1), status: 'triaged', failReason: null, sourceSha256: sha256Hex(RED),
      showsPerson: false, showsPrice: true, showsOffer: false, theme: 'price_promo', serviceIds: { hvac_plumbing: 'ac_tune_up' }, triagedAt: at(5),
    });
    expect(r!.triage).toMatchObject({ provider: 'fake', confidences: expect.objectContaining({ shows_person: 0.98, shows_price: 0.98 }) });
    const ev = await evidenceOf(r!.evidenceId);
    expect(ev).toMatchObject({ kind: 'image', contentType: 'image/webp', objectKey: `evidence/${IDS.competitorX}/${ev!.captureId}/ad-image.webp` });
    const [cap] = await dbs.owner.select().from(capture).where(eq(capture.id, ev!.captureId));
    expect(cap).toMatchObject({ competitorId: IDS.competitorX, source: 'ad_image', status: 'ok', collectorVersion: 'ad-image/1', url: libraryUrl(a), capturedAt: at(5) });
    expect(store.puts).toEqual([ev!.objectKey]);
    const stored = await store.get(ev!.objectKey);
    expect(ev!.sha256).toBe(sha256Hex(stored!));
    expect(ev!.bytes).toBe(stored!.byteLength);
    expect(ai.calls.decide).toHaveLength(1);
    expect(ai.calls.decide[0]).toMatchObject({
      task: 'ad_image_decisions', state: { competitor: 'Smith HVAC', ad_title: expect.any(String) },
      scope: { agencyId: null, clientId: null, competitorIds: [IDS.competitorX] },
    });
    const [run] = await dbs.owner.select().from(stageRun);
    expect(run).toMatchObject({ stage: AD_IMAGE_TRIAGE_STAGE, subjectId: adImageSubjectId(r!.id, sha256Hex(URL1)), status: 'done' });
  });

  it('person ⇒ triaged, shows_person only, no evidence, no put', async () => {
    const store = countingStore();
    const ai = createFakeAi({ decide: triage({ person: true, price: true, offer: true, service: 'ac_tune_up' }) });
    const a = await googleAd();
    expect(await triageAdImage({ db: dbs.service, store, ai, packs, media: media().deps }, a.id)).toMatchObject({ status: 'ran', outcome: 'person' });
    expect(await rows()).toEqual([expect.objectContaining({ status: 'triaged', showsPerson: true, showsPrice: null, showsOffer: null, theme: null, serviceIds: null, evidenceId: null })]);
    expect(await dbs.owner.select().from(evidence)).toEqual([]);
    expect(store.puts).toEqual([]);
  });

  it('shows_person below τ ⇒ person', async () => {
    const store = countingStore();
    const ai = createFakeAi({ decide: triage({ person: false, price: true, needsReview: ['shows_person'] }) });
    const a = await googleAd();
    expect(await triageAdImage({ db: dbs.service, store, ai, packs, media: media().deps }, a.id)).toMatchObject({ outcome: 'person' });
    expect(await rows()).toEqual([expect.objectContaining({ showsPerson: true, showsPrice: null, evidenceId: null })]);
    expect(store.puts).toEqual([]);
  });

  it('offer only ⇒ stored', async () => {
    const store = countingStore();
    const ai = createFakeAi({ decide: triage({ offer: true, theme: 'financing' }) });
    const a = await googleAd();
    expect(await triageAdImage({ db: dbs.service, store, ai, packs, media: media().deps }, a.id)).toMatchObject({ outcome: 'stored' });
    const [r] = await rows();
    expect(r).toMatchObject({ showsPrice: false, showsOffer: true, theme: 'financing', serviceIds: { hvac_plumbing: null } });
    expect(r!.evidenceId).not.toBeNull();
  });

  it('price/offer below τ count as false; choices below τ are null', async () => {
    const store = countingStore();
    const ai = createFakeAi({ decide: triage({ price: true, offer: true, service: 'ac_tune_up', needsReview: ['shows_price', 'shows_offer', 'service_hvac_plumbing', 'theme'] }) });
    const a = await googleAd();
    expect(await triageAdImage({ db: dbs.service, store, ai, packs, media: media().deps }, a.id)).toMatchObject({ outcome: 'not_stored' });
    expect(await rows()).toEqual([expect.objectContaining({ showsPerson: false, showsPrice: false, showsOffer: false, theme: null, serviceIds: { hvac_plumbing: null }, evidenceId: null })]);
  });

  it('neither ⇒ triaged, not stored', async () => {
    const store = countingStore();
    const ai = createFakeAi({ decide: triage({ theme: 'brand' }) });
    const a = await googleAd();
    expect(await triageAdImage({ db: dbs.service, store, ai, packs, media: media().deps }, a.id)).toMatchObject({ status: 'ran', outcome: 'not_stored' });
    expect(await rows()).toEqual([expect.objectContaining({ status: 'triaged', showsPerson: false, showsPrice: false, showsOffer: false, theme: 'brand', evidenceId: null })]);
    expect(store.puts).toEqual([]);
    expect(await dbs.owner.select().from(capture)).toEqual([]);
  });

  it('bad bytes ⇒ rejected bad_type, no model call', async () => {
    const ai = createFakeAi({ decide: triage({ price: true }) });
    const a = await googleAd();
    const html = new TextEncoder().encode('<!doctype html><html></html>');
    const m = media({ fetch: (url) => ({ status: 200, bytes: html, finalUrl: url, tooLarge: false }) });
    expect(await triageAdImage({ db: dbs.service, store: countingStore(), ai, packs, media: m.deps }, a.id)).toMatchObject({ status: 'ran', outcome: 'rejected' });
    expect(await rows()).toEqual([expect.objectContaining({ status: 'rejected', failReason: 'bad_type', sourceSha256: sha256Hex(html), triagedAt: null, evidenceId: null })]);
    expect(ai.calls.decide).toEqual([]);
  });

  it('404 ⇒ rejected expired', async () => {
    const ai = createFakeAi({ decide: triage({ price: true }) });
    const a = await googleAd();
    const m = media({ fetch: (url) => ({ status: 404, bytes: null, finalUrl: url, tooLarge: false }) });
    expect(await triageAdImage({ db: dbs.service, store: countingStore(), ai, packs, media: m.deps }, a.id)).toMatchObject({ outcome: 'rejected' });
    expect(await rows()).toEqual([expect.objectContaining({ status: 'rejected', failReason: 'expired', sourceSha256: null })]);
    expect(ai.calls.decide).toEqual([]);
    // A finished row is never fetched again.
    const again = media();
    expect(await triageAdImage({ db: dbs.service, store: countingStore(), ai, packs, media: again.deps }, a.id)).toMatchObject({ status: 'skipped' });
    expect(again.fetched).toEqual([]);
  });

  it('transient ⇒ stage failed, row pending', async () => {
    const ai = createFakeAi({ decide: triage({ price: true }) });
    const a = await googleAd();
    const m = media({ fetch: (url) => ({ status: 503, bytes: null, finalUrl: url, tooLarge: false }) });
    const err = await triageAdImage({ db: dbs.service, store: countingStore(), ai, packs, media: m.deps }, a.id).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain('simgad');
    expect((err as Error).message).not.toContain('sig=');
    expect(await rows()).toEqual([expect.objectContaining({ status: 'pending' })]);
    const [run] = await dbs.owner.select().from(stageRun);
    expect(run).toMatchObject({ stage: AD_IMAGE_TRIAGE_STAGE, status: 'failed', attempts: 1 });
    expect(run!.error).not.toContain('sig=');
  });

  it('busy host ⇒ deferred, no row', async () => {
    const ai = createFakeAi({ decide: triage({ price: true }) });
    const a = await googleAd();
    const m = media({ busy: true });
    const out = await triageAdImage({ db: dbs.service, store: countingStore(), ai, packs, media: m.deps }, a.id);
    expect(out).toMatchObject({ status: 'deferred', retryInMs: expect.any(Number) });
    expect(await rows()).toEqual([]);
    expect(await dbs.owner.select().from(stageRun)).toEqual([]);
    expect(m.fetched).toEqual([]);
  });

  it('same bytes same competitor ⇒ answers copied, no model call, new capture+evidence reusing the object key', async () => {
    const store = countingStore();
    const ai = createFakeAi({ decide: triage({ price: true, service: 'ac_tune_up' }) });
    const a1 = await googleAd();
    const a2 = await googleAd({ mediaUrls: [URL2] });
    await triageAdImage({ db: dbs.service, store, ai, packs, media: media().deps }, a1.id);
    expect(await triageAdImage({ db: dbs.service, store, ai, packs, media: media().deps }, a2.id)).toMatchObject({ status: 'ran', outcome: 'stored' });
    expect(ai.calls.decide).toHaveLength(1);
    const [r1, r2] = await rows();
    expect(r2).toMatchObject({ adId: a2.id, status: 'triaged', showsPerson: false, showsPrice: true, showsOffer: false, serviceIds: { hvac_plumbing: 'ac_tune_up' }, sourceSha256: sha256Hex(RED) });
    expect(r2!.triage).toMatchObject({ copiedFrom: r1!.id });
    const e1 = await evidenceOf(r1!.evidenceId);
    const e2 = await evidenceOf(r2!.evidenceId);
    expect(e2!.id).not.toBe(e1!.id);
    expect(e2!.captureId).not.toBe(e1!.captureId);
    expect(e2).toMatchObject({ objectKey: e1!.objectKey, sha256: e1!.sha256, bytes: e1!.bytes, kind: 'image' });
    expect(store.puts).toHaveLength(1);
    const [cap2] = await dbs.owner.select().from(capture).where(eq(capture.id, e2!.captureId));
    expect(cap2!.url).toBe(libraryUrl(a2));
  });

  it('same bytes other competitor ⇒ copied answers, own put under its competitor', async () => {
    const store = countingStore();
    const ai = createFakeAi({ decide: triage({ price: true, service: 'ac_tune_up' }) });
    const a1 = await googleAd();
    const a2 = await googleAd({ competitorId: IDS.competitorY });
    await triageAdImage({ db: dbs.service, store, ai, packs, media: media().deps }, a1.id);
    expect(await triageAdImage({ db: dbs.service, store, ai, packs, media: media().deps }, a2.id)).toMatchObject({ outcome: 'stored' });
    expect(ai.calls.decide).toHaveLength(1);
    const [r1, r2] = await rows();
    expect(r2).toMatchObject({ competitorId: IDS.competitorY, showsPrice: true });
    expect(r2!.triage).toMatchObject({ copiedFrom: r1!.id });
    const e2 = await evidenceOf(r2!.evidenceId);
    expect(e2!.objectKey).toBe(`evidence/${IDS.competitorY}/${e2!.captureId}/ad-image.webp`);
    expect(store.puts).toHaveLength(2);
    expect(store.puts[1]).toBe(e2!.objectKey);
    const [cap2] = await dbs.owner.select().from(capture).where(eq(capture.id, e2!.captureId));
    expect(cap2!.competitorId).toBe(IDS.competitorY);
  });

  it('copied person answer ⇒ nothing stored', async () => {
    const store = countingStore();
    const ai = createFakeAi({ decide: triage({ person: true, price: true }) });
    const a1 = await googleAd();
    const a2 = await googleAd({ mediaUrls: [URL2] });
    await triageAdImage({ db: dbs.service, store, ai, packs, media: media().deps }, a1.id);
    expect(await triageAdImage({ db: dbs.service, store, ai, packs, media: media().deps }, a2.id)).toMatchObject({ outcome: 'person' });
    expect(ai.calls.decide).toHaveLength(1);
    const [r1, r2] = await rows();
    expect(r2).toMatchObject({ showsPerson: true, showsPrice: null, showsOffer: null, evidenceId: null });
    expect(r2!.triage).toMatchObject({ copiedFrom: r1!.id });
    expect(store.puts).toEqual([]);
    expect(await dbs.owner.select().from(evidence)).toEqual([]);
  });

  it('no workable tracker ⇒ skipped, no claim', async () => {
    await pauseClient(dbs.owner, IDS.clientA1);
    await pauseClient(dbs.owner, IDS.clientB1);
    const ai = createFakeAi({ decide: triage({ price: true }) });
    const a = await googleAd();
    const m = media();
    expect(await triageAdImage({ db: dbs.service, store: countingStore(), ai, packs, media: m.deps }, a.id)).toMatchObject({ status: 'skipped' });
    expect(m.fetched).toEqual([]);
    expect(await rows()).toEqual([]);
    expect(await dbs.owner.select().from(stageRun)).toEqual([]);
  });

  it('skips non-candidates before any fetch', async () => {
    const ai = createFakeAi({ decide: triage({ price: true }) });
    const m = media();
    const deps = { db: dbs.service, store: countingStore(), ai, packs, media: m.deps };
    for (const over of [
      { platform: 'meta' },
      { isActive: false },
      { firstSeenAt: at(-1) },
      { format: 'video' },
      { mediaUrls: [] },
      { mediaUrls: ['data:image/png;base64,AAAA'] },
    ] satisfies Partial<typeof ad.$inferInsert>[]) {
      const a = await googleAd(over);
      expect(await triageAdImage(deps, a.id)).toMatchObject({ status: 'skipped' });
    }
    expect(m.fetched).toEqual([]);
    expect(await rows()).toEqual([]);
  });

  it('the model received a JPEG transcoded from the stored WebP (JPEG magic bytes, same dimensions)', async () => {
    const store = countingStore();
    const ai = createFakeAi({ decide: triage({ price: true }) });
    const a = await googleAd();
    await triageAdImage({ db: dbs.service, store, ai, packs, media: media().deps }, a.id);
    const images = ai.calls.decide[0]!.opts?.images ?? [];
    expect(images).toHaveLength(1);
    const img = images[0]!;
    expect(img.mediaType).toBe('image/jpeg');
    expect([...img.data.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect(img.sha256).toBe(sha256Hex(img.data));
    const [r] = await rows();
    const ev = await evidenceOf(r!.evidenceId);
    const webp = (await store.get(ev!.objectKey))!;
    expect(String.fromCharCode(...webp.subarray(8, 12))).toBe('WEBP');
    const fromJpeg = await normalizeAdImage(img.data);
    const fromWebp = await normalizeAdImage(webp);
    expect(fromJpeg.ok && fromWebp.ok).toBe(true);
    if (fromJpeg.ok && fromWebp.ok) {
      expect([fromJpeg.width, fromJpeg.height]).toEqual([fromWebp.width, fromWebp.height]);
      expect([fromWebp.width, fromWebp.height]).toEqual([60, 30]);
    }
  });

  it('no decision_sample written', async () => {
    const ai = createFakeAi({ decide: triage({ price: true }) });
    const a = await googleAd();
    await triageAdImage({ db: dbs.service, store: countingStore(), ai, packs, media: media().deps }, a.id);
    expect(ai.calls.decide).toHaveLength(1);
    expect(await dbs.owner.select().from(decisionSample)).toEqual([]);
  });
});
