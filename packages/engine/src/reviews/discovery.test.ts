import type { Ai, BatchItemResult } from '@cs/ai';
import { AiPausedError } from '@cs/core';
import { modelBatch, review, reviewAnalysis, topicProposal } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeAi } from '../../test/fake-ai';
import { day } from '../../test/seed';
import { collectModelBatches } from '../model-ops/batches';
import { createPackLoader } from '../tag/tag-stage';
import { applyTopicProposal, decideTopicProposal, discoverTopic, runReviewInsights, submitTopicDiscoveryBatch, THEME_BATCH_TASK } from './discovery';
import { buildReviewQuestions, themeKey, topicsForVertical } from './topics';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
const now = day(0);
let n = 0;

async function unmatched(count: number, analyzedAt = day(-1)) {
  for (let i = 0; i < count; i++) {
    const [r] = await dbs.service
      .insert(review)
      .values({ competitorId: IDS.competitorX, dedupeKey: `id:${n++}`, rating: 2, text: `Thanks Mike, but the warranty claim was refused (${i})`, postedAt: day(-10) })
      .returning({ id: review.id });
    await dbs.service.insert(reviewAnalysis).values({ reviewId: r!.id, verticalId: 'hvac_plumbing', competitorId: IDS.competitorX, textSha: 's', asked: [], topics: [], other: true, sentiment: 1, confidence: 0.9, analysisVersion: 1, analyzedAt });
  }
}

