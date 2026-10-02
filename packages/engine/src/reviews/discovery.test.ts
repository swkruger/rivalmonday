import type { Ai } from '@cs/ai';
import { review, reviewAnalysis, themeProposal } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createFakeAi } from '../../test/fake-ai';
import { day } from '../../test/seed';
import { createPackLoader } from '../tag/tag-stage';
import { decideThemeProposal, discoverTheme, runReviewInsights } from './discovery';
import { buildReviewQuestions, themeKey, themesForVertical } from './themes';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
const now = day(0);
let n = 0;

async function unthemed(count: number, analyzedAt = day(-1)) {
  for (let i = 0; i < count; i++) {
    const [r] = await dbs.service
      .insert(review)
      .values({ competitorId: IDS.competitorX, dedupeKey: `id:${n++}`, rating: 2, text: `Thanks Mike, but the warranty claim was refused (${i})`, postedAt: day(-10) })
      .returning({ id: review.id });
    await dbs.service.insert(reviewAnalysis).values({ reviewId: r!.id, verticalId: 'hvac_plumbing', competitorId: IDS.competitorX, textSha: 's', asked: [], themes: [], other: true, sentiment: 1, confidence: 0.9, analysisVersion: 1, analyzedAt });
  }
}

const proposing = (body: object) => createFakeAi({ chat: () => JSON.stringify(body) });
const WARRANTY = { found: true, id: 'warranty_claims', name: 'Warranty claims', description: 'Whether warranty repairs are honoured' };

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('discoverTheme', () => {
  it('proposes a theme from enough unthemed reviews, with redacted samples, then waits for the AM', async () => {
    await unthemed(20);
    const ai = proposing(WARRANTY);
    const r = await discoverTheme({ db: dbs.service, ai, packs }, 'hvac_plumbing', { now });
    expect(r).toMatchObject({ status: 'proposed' });
    expect(ai.calls.chat[0]!.task).toBe('theme_discovery');
    expect(ai.calls.chat[0]!.content).not.toContain('Mike');
    expect(ai.calls.chat[0]!.content).toContain('price_transparency (Price transparency)');
    const [p] = await dbs.owner.select().from(themeProposal);
    expect(p).toMatchObject({ verticalId: 'hvac_plumbing', themeId: 'warranty_claims', name: 'Warranty claims', status: 'proposed', otherCount: 20 });
    expect(p!.sampleReviewIds).toHaveLength(10);
    expect(await discoverTheme({ db: dbs.service, ai, packs }, 'hvac_plumbing', { now })).toEqual({ skipped: 'a proposal is awaiting approval' });
  });

  it('an approved theme joins the vertical theme list and the review questions', async () => {
    await unthemed(20);
    const r = await discoverTheme({ db: dbs.service, ai: proposing(WARRANTY), packs }, 'hvac_plumbing', { now });
    await decideThemeProposal(dbs.service, (r as { proposalId: string }).proposalId, 'approved', 'am@agency.example');
    const pack = await packs('hvac_plumbing');
    const themes = await themesForVertical(dbs.service, pack);
    expect(themes.at(-1)).toEqual({ id: 'warranty_claims', name: 'Warranty claims', description: 'Whether warranty repairs are honoured' });
    expect(buildReviewQuestions([{ pack, themes }])[themeKey('hvac_plumbing', 'warranty_claims')]).toBeDefined();
    await expect(decideThemeProposal(dbs.service, (r as { proposalId: string }).proposalId, 'rejected', 'x')).rejects.toThrow(/not awaiting a decision/);
  });

  it('records "none" (no new theme, or an invalid one) so the same reviews are not sent again', async () => {
    await unthemed(20, day(-2));
    expect(await discoverTheme({ db: dbs.service, ai: proposing({ found: false, id: '', name: '', description: '' }), packs }, 'hvac_plumbing', { now })).toMatchObject({ status: 'none' });
    expect(await discoverTheme({ db: dbs.service, ai: proposing(WARRANTY), packs }, 'hvac_plumbing', { now })).toEqual({ skipped: '0 unthemed review(s) since the last proposal' });
    // Analysed a day "in the future" so these rows are newer than the 'none' row's DB-clock created_at, whatever the clock skew.
    await unthemed(20, new Date(Date.now() + 86_400_000));
    expect(await discoverTheme({ db: dbs.service, ai: proposing({ ...WARRANTY, id: 'Price Transparency!' }), packs }, 'hvac_plumbing', { now })).toMatchObject({ status: 'none' });
  });

  it('needs at least 20 unthemed reviews', async () => {
    await unthemed(19);
    expect(await discoverTheme({ db: dbs.service, ai: proposing(WARRANTY), packs }, 'hvac_plumbing', { now })).toEqual({ skipped: '19 unthemed review(s) since the last proposal' });
  });

  it('loses a check-then-insert race to a concurrent run and skips instead of throwing or double-proposing', async () => {
    await unthemed(20);
    // The pending check passes (no 'proposed' row yet), but a concurrent run commits one — for a *different*
    // theme id — before this run's own insert, simulated by racing it from inside the fake chat call.
    const raceAi: Ai = {
      async chat() {
        await dbs.service.insert(themeProposal).values({ verticalId: 'hvac_plumbing', themeId: 'other_theme', name: 'Other', description: 'd', status: 'proposed', otherCount: 1 });
        return { text: JSON.stringify(WARRANTY), model: 'fake', inputTokens: 0, outputTokens: 0, costUsd: 0 };
      },
      async decide() {
        throw new Error('not used by this test');
      },
      async embed() {
        throw new Error('not used by this test');
      },
    };
    expect(await discoverTheme({ db: dbs.service, ai: raceAi, packs }, 'hvac_plumbing', { now })).toEqual({ skipped: 'a proposal is awaiting approval' });
    const proposed = await dbs.owner.select().from(themeProposal).where(eq(themeProposal.status, 'proposed'));
    expect(proposed).toHaveLength(1);
    expect(proposed[0]).toMatchObject({ themeId: 'other_theme' });
  });
});

describe('runReviewInsights', () => {
  it('runs complaint detection per analysed competitor and discovery per vertical, counting errors', async () => {
    await unthemed(20);
    const r = await runReviewInsights({ db: dbs.service, ai: proposing(WARRANTY), packs }, { now });
    expect(r).toEqual({ competitors: 1, spikes: 0, proposals: 1, errors: 0 });
  });
});
