import { describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createEngineJobs } from './engine';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const queue = () => ({
  enqueueDiff: vi.fn(async (_id: string) => {}),
  enqueueRankDiff: vi.fn(async (_id: string) => {}),
  enqueueTag: vi.fn(async (_id: string) => {}),
  enqueueScore: vi.fn(async (_id: string) => {}),
  enqueueReview: vi.fn(async (_id: string) => {}),
  enqueuePrice: vi.fn(async (_id: string) => {}),
  enqueueAdPrice: vi.fn(async (_id: string) => {}),
  enqueuePostPrice: vi.fn(async (_id: string) => {}),
  enqueueSiteFeatures: vi.fn(async (_id: string) => {}),
  enqueueListedEvents: vi.fn(async (_id: string) => {}),
  enqueueReask: vi.fn(async (_id: string) => {}),
  enqueueAdImage: vi.fn(async (_id: string, _startAfterSeconds?: number) => {}),
  enqueueAdImageRead: vi.fn(async (_id: string) => {}),
});

describe('engine jobs', () => {
  it('sweeps every 5 minutes and enqueues all found work', async () => {
    const deps = {
      engineConfigured: () => true,
      findEngineWork: vi.fn(async () => ({ diff: [U(1)], tag: [U(2)], score: [U(3)], rankDiff: [U(4)], reviews: [U(5)], prices: [U(6)], adPrices: [U(8)], postPrices: [U(9)], siteFeatures: [U(10)], listedEvents: [U(13)], reask: [U(7)], adImages: [U(11)], adImageReads: [U(12)] })),
    } as unknown as WorkerDeps;
    const q = queue();
    const jobs = createEngineJobs(deps, q);
    await jobs.sweep.handler({});
    expect(jobs.sweep.cron).toBe('*/5 * * * *');
    expect([q.enqueueDiff.mock.calls, q.enqueueTag.mock.calls, q.enqueueScore.mock.calls, q.enqueueRankDiff.mock.calls]).toEqual([[[U(1)]], [[U(2)]], [[U(3)]], [[U(4)]]]);
    expect(q.enqueueReview.mock.calls).toEqual([[U(5)]]);
    expect(q.enqueuePrice.mock.calls).toEqual([[U(6)]]);
    expect(q.enqueueAdPrice.mock.calls).toEqual([[U(8)]]);
    expect(q.enqueuePostPrice.mock.calls).toEqual([[U(9)]]);
    expect(q.enqueueSiteFeatures.mock.calls).toEqual([[U(10)]]);
    expect(q.enqueueListedEvents.mock.calls).toEqual([[U(13)]]);
    expect(q.enqueueReask.mock.calls).toEqual([[U(7)]]);
    expect(q.enqueueAdImage.mock.calls).toEqual([[U(11)]]);
    expect(q.enqueueAdImageRead.mock.calls).toEqual([[U(12)]]);
  });

  it('skips the sweep without an OpenRouter key', async () => {
    const findEngineWork = vi.fn();
    const jobs = createEngineJobs({ engineConfigured: () => false, findEngineWork } as unknown as WorkerDeps, queue());
    await jobs.sweep.handler({});
    expect(findEngineWork).not.toHaveBeenCalled();
  });

  it('chains diff → tag → score', async () => {
    const deps = {
      diffCapture: vi.fn(async () => ({ ran: true, changeIds: [U(2), U(3)] })),
      tagChange: vi.fn(async (id: string) => ({ ran: true, eventId: id === U(2) ? U(9) : null })),
      scoreEvent: vi.fn(async () => ({ scored: 1, failed: 0 })),
    } as unknown as WorkerDeps;
    const q = queue();
    const jobs = createEngineJobs(deps, q);
    await jobs.diff.handler({ captureId: U(1) });
    expect(q.enqueueTag.mock.calls).toEqual([[U(2)], [U(3)]]);
    await jobs.tag.handler({ changeId: U(2) });
    await jobs.tag.handler({ changeId: U(3) });
    expect(q.enqueueScore.mock.calls).toEqual([[U(9)]]);
    await jobs.score.handler({ eventId: U(9) });
    expect(deps.scoreEvent).toHaveBeenCalledWith(U(9));
  });

  it('validates payloads', () => {
    const jobs = createEngineJobs({} as WorkerDeps, queue());
    expect(() => jobs.diff.schema.parse({ captureId: 'nope' })).toThrow();
    expect(() => jobs.tag.schema.parse({ changeId: U(1) })).not.toThrow();
  });

  it('registers diff, tag and score as no-retry queues (the sweep is the only retry path)', () => {
    const jobs = createEngineJobs({} as WorkerDeps, queue());
    for (const job of [jobs.diff, jobs.tag, jobs.score]) {
      expect(job.queue?.retryLimit).toBe(0);
    }
  });

  it('chains rank diff → tag', async () => {
    const deps = { diffRankScan: vi.fn(async () => ({ ran: true, changeIds: [U(5)] })) } as unknown as WorkerDeps;
    const q = queue();
    const jobs = createEngineJobs(deps, q);
    await jobs.rankDiff.handler({ scanId: U(4) });
    expect(deps.diffRankScan).toHaveBeenCalledWith(U(4));
    expect(q.enqueueTag.mock.calls).toEqual([[U(5)]]);
  });

  it('uses the short policy so one subject is queued at most once', () => {
    const jobs = createEngineJobs({} as WorkerDeps, queue());
    for (const job of [jobs.diff, jobs.tag, jobs.score, jobs.rankDiff]) expect(job.queue).toMatchObject({ retryLimit: 0, policy: 'short' });
  });

  it('runs review analysis and price extraction jobs without self-retry', async () => {
    const deps = {
      analyzeReview: vi.fn(async () => ({ ran: true })), extractPrices: vi.fn(async () => ({ ran: true, points: 2, ended: 0 })),
      extractAdPrices: vi.fn(async () => ({ ran: true, points: 1, ended: 0 })), extractPostPrices: vi.fn(async () => ({ ran: true, points: 1, ended: 0 })),
    } as unknown as WorkerDeps;
    const jobs = createEngineJobs(deps, queue());
    await jobs.review.handler({ reviewId: U(5) });
    await jobs.price.handler({ captureId: U(6) });
    await jobs.adPrice.handler({ captureId: U(8) });
    expect(deps.analyzeReview).toHaveBeenCalledWith(U(5));
    expect(deps.extractPrices).toHaveBeenCalledWith(U(6));
    expect(deps.extractAdPrices).toHaveBeenCalledWith(U(8));
    await jobs.postPrice.handler({ captureId: U(9) });
    expect(deps.extractPostPrices).toHaveBeenCalledWith(U(9));
    expect(jobs.postPrice.name).toBe('engine-post-price');
    expect(jobs.postPrice.usesAi).toBe(true);
    expect(jobs.adPrice.name).toBe('engine-ad-price');
    expect(jobs.adPrice.usesAi).toBe(true);
    for (const job of [jobs.review, jobs.price, jobs.adPrice, jobs.postPrice]) expect(job.queue).toMatchObject({ retryLimit: 0, policy: 'short' });
    expect(() => jobs.review.schema.parse({ reviewId: 'x' })).toThrow();
  });

  it('engine-site-features runs the rules-only stage and tags its changes, without self-retry', async () => {
    const deps = { detectSiteFeatures: vi.fn(async () => ({ ran: true, changes: [U(11), U(12)] })) } as unknown as WorkerDeps;
    const q = queue();
    const jobs = createEngineJobs(deps, q);
    await jobs.siteFeatures.handler({ captureId: U(10) });
    expect(deps.detectSiteFeatures).toHaveBeenCalledWith(U(10));
    expect(q.enqueueTag.mock.calls).toEqual([[U(11)], [U(12)]]);
    expect(jobs.siteFeatures.name).toBe('engine-site-features');
    expect(jobs.siteFeatures.usesAi).toBe(false);
    expect(jobs.siteFeatures.queue).toMatchObject({ retryLimit: 0, policy: 'short' });
    expect(() => jobs.siteFeatures.schema.parse({ captureId: 'x' })).toThrow();
  });

  it('engine-listed-events runs the rules-only stage and tags its changes, without self-retry', async () => {
    const deps = { detectListedEvents: vi.fn(async () => ({ ran: true, changes: [U(14)] })) } as unknown as WorkerDeps;
    const q = queue();
    const jobs = createEngineJobs(deps, q);
    await jobs.listedEvents.handler({ captureId: U(13) });
    expect(deps.detectListedEvents).toHaveBeenCalledWith(U(13));
    expect(q.enqueueTag.mock.calls).toEqual([[U(14)]]);
    expect(jobs.listedEvents.name).toBe('engine-listed-events');
    expect(jobs.listedEvents.usesAi).toBe(false);
    expect(jobs.listedEvents.queue).toMatchObject({ retryLimit: 0, policy: 'short' });
    expect(() => jobs.listedEvents.schema.parse({ captureId: 'x' })).toThrow();
  });

  it('engine-reask calls deps.reaskReview and uses ENGINE_STAGE_QUEUE', async () => {
    const deps = { reaskReview: vi.fn(async () => ({ ran: true, questions: 2 })) } as unknown as WorkerDeps;
    const jobs = createEngineJobs(deps, queue());
    await jobs.reask.handler({ reviewId: U(7) });
    expect(deps.reaskReview).toHaveBeenCalledWith(U(7));
    expect(jobs.reask.name).toBe('engine-reask');
    expect(jobs.reask.queue).toMatchObject({ retryLimit: 0, policy: 'short' });
    expect(() => jobs.reask.schema.parse({ reviewId: 'x' })).toThrow();
  });

  it('sweep enqueues both ad image lists', async () => {
    const empty = { diff: [], tag: [], score: [], rankDiff: [], reviews: [], prices: [], adPrices: [], postPrices: [], siteFeatures: [], listedEvents: [], reask: [] };
    const deps = { engineConfigured: () => true, findEngineWork: vi.fn(async () => ({ ...empty, adImages: [U(1), U(2)], adImageReads: [U(3)] })) } as unknown as WorkerDeps;
    const q = queue();
    await createEngineJobs(deps, q).sweep.handler({});
    expect(q.enqueueAdImage.mock.calls).toEqual([[U(1)], [U(2)]]);
    expect(q.enqueueAdImageRead.mock.calls).toEqual([[U(3)]]);
  });

  it('ad image jobs: off ⇒ skipped, deps untouched', async () => {
    const deps = { adImagesEnabled: () => false, triageAdImage: vi.fn(), readAdImage: vi.fn() } as unknown as WorkerDeps;
    const q = queue();
    const jobs = createEngineJobs(deps, q);
    expect(await jobs.adImage.handler({ adId: U(1) })).toEqual({ skipped: 'web_monitoring_off' });
    expect(await jobs.adImageRead.handler({ adImageId: U(2) })).toEqual({ skipped: 'web_monitoring_off' });
    expect(deps.triageAdImage).not.toHaveBeenCalled();
    expect(deps.readAdImage).not.toHaveBeenCalled();
    expect(q.enqueueAdImage).not.toHaveBeenCalled();
  });

  it('ad image deferred re-enqueues with startAfter (rounded up to seconds)', async () => {
    const deps = { adImagesEnabled: () => true, triageAdImage: vi.fn(async () => ({ status: 'deferred', retryInMs: 4_200 })) } as unknown as WorkerDeps;
    const q = queue();
    const jobs = createEngineJobs(deps, q);
    expect(await jobs.adImage.handler({ adId: U(1) })).toEqual({ deferred: true });
    expect(deps.triageAdImage).toHaveBeenCalledWith(U(1));
    expect(q.enqueueAdImage.mock.calls).toEqual([[U(1), 5]]);
  });

  it('ad image jobs run their stages on the no-retry engine queue and use AI', async () => {
    const deps = {
      adImagesEnabled: () => true, triageAdImage: vi.fn(async () => ({ status: 'ran', adImageId: U(2), outcome: 'stored' })),
      readAdImage: vi.fn(async () => ({ status: 'ran', readStatus: 'read', points: 1 })),
    } as unknown as WorkerDeps;
    const q = queue();
    const jobs = createEngineJobs(deps, q);
    await jobs.adImage.handler({ adId: U(1) });
    await jobs.adImageRead.handler({ adImageId: U(2) });
    expect(deps.readAdImage).toHaveBeenCalledWith(U(2));
    expect(q.enqueueAdImage).not.toHaveBeenCalled();
    expect([jobs.adImage.name, jobs.adImageRead.name]).toEqual(['engine-ad-image', 'engine-ad-image-read']);
    for (const job of [jobs.adImage, jobs.adImageRead]) {
      expect(job.usesAi).toBe(true);
      expect(job.queue).toMatchObject({ retryLimit: 0, policy: 'short' });
    }
    expect(() => jobs.adImage.schema.parse({ adId: 'x' })).toThrow();
    expect(() => jobs.adImageRead.schema.parse({ adImageId: 'x' })).toThrow();
  });
});