const proposing = (body: object) => createFakeAi({ chat: () => JSON.stringify(body) });
const WARRANTY = { found: true, id: 'warranty_claims', name: 'Warranty claims', description: 'Whether warranty repairs are honoured' };

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('discoverTopic', () => {
  it('proposes a topic from enough unmatched reviews, with redacted samples, then waits for the AM', async () => {
    await unmatched(20);
    const ai = proposing(WARRANTY);
    const r = await discoverTopic({ db: dbs.service, ai, packs }, 'hvac_plumbing', { now });
    expect(r).toMatchObject({ status: 'proposed' });
    expect(ai.calls.chat[0]!.task).toBe('theme_discovery');
    expect(ai.calls.chat[0]!.content).not.toContain('Mike');
    expect(ai.calls.chat[0]!.content).toContain('price_transparency (Price transparency)');
    const [p] = await dbs.owner.select().from(topicProposal);
    expect(p).toMatchObject({ verticalId: 'hvac_plumbing', topicId: 'warranty_claims', name: 'Warranty claims', status: 'proposed', otherCount: 20 });
    expect(p!.sampleReviewIds).toHaveLength(10);
    expect(await discoverTopic({ db: dbs.service, ai, packs }, 'hvac_plumbing', { now })).toEqual({ skipped: 'a proposal is awaiting approval' });
  });

  it('an approved topic joins the vertical topic list and the review questions', async () => {
    await unmatched(20);
    const r = await discoverTopic({ db: dbs.service, ai: proposing(WARRANTY), packs }, 'hvac_plumbing', { now });
    await decideTopicProposal(dbs.service, (r as { proposalId: string }).proposalId, 'approved', 'am@agency.example');
    const pack = await packs('hvac_plumbing');
    const topics = await topicsForVertical(dbs.service, pack);
    expect(topics.at(-1)).toEqual({ id: 'warranty_claims', name: 'Warranty claims', description: 'Whether warranty repairs are honoured' });
    expect(buildReviewQuestions([{ pack, topics }])[themeKey('hvac_plumbing', 'warranty_claims')]).toBeDefined();
    await expect(decideTopicProposal(dbs.service, (r as { proposalId: string }).proposalId, 'rejected', 'x')).rejects.toThrow(/not awaiting a decision/);
  });

  it('records "none" (no new topic, or an invalid one) so the same reviews are not sent again', async () => {
    await unmatched(20, day(-2));
    expect(await discoverTopic({ db: dbs.service, ai: proposing({ found: false, id: '', name: '', description: '' }), packs }, 'hvac_plumbing', { now })).toMatchObject({ status: 'none' });
    expect(await discoverTopic({ db: dbs.service, ai: proposing(WARRANTY), packs }, 'hvac_plumbing', { now })).toEqual({ skipped: '0 untagged review(s) since the last proposal' });
    // Analysed a day "in the future" so these rows are newer than the 'none' row's DB-clock created_at, whatever the clock skew.
    await unmatched(20, new Date(Date.now() + 86_400_000));
    expect(await discoverTopic({ db: dbs.service, ai: proposing({ ...WARRANTY, id: 'Price Transparency!' }), packs }, 'hvac_plumbing', { now })).toMatchObject({ status: 'none' });
  });

  it('never re-proposes a rejected topic id, and tells the model it was rejected', async () => {
    await unmatched(20, day(-2));
    const first = await discoverTopic({ db: dbs.service, ai: proposing(WARRANTY), packs }, 'hvac_plumbing', { now });
    await decideTopicProposal(dbs.service, (first as { proposalId: string }).proposalId, 'rejected', 'am@agency.example');
    // Analysed a day "in the future" so these rows are newer than the rejected proposal's DB-clock created_at, whatever the clock skew.
    await unmatched(20, new Date(Date.now() + 86_400_000));
    const ai = proposing(WARRANTY); // the model (incorrectly) proposes the same rejected id again
    const second = await discoverTopic({ db: dbs.service, ai, packs }, 'hvac_plumbing', { now });
    expect(second).toMatchObject({ status: 'none' }); // treated as invalid despite the model saying found=true
    expect(ai.calls.chat[0]!.content).toContain('REJECTED topics');
    expect(ai.calls.chat[0]!.content).toContain('warranty_claims');
    const [p] = await dbs.owner.select().from(topicProposal).where(eq(topicProposal.id, (second as { proposalId: string }).proposalId));
    expect(p).toMatchObject({ topicId: '', status: 'none' });
  });

  it('needs at least 20 unmatched reviews', async () => {
    await unmatched(19);
    expect(await discoverTopic({ db: dbs.service, ai: proposing(WARRANTY), packs }, 'hvac_plumbing', { now })).toEqual({ skipped: '19 untagged review(s) since the last proposal' });
  });

  it('loses a check-then-insert race to a concurrent run and skips instead of throwing or double-proposing', async () => {
    await unmatched(20);
    // The pending check passes (no 'proposed' row yet), but a concurrent run commits one — for a *different*
    // topic id — before this run's own insert, simulated by racing it from inside the fake chat call.
    const raceAi: Ai = {
      async chat() {
        await dbs.service.insert(topicProposal).values({ verticalId: 'hvac_plumbing', topicId: 'other_topic', name: 'Other', description: 'd', status: 'proposed', otherCount: 1 });
        return { text: JSON.stringify(WARRANTY), model: 'fake', inputTokens: 0, outputTokens: 0, costUsd: 0, cachedTokens: 0, toolCalls: [], finishReason: null };
      },
      async chatWithTools() {
        throw new Error('not used by this test');
      },
      async decide() {
        throw new Error('not used by this test');
      },
      async embed() {
        throw new Error('not used by this test');
      },
      batchAvailable: () => false,
      async submitBatch() { throw new Error('not used by this test'); },
      async collectBatch() { throw new Error('not used by this test'); },
    };
    expect(await discoverTopic({ db: dbs.service, ai: raceAi, packs }, 'hvac_plumbing', { now })).toEqual({ skipped: 'a proposal is awaiting approval' });
    const proposed = await dbs.owner.select().from(topicProposal).where(eq(topicProposal.status, 'proposed'));
    expect(proposed).toHaveLength(1);
    expect(proposed[0]).toMatchObject({ topicId: 'other_topic' });
  });
});

describe('runReviewInsights', () => {
  it('runs complaint detection per analysed competitor and discovery per vertical, counting errors', async () => {
    await unmatched(20);
    const r = await runReviewInsights({ db: dbs.service, ai: proposing(WARRANTY), packs }, { now });
    expect(r).toEqual({ competitors: 1, spikes: 0, proposals: 1, errors: 0, batched: 0, batchFallbacks: 0 });
  });
});

type Collect = (task: string, batchId: string) => { status: 'in_progress' } | { status: 'ended'; results: BatchItemResult[] };
const batching = (collect?: Collect) => createFakeAi({ batch: { submit: () => 'msgbatch_1', collect } });

