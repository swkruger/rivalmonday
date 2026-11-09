import type { DecisionQuestion, ResolvedAnswer } from '@cs/ai';
import { adImageObjectKey, normalizeAdImage, sha256Hex } from '@cs/collectors';
import { AiPausedError } from '@cs/core';
import { ad, adImage, capture, client, clientCompetitor, evidence, priceBlockMap, pricePoint, stageRun } from '@cs/db';
import { IDS, openTestDbs, pauseClient, seedTenancy, spendPauseClient, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore, type ObjectStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { choice, createFakeAi, type FakeAi, noul } from '../../test/fake-ai';
import { createPackLoader } from '../tag/tag-stage';
import { AD_IMAGE_READ_STAGE, AD_IMAGE_SINCE, adImageSubjectId, readCapOpen } from './images';
import { readAdImage } from './image-read-stage';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
const at = (h: number) => new Date(AD_IMAGE_SINCE.getTime() + h * 3_600_000);

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
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
const RED = png(60, 30, [200, 30, 30]);

/** Fake AI by task: the read returns `lines` (or raw `text`); confirm_* answers `confirm`; price_decisions maps to `service`. */
function fakeAi(o: { lines?: unknown; text?: string; confirm?: boolean | 'throw'; confirmLow?: boolean; service?: string } = {}): FakeAi {
  return createFakeAi({
    chat: () => o.text ?? JSON.stringify({ price_lines: o.lines ?? [] }),
    decide: (_state, questions: Record<string, DecisionQuestion>) => {
      const keys = Object.keys(questions);
      const answers: Record<string, ResolvedAnswer> = {};
      if (keys.some((k) => k.startsWith('confirm_'))) {
        if (o.confirm === 'throw') throw new Error('jev down');
        for (const k of keys) answers[k] = noul(o.confirm ?? true);
        return { answers, needsReview: o.confirmLow ? keys : [] };
      }
      for (const k of keys) answers[k] = choice(o.service ?? 'ac_tune_up');
      return { answers, needsReview: [] };
    },
  });
}

let store: ObjectStore;
const deps = (ai: FakeAi) => ({ db: dbs.service, store, ai, packs });

/** A Google ad (listed by one google_ads capture) with a triaged, stored price image. */
async function storedImage(over: { competitorId?: string; adId?: string; image?: Partial<typeof adImage.$inferInsert> } = {}) {
  const competitorId = over.competitorId ?? IDS.competitorX;
  let adId = over.adId;
  let lastCaptureId: string;
  if (!adId) {
    const [gcap] = await dbs.service
      .insert(capture)
      .values({ competitorId, source: 'google_ads', url: 'https://adstransparency.google.com/advertiser/AR123', status: 'ok', collectorVersion: 'test', capturedAt: at(2) })
      .returning();
    lastCaptureId = gcap!.id;
    const [a] = await dbs.service
      .insert(ad)
      .values({
        competitorId, platform: 'google', externalId: `CR${Math.random().toString(36).slice(2)}`, advertiserId: 'AR123', format: 'image', title: 'Smith HVAC tune-up',
        mediaUrls: ['https://tpc.googlesyndication.com/simgad/1'], isActive: true, firstSeenAt: at(1), firstCaptureId: gcap!.id, lastCaptureId: gcap!.id,
      })
      .returning();
    adId = a!.id;
  } else {
    const [a] = await dbs.service.select().from(ad).where(eq(ad.id, adId));
    lastCaptureId = a!.lastCaptureId!;
  }
  const norm = await normalizeAdImage(RED);
  if (!norm.ok) throw new Error('fixture image did not normalise');
  const captureId = randomUUID();
  const objectKey = adImageObjectKey(competitorId, captureId);
  await store.put(objectKey, norm.webp, 'image/webp');
  await dbs.service.insert(capture).values({ id: captureId, competitorId, source: 'ad_image', url: null, status: 'ok', collectorVersion: 'ad-image/1', capturedAt: at(3) });
  const [ev] = await dbs.service
    .insert(evidence)
    .values({ captureId, kind: 'image', objectKey, sha256: norm.sha256, bytes: norm.webp.byteLength, contentType: 'image/webp' })
    .returning();
  const sourceUrlSha = sha256Hex(`https://tpc.googlesyndication.com/simgad/${randomUUID()}`);
  const [img] = await dbs.service
    .insert(adImage)
    .values({
      adId, competitorId, sourceUrlSha, status: 'triaged', sourceSha256: norm.sourceSha256, showsPerson: false, showsPrice: true, showsOffer: false,
      serviceIds: { hvac_plumbing: 'ac_tune_up' }, theme: 'price_promo', evidenceId: ev!.id, triagedAt: at(3), ...over.image,
    })
    .returning();
  return { img: img!, adId, lastCaptureId, webp: norm.webp };
}

const imageRow = async (id: string) => (await dbs.owner.select().from(adImage).where(eq(adImage.id, id)))[0]!;
const points = () => dbs.owner.select().from(pricePoint);

/** `n` read rows (read_at now) on a competitor, each on its own ad. */
async function readsThisWeek(competitorId: string, n: number) {
  const [gcap] = await dbs.service.insert(capture).values({ competitorId, source: 'google_ads', url: null, status: 'ok', collectorVersion: 'test', capturedAt: at(0) }).returning();
  for (let i = 0; i < n; i++) {
    const [a] = await dbs.service
      .insert(ad)
      .values({ competitorId, platform: 'google', externalId: `CAP${i}-${randomUUID()}`, mediaUrls: [], isActive: true, firstSeenAt: at(0), lastCaptureId: gcap!.id })
      .returning();
    await dbs.service.insert(adImage).values({ adId: a!.id, competitorId, sourceUrlSha: sha256Hex(String(i)), status: 'triaged', readStatus: 'read', readAt: new Date() });
  }
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  store = createMemoryStore();
});