describe('batched topic discovery (Phase 3d decision 10)', () => {
  it('submits one request per eligible vertical and records the batch instead of calling chat', async () => {
    await unmatched(20);
    const ai = batching();
    const r = await runReviewInsights({ db: dbs.service, ai, packs }, { now });
    expect(r).toMatchObject({ batched: 1, proposals: 0, errors: 0 });
    expect(ai.calls.chat).toEqual([]);
    expect(ai.calls.batches[0]!.task).toBe(THEME_BATCH_TASK);
    expect(ai.calls.batches[0]!.requests.map((q) => q.customId)).toEqual(['hvac_plumbing']);
    expect(JSON.stringify(ai.calls.batches[0]!.requests)).not.toContain('Mike');
    const [b] = await dbs.owner.select().from(modelBatch);
    expect(b).toMatchObject({ providerBatchId: 'msgbatch_1', purpose: 'theme_discovery', status: 'submitted', requestCount: 1 });
    expect(Object.keys(b!.items)).toEqual(['hvac_plumbing']);
    expect(Object.keys((b!.items as Record<string, Record<string, unknown>>).hvac_plumbing!)).toEqual(expect.arrayContaining(['topicIds', 'rejectedIds']));
    // A vertical with a batch in flight is not sent again.
    expect((await runReviewInsights({ db: dbs.service, ai, packs }, { now })).batched).toBe(0);
  });

  it('falls back to the synchronous path when the batch submit throws, recording the proposal without an error', async () => {
    await unmatched(20);
    const ai = createFakeAi({
      chat: () => JSON.stringify(WARRANTY),
      batch: { submit: () => { throw new Error('400 invalid_request_error: key not scoped to a workspace'); } },
    });
    const r = await runReviewInsights({ db: dbs.service, ai, packs }, { now });
    expect(r).toMatchObject({ batched: 0, batchFallbacks: 1, proposals: 1, errors: 0 });
    expect(ai.calls.batches).toHaveLength(1);
    expect(ai.calls.chat.map((c) => c.task)).toEqual(['theme_discovery']);
    // The pending row written before the submit is marked failed (nothing is in flight).
    expect(await dbs.service.select().from(modelBatch)).toMatchObject([{ status: 'failed', providerBatchId: null, error: expect.stringMatching(/key not scoped/) }]);
    const [p] = await dbs.service.select().from(topicProposal);
    expect(p).toMatchObject({ verticalId: 'hvac_plumbing', status: 'proposed' });
  });

  it('an error after a successful submit (recording the batch) is counted and never re-run synchronously', async () => {
    await unmatched(20);
    const ai = createFakeAi({ chat: () => JSON.stringify(WARRANTY), batch: { submit: () => 'msgbatch_orphan' } });
    // Wrap the service db so only the model_batch update (recording the provider id) fails; every read goes through unchanged.
    const db = new Proxy(dbs.service, {
      get(t, p, recv) {
        if (p === 'update') return (table: unknown) => (table === modelBatch ? { set: () => ({ where: async () => { throw new Error('update failed'); } }) } : t.update(table as never));
        const v = Reflect.get(t, p, recv);
        return typeof v === 'function' ? v.bind(t) : v;
      },
    });
    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((m: string) => void errors.push(m));
    try {
      const r = await runReviewInsights({ db, ai, packs }, { now });
      expect(r).toMatchObject({ batched: 0, batchFallbacks: 0, proposals: 0, errors: 1 });
    } finally {
      spy.mockRestore();
    }
    expect(ai.calls.batches).toHaveLength(1);
    expect(ai.calls.chat).toEqual([]);
    expect(errors.join(' ')).toContain('msgbatch_orphan');
    expect(await dbs.service.select().from(topicProposal)).toEqual([]);
    // The row stays pending (not failed): the provider batch may be live, so it is never re-run.
    expect(await dbs.service.select().from(modelBatch)).toMatchObject([{ status: 'pending', providerBatchId: null }]);
  });

  it('pending row exists before submit and becomes submitted', async () => {
    await unthemed(20);
    const seen: unknown[] = [];
    const ai = createFakeAi({
      batch: { submit: () => { seen.push('submit'); return 'msgbatch_1'; } },
    });
    const wrapped = { ...ai, submitBatch: async (...a: Parameters<typeof ai.submitBatch>) => { seen.push(await dbs.owner.select().from(modelBatch)); return ai.submitBatch(...a); } };
    await runReviewInsights({ db: dbs.service, ai: wrapped, packs }, { now });
    expect(seen[0]).toMatchObject([{ status: 'pending', providerBatchId: null, purpose: 'theme_discovery', requestCount: 1 }]);
    expect(await dbs.owner.select().from(modelBatch)).toMatchObject([{ status: 'submitted', providerBatchId: 'msgbatch_1' }]);
  });

  it('submit throw marks the row failed', async () => {
    await unthemed(20);
    const ai = createFakeAi({ chat: () => JSON.stringify(WARRANTY), batch: { submit: () => { throw new Error('boom'); } } });
    await runReviewInsights({ db: dbs.service, ai, packs }, { now });
    expect(await dbs.owner.select().from(modelBatch)).toMatchObject([{ status: 'failed', providerBatchId: null, error: expect.stringMatching(/boom/) }]);
  });

  it('a spend-paused submit marks the row failed and surfaces AiPausedError (no sync fallback, no BatchSubmitError)', async () => {
    await unthemed(20);
    const paused = new AiPausedError('platform');
    const ai = createFakeAi({ chat: () => JSON.stringify(WARRANTY), batch: { submit: () => { throw paused; } } });
    await expect(submitTopicDiscoveryBatch({ db: dbs.service, ai, packs }, ['hvac_plumbing'], { now })).rejects.toBe(paused);
    expect(await dbs.owner.select().from(modelBatch)).toMatchObject([{ status: 'failed', providerBatchId: null }]);
    // runReviewInsights rethrows it (no sync fallback) so the worker's runJob can map the pause.
    await dbs.owner.update(modelBatch).set({ status: 'failed' });
    await expect(runReviewInsights({ db: dbs.service, ai, packs }, { now })).rejects.toBe(paused);
    expect(ai.calls.chat).toEqual([]);
    expect((await dbs.owner.select().from(modelBatch)).every((b) => b.status === 'failed')).toBe(true);
  });

  it('a proposed row slipped in between prepare and apply does not abort the batch transaction', async () => {
    await dbs.owner.insert(topicProposal).values({ verticalId: 'hvac_plumbing', topicId: 'other_theme', name: 'Other', description: 'd', status: 'proposed', otherCount: 1 });
    const ctx = { verticalId: 'hvac_plumbing', topicIds: [], rejectedIds: [], otherCount: 20, sampleReviewIds: [] } as never;
    const out = await dbs.service.transaction(async (tx) => {
      // Hide the committed row from the early re-read so the insert itself hits topic_proposal_pending_unique.
      const blind = new Proxy(tx, { get(t, p, r) { if (p === 'select') return () => ({ from: () => ({ where: async () => [] }) }); const v = Reflect.get(t, p, r); return typeof v === 'function' ? v.bind(t) : v; } });
      const res = await applyTopicProposal(blind as never, ctx, JSON.stringify(WARRANTY));
      await tx.update(modelBatch).set({ error: 'still usable' }); // would throw "current transaction is aborted" without the savepoint
      return res;
    });
    expect(out).toEqual({ skipped: 'a proposal is awaiting approval' });
    expect((await dbs.owner.select().from(topicProposal)).filter((p) => p.status === 'proposed')).toHaveLength(1);
  });

  it('re-applying an ended batch creates no second proposal', async () => {
    await unthemed(20);
    await runReviewInsights({ db: dbs.service, ai: batching(), packs }, { now });
    const none = JSON.stringify({ found: false });
    // A concurrent collector ends the batch while this one is polling: this one must not apply the items again.
    const ai = batching(() => {
      return { status: 'ended', results: [{ customId: 'hvac_plumbing', ok: true, text: none, model: 'm', inputTokens: 1, outputTokens: 1 }] };
    });
    const flipping = { ...ai, collectBatch: async (...a: Parameters<typeof ai.collectBatch>) => { const res = await ai.collectBatch(...a); await dbs.owner.update(modelBatch).set({ status: 'ended' }); return res; } };
    expect(await collectModelBatches({ db: dbs.service, ai: flipping }, { now })).toMatchObject({ checked: 1, ended: 0, applied: 0 });
    expect(await dbs.owner.select().from(topicProposal)).toEqual([]);
    // And two collectors racing on one submitted batch apply it once.
    await dbs.owner.update(modelBatch).set({ status: 'submitted' });
    await Promise.all([collectModelBatches({ db: dbs.service, ai }, { now }), collectModelBatches({ db: dbs.service, ai }, { now })]);
    expect(await dbs.owner.select().from(topicProposal)).toHaveLength(1);
  });

  it('stale pending swept to failed', async () => {
    const base = { task: THEME_BATCH_TASK, provider: 'anthropic', purpose: 'theme_discovery', items: {}, requestCount: 1, status: 'pending' as const };
    const t = new Date();
    await dbs.owner.insert(modelBatch).values([
      { ...base, createdAt: new Date(t.getTime() - 61 * 60_000) },
      { ...base, createdAt: new Date(t.getTime() - 30 * 60_000) },
    ]);
    const r = await collectModelBatches({ db: dbs.service, ai: batching() }, { now: t });
    expect(r).toMatchObject({ checked: 0, expired: 1 });
    const rows = await dbs.owner.select().from(modelBatch).orderBy(modelBatch.createdAt);
    expect(rows.map((x) => x.status)).toEqual(['failed', 'pending']);
    expect(rows[0]).toMatchObject({ error: 'orphaned before submit (check provider)', endedAt: expect.any(Date) });
  });

  it('applies an ended batch: proposes the topic and closes the batch', async () => {
    await unmatched(20);
    await runReviewInsights({ db: dbs.service, ai: batching(), packs }, { now });
    const ai = batching(() => ({ status: 'ended', results: [{ customId: 'hvac_plumbing', ok: true, text: JSON.stringify(WARRANTY), model: 'claude-sonnet-5', inputTokens: 1, outputTokens: 1 }] }));
    expect(await collectModelBatches({ db: dbs.service, ai }, { now })).toEqual({ checked: 1, ended: 1, applied: 1, failed: 0, expired: 0 });
    expect((await dbs.owner.select().from(topicProposal))[0]).toMatchObject({ topicId: 'warranty_claims', status: 'proposed', otherCount: 20 });
    expect((await dbs.owner.select().from(modelBatch))[0]?.status).toBe('ended');
  });

  it('applying a discovery batch passes a per-vertical scope', async () => {
    await unmatched(20);
    await runReviewInsights({ db: dbs.service, ai: batching(), packs }, { now });
    const ai = batching(() => ({ status: 'ended', results: [] }));
    await collectModelBatches({ db: dbs.service, ai }, { now });
    expect(ai.calls.collects[0]!.scopeFor!('dental')).toEqual({ verticalId: 'dental' });
    await dbs.service.update(modelBatch).set({ status: 'submitted', purpose: 'other_purpose' });
    const ai2 = batching(() => ({ status: 'ended', results: [] }));
    await collectModelBatches({ db: dbs.service, ai: ai2 }, { now });
    expect(ai2.calls.collects[0]!.scopeFor).toBeUndefined();
  });

  it('a failed request writes nothing, so the same reviews are offered again next night', async () => {
    await unmatched(20);
    await runReviewInsights({ db: dbs.service, ai: batching(), packs }, { now });
    await collectModelBatches({ db: dbs.service, ai: batching(() => ({ status: 'ended', results: [{ customId: 'hvac_plumbing', ok: false, error: 'expired' }] })) }, { now });
    expect(await dbs.owner.select().from(topicProposal)).toEqual([]);
    expect((await discoverTopic({ db: dbs.service, ai: proposing(WARRANTY), packs }, 'hvac_plumbing', { now }))).toMatchObject({ status: 'proposed' });
  });

  it('a result for a vertical that got a pending proposal meanwhile is skipped, never a second pending row', async () => {
    await unmatched(20);
    await runReviewInsights({ db: dbs.service, ai: batching(), packs }, { now });
    await dbs.service.insert(topicProposal).values({ verticalId: 'hvac_plumbing', topicId: 'other_topic', name: 'Other', description: 'd', status: 'proposed', otherCount: 1 });
    const ai = batching(() => ({ status: 'ended', results: [{ customId: 'hvac_plumbing', ok: true, text: JSON.stringify(WARRANTY), model: 'm', inputTokens: 1, outputTokens: 1 }] }));
    expect(await collectModelBatches({ db: dbs.service, ai }, { now })).toMatchObject({ ended: 1, applied: 0 });
    expect((await dbs.owner.select().from(topicProposal)).filter((p) => p.status === 'proposed')).toHaveLength(1);
  });

  it('marks a batch still unfinished after 26 hours as failed', async () => {
    await unmatched(20);
    await runReviewInsights({ db: dbs.service, ai: batching(), packs }, { now });
    const later = new Date(Date.now() + 27 * 3_600_000);
    expect(await collectModelBatches({ db: dbs.service, ai: batching(() => ({ status: 'in_progress' })) }, { now: later })).toMatchObject({ expired: 1 });
    expect((await dbs.owner.select().from(modelBatch))[0]).toMatchObject({ status: 'failed', error: expect.stringMatching(/26 h/) });
  });
});