describe('readAdImage', () => {
  it('"$89 tune-up" line ⇒ one price_point with ad_id + ad_image_id, read', async () => {
    const ai = fakeAi({ lines: ['$89 tune-up'] });
    const { img, adId, lastCaptureId, webp } = await storedImage();
    const out = await readAdImage(deps(ai), img.id);
    expect(out).toEqual({ status: 'ran', readStatus: 'read', points: 1 });
    const [p, ...rest] = await points();
    expect(rest).toEqual([]);
    expect(p).toMatchObject({
      competitorId: IDS.competitorX, trackedPageId: null, adId, adImageId: img.id, verticalId: 'hvac_plumbing', serviceId: 'ac_tune_up', amount: 89, unit: 'USD', qualifier: 'exact',
      raw: '$89', firstSeenAt: at(2), lastSeenAt: at(2), firstCaptureId: lastCaptureId, lastCaptureId, endedAt: null,
    });
    const row = await imageRow(img.id);
    expect(row.readStatus).toBe('read');
    expect(row.readAt).not.toBeNull();
    expect(await dbs.owner.select().from(priceBlockMap)).toEqual([expect.objectContaining({ textSha: sha256Hex('$89 tune-up'), verticalId: 'hvac_plumbing', serviceId: 'ac_tune_up' })]);
    // The read: exact prompt, WebP itself, competitor scope.
    expect(ai.calls.chat).toHaveLength(1);
    expect(ai.calls.chat[0]).toMatchObject({ task: 'ad_image_read', content: 'Competitor: Smith HVAC', scope: { agencyId: null, clientId: null, competitorIds: [IDS.competitorX] } });
    expect(ai.calls.chat[0]!.images).toEqual([{ mediaType: 'image/webp', data: webp, sha256: sha256Hex(webp) }]);
    // The confirm: one noul per raw, JPEG of the stored WebP (P15).
    const confirm = ai.calls.decide.find((d) => d.task === 'ad_image_decisions')!;
    expect(confirm.questions).toEqual({ confirm_0: { type: 'noul', instructions: 'The image shows "$89" as a price.' } });
    expect(confirm.scope).toEqual({ agencyId: null, clientId: null, competitorIds: [IDS.competitorX] });
    const jpeg = confirm.opts!.images![0]!;
    expect(jpeg.mediaType).toBe('image/jpeg');
    expect([...jpeg.data.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    const map = ai.calls.decide.find((d) => d.task === 'price_decisions')!;
    expect(map.state).toMatchObject({ competitor: 'Smith HVAC', ad_text: '$89 tune-up', source: 'ad_image' });
    const [run] = await dbs.owner.select().from(stageRun);
    expect(run).toMatchObject({ stage: AD_IMAGE_READ_STAGE, subjectId: adImageSubjectId(img.id, img.sourceUrlSha), status: 'done' });
  });

  it('"$50 off" only ⇒ no_price, no confirm', async () => {
    const ai = fakeAi({ lines: ['$50 off any repair'] });
    const { img } = await storedImage();
    expect(await readAdImage(deps(ai), img.id)).toMatchObject({ status: 'ran', readStatus: 'no_price', points: 0 });
    expect(await imageRow(img.id)).toMatchObject({ readStatus: 'no_price', readAt: expect.any(Date) });
    expect(ai.calls.decide).toEqual([]);
    expect(await points()).toEqual([]);
  });

  it('"FREE estimate" / "20% off" ⇒ no_price', async () => {
    const ai = fakeAi({ lines: ['FREE estimate', '20% off'] });
    const { img } = await storedImage();
    expect(await readAdImage(deps(ai), img.id)).toMatchObject({ readStatus: 'no_price' });
    expect(ai.calls.decide).toEqual([]);
    expect(await points()).toEqual([]);
  });

  it('empty list ⇒ no_price', async () => {
    const ai = fakeAi({ lines: [] });
    const { img } = await storedImage();
    expect(await readAdImage(deps(ai), img.id)).toMatchObject({ readStatus: 'no_price' });
  });

  it('confirm false ⇒ unconfirmed, no point', async () => {
    const ai = fakeAi({ lines: ['$89 tune-up'], confirm: false });
    const { img } = await storedImage();
    expect(await readAdImage(deps(ai), img.id)).toMatchObject({ status: 'ran', readStatus: 'unconfirmed', points: 0 });
    expect(await imageRow(img.id)).toMatchObject({ readStatus: 'unconfirmed', readAt: expect.any(Date) });
    expect(ai.calls.decide.map((d) => d.task)).toEqual(['ad_image_decisions']);
    expect(await points()).toEqual([]);
  });

  it('confirm below τ ⇒ unconfirmed', async () => {
    const ai = fakeAi({ lines: ['$89 tune-up'], confirm: true, confirmLow: true });
    const { img } = await storedImage();
    expect(await readAdImage(deps(ai), img.id)).toMatchObject({ readStatus: 'unconfirmed' });
    expect(await points()).toEqual([]);
  });

  it('invalid JSON ⇒ failed, read_at set', async () => {
    const ai = fakeAi({ text: 'Sorry, I cannot help with that.' });
    const { img } = await storedImage();
    expect(await readAdImage(deps(ai), img.id)).toMatchObject({ status: 'ran', readStatus: 'failed' });
    expect(await imageRow(img.id)).toMatchObject({ readStatus: 'failed', readAt: expect.any(Date) });
    const [run] = await dbs.owner.select().from(stageRun);
    expect(run).toMatchObject({ status: 'done' });
  });

  it('wrong shape ⇒ failed', async () => {
    const ai = fakeAi({ text: JSON.stringify({ lines: ['$89'] }) });
    const { img } = await storedImage();
    expect(await readAdImage(deps(ai), img.id)).toMatchObject({ readStatus: 'failed' });
  });

  it('chat throws (network) ⇒ stage failed, read_at null', async () => {
    const ai = fakeAi({ lines: ['$89 tune-up'] });
    ai.chat = async () => {
      throw new Error('fetch failed');
    };
    const { img } = await storedImage();
    await expect(readAdImage(deps(ai), img.id)).rejects.toThrow('fetch failed');
    expect(await imageRow(img.id)).toMatchObject({ readStatus: null, readAt: null });
    const [run] = await dbs.owner.select().from(stageRun);
    expect(run).toMatchObject({ stage: AD_IMAGE_READ_STAGE, status: 'failed', attempts: 1 });
  });

  it('confirm throws ⇒ stage failed, read_at set, read_status null', async () => {
    const ai = fakeAi({ lines: ['$89 tune-up'], confirm: 'throw' });
    const { img } = await storedImage();
    await expect(readAdImage(deps(ai), img.id)).rejects.toThrow('jev down');
    expect(await imageRow(img.id)).toMatchObject({ readStatus: null, readAt: expect.any(Date) });
    const [run] = await dbs.owner.select().from(stageRun);
    expect(run).toMatchObject({ status: 'failed' });
    expect(await points()).toEqual([]);
  });

  it('7 lines ⇒ only 6 parsed; 300-char line cut', async () => {
    const long = `$12 ${'x'.repeat(296)}`;
    const lines = [long, '$1 a', '$2 b', '$3 c', '$4 d', '$5 e', '$6 f'];
    const ai = fakeAi({ lines });
    const { img } = await storedImage();
    await readAdImage(deps(ai), img.id);
    const confirm = ai.calls.decide.find((d) => d.task === 'ad_image_decisions')!;
    expect(Object.values(confirm.questions).map((q) => q.instructions)).toEqual(['$12', '$1', '$2', '$3', '$4', '$5'].map((r) => `The image shows "${r}" as a price.`));
    const maps = ai.calls.decide.filter((d) => d.task === 'price_decisions');
    expect(maps).toHaveLength(6);
    expect((maps[0]!.state as { ad_text: string }).ad_text).toHaveLength(200);
    expect((await points()).map((p) => p.amount).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 12]);
  });

  it('non-string and blank lines are dropped', async () => {
    const ai = fakeAi({ lines: [42, '   ', null, '  $89 tune-up  '] });
    const { img } = await storedImage();
    expect(await readAdImage(deps(ai), img.id)).toMatchObject({ readStatus: 'read', points: 1 });
  });

  it('cap: 20 reads this week for the only tracker ⇒ skipped, no claim; a second workable tracker under cap ⇒ runs', async () => {
    // A1 also tracks Y; Y's 20 reads fill A1's week. B1 tracks only X.
    await dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorY });
    await readsThisWeek(IDS.competitorY, 20);
    await pauseClient(dbs.owner, IDS.clientA2);
    await pauseClient(dbs.owner, IDS.clientB1);
    const ai = fakeAi({ lines: ['$89 tune-up'] });
    const { img } = await storedImage();
    expect(await readCapOpen(dbs.service, IDS.competitorX)).toBe(false);
    expect(await readAdImage(deps(ai), img.id)).toMatchObject({ status: 'skipped' });
    expect(ai.calls.chat).toEqual([]);
    expect(await dbs.owner.select().from(stageRun)).toEqual([]);
    expect(await imageRow(img.id)).toMatchObject({ readStatus: null, readAt: null });

    await dbs.owner.update(client).set({ pausedAt: null, pausedBy: null }).where(eq(client.id, IDS.clientB1));
    expect(await readCapOpen(dbs.service, IDS.competitorX)).toBe(true);
    expect(await readAdImage(deps(ai), img.id)).toMatchObject({ status: 'ran', readStatus: 'read' });
  });

  it('19 reads ⇒ cap open', async () => {
    await readsThisWeek(IDS.competitorX, 19);
    expect(await readCapOpen(dbs.service, IDS.competitorX)).toBe(true);
    await readsThisWeek(IDS.competitorX, 1);
    expect(await readCapOpen(dbs.service, IDS.competitorX)).toBe(false);
  });

  it('spend-paused tracker between read and confirm ⇒ AiPausedError rethrown', async () => {
    const ai = fakeAi({ lines: ['$89 tune-up'] });
    const chat = ai.chat.bind(ai);
    ai.chat = async (...a: Parameters<typeof ai.chat>) => {
      const r = await chat(...a);
      await spendPauseClient(dbs.owner, IDS.clientA1);
      await spendPauseClient(dbs.owner, IDS.clientB1);
      return r;
    };
    const { img } = await storedImage();
    const err = await readAdImage(deps(ai), img.id).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiPausedError);
    expect(ai.calls.decide).toEqual([]);
    expect(await imageRow(img.id)).toMatchObject({ readStatus: null, readAt: expect.any(Date) });
  });

  it('twin of an already-read row ⇒ skipped', async () => {
    const ai = fakeAi({ lines: ['$89 tune-up'] });
    const first = await storedImage();
    await readAdImage(deps(ai), first.img.id);
    const twin = await storedImage({ adId: first.adId });
    expect(twin.img.sourceSha256).toBe(first.img.sourceSha256);
    expect(await readAdImage(deps(ai), twin.img.id)).toMatchObject({ status: 'skipped' });
    expect(ai.calls.chat).toHaveLength(1);
  });

  it('non-candidates ⇒ skipped, no claim', async () => {
    const ai = fakeAi({ lines: ['$89 tune-up'] });
    for (const image of [{ status: 'pending' as const, showsPrice: null, evidenceId: null }, { showsPrice: false }, { readStatus: 'no_price' as const }]) {
      const { img } = await storedImage({ image });
      expect(await readAdImage(deps(ai), img.id)).toMatchObject({ status: 'skipped' });
    }
    const { img, adId } = await storedImage();
    await dbs.owner.update(ad).set({ isActive: false }).where(eq(ad.id, adId));
    expect(await readAdImage(deps(ai), img.id)).toMatchObject({ status: 'skipped' });
    expect(await readAdImage(deps(ai), randomUUID())).toMatchObject({ status: 'skipped' });
    expect(ai.calls.chat).toEqual([]);
    expect(await dbs.owner.select().from(stageRun)).toEqual([]);
  });

  it('no workable tracker ⇒ skipped', async () => {
    await pauseClient(dbs.owner, IDS.clientA1);
    await pauseClient(dbs.owner, IDS.clientB1);
    const ai = fakeAi({ lines: ['$89 tune-up'] });
    const { img } = await storedImage();
    expect(await readAdImage(deps(ai), img.id)).toMatchObject({ status: 'skipped' });
    expect(ai.calls.chat).toEqual([]);
  });

  it('missing stored bytes ⇒ stage failed, no model call', async () => {
    const ai = fakeAi({ lines: ['$89 tune-up'] });
    const { img } = await storedImage();
    store = createMemoryStore();
    await expect(readAdImage(deps(ai), img.id)).rejects.toThrow();
    expect(ai.calls.chat).toEqual([]);
    expect(await imageRow(img.id)).toMatchObject({ readAt: null });
  });

  it('context is redacted', async () => {
    const ai = fakeAi({ lines: ['Smith HVAC $89 tune-up, call 555-123-4567'] });
    const { img } = await storedImage();
    expect(await readAdImage(deps(ai), img.id)).toMatchObject({ readStatus: 'read', points: 1 });
    const [p] = await points();
    expect(p!.context).toContain('$89');
    expect(p!.context).not.toMatch(/555|4567/);
    const map = ai.calls.decide.find((d) => d.task === 'price_decisions')!;
    expect((map.state as { ad_text: string }).ad_text).not.toMatch(/555|4567/);
  });
});
