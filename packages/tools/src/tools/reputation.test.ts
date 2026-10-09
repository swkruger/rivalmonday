import { client } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { monthKeys } from './reputation';
import type { RatingTrendView, ReviewList, ThemeBenchmarkView } from './schemas';
import { ago, ctx, dbs, registry, resetWorkspace, seedGbpRating, seedReview, seedSelf } from './workspace-fixtures';

const am = ctx('account_manager', 'all');
const owner = ctx('client_owner', [IDS.clientA1], ['dashboard']);
const ownerNoDash = ctx('client_owner', [IDS.clientA1]);
const otherAgency = ctx('agency_admin', 'all', [], IDS.agencyB);

beforeEach(resetWorkspace);

describe('get_theme_benchmark', () => {
  it('compares theme share and sentiment, self first, with null for a theme never asked (decision 7, Review Focus 3)', async () => {
    const selfId = await seedSelf();
    await seedReview({ competitorId: selfId, rating: 5, postedAt: ago(3), analysis: { asked: ['response_time'], themes: ['response_time'], sentiment: 4 } });
    await seedReview({ rating: 1, postedAt: ago(5), analysis: { asked: ['response_time', 'price_transparency'], themes: ['response_time'], sentiment: 0 } });
    await seedReview({ rating: 5, postedAt: ago(6), analysis: { asked: ['response_time'], themes: [], sentiment: 4 } });
    await seedReview({ competitorId: IDS.competitorY, postedAt: ago(2), analysis: { asked: ['response_time'], themes: ['response_time'], sentiment: 4 } });
    const r = (await registry.invoke(owner, 'get_theme_benchmark', { clientId: IDS.clientA1 })) as ThemeBenchmarkView;
    expect(r.windowDays).toBe(90);
    expect(r.themes.slice(0, 2)).toEqual([{ id: 'response_time', name: 'Response time' }, { id: 'price_transparency', name: 'Price transparency' }]);
    expect(r.businesses.map((b) => [b.name, b.self, b.reviews, b.avgRating])).toEqual([['A1 HVAC', true, 1, 5], ['Smith HVAC', false, 2, 3]]);
    const smith = r.businesses[1]!.themes;
    expect(smith.find((t) => t.themeId === 'response_time')).toMatchObject({ mentions: 1, asked: 2, share: 0.5, sentiment: -1 });
    expect(smith.find((t) => t.themeId === 'price_transparency')).toMatchObject({ mentions: 0, asked: 1, share: 0, sentiment: null });
    expect(smith.find((t) => t.themeId === 'upsell_pressure')).toMatchObject({ asked: 0, share: null });
  });

  it('works without a self business, refuses another agency and needs dashboard', async () => {
    const r = (await registry.invoke(am, 'get_theme_benchmark', { clientId: IDS.clientA1 })) as ThemeBenchmarkView;
    expect(r.businesses.map((b) => b.self)).toEqual([false]);
    await expect(registry.invoke(otherAgency, 'get_theme_benchmark', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ownerNoDash, 'get_theme_benchmark', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'permission_denied' });
  });
});

describe('monthKeys', () => {
  it('lists UTC calendar months ending with the current one', () => {
    expect(monthKeys(new Date('2026-01-15T12:00:00Z'), 3)).toEqual(['2025-11', '2025-12', '2026-01']);
  });
});

describe('get_rating_trend', () => {
  // Freeze only Date (DB drivers need real timers) so a run at a UTC month boundary cannot shift the month keys.
  afterEach(() => vi.useRealTimers());

  it('gives per-business rating, velocity, reply rate, mix and monthly stars (decision 8)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
    const selfId = await seedSelf();
    await seedGbpRating(selfId, 4.7);
    const now = new Date();
    await seedReview({ competitorId: selfId, rating: 5, postedAt: now, ownerAnswer: 'Thanks!' });
    await seedReview({ competitorId: selfId, rating: 3, postedAt: now });
    await seedReview({ competitorId: selfId, rating: 4, postedAt: ago(40) });
    await seedReview({ competitorId: selfId, rating: 1, postedAt: ago(400) }); // outside the months, still in the mix
    await seedReview({ competitorId: selfId, rating: null, postedAt: null }); // undated, rating-less
    const r = (await registry.invoke(owner, 'get_rating_trend', { clientId: IDS.clientA1, months: 6 })) as RatingTrendView;
    expect(r.selfPending).toBe(false);
    expect(r.months).toHaveLength(6);
    expect(r.months.at(-1)).toBe(now.toISOString().slice(0, 7));
    const self = r.businesses[0]!;
    expect([self.name, self.self, self.gbpRating, self.reviews90d, self.perMonth, self.replyRate]).toEqual(['A1 HVAC', true, 4.7, 3, 0.5, 0.33]);
    expect(self.mix).toEqual([1, 0, 1, 1, 1]);
    expect(self.monthly.at(-1)).toEqual({ reviews: 2, avgRating: 4 });
    expect(self.monthly[r.months.indexOf(ago(40).toISOString().slice(0, 7))]).toEqual({ reviews: 1, avgRating: 4 });
    expect(self.monthly.find((m) => m.reviews === 0)).toEqual({ reviews: 0, avgRating: null }); // Review Focus 3
    expect(r.businesses.map((b) => b.name)).toEqual(['A1 HVAC', 'Smith HVAC']);
    expect(r.businesses[1]).toMatchObject({ gbpRating: null, reviews90d: 0, replyRate: null, mix: [0, 0, 0, 0, 0] });
  });

  it('flags selfPending only when the client has a place id but no self business yet', async () => {
    const none = (await registry.invoke(owner, 'get_rating_trend', { clientId: IDS.clientA1 })) as RatingTrendView;
    expect([none.selfPending, none.businesses.map((b) => b.self)]).toEqual([false, [false]]);
    await dbs.owner.update(client).set({ placeId: 'client-place' }).where(eq(client.id, IDS.clientA1));
    const pending = (await registry.invoke(owner, 'get_rating_trend', { clientId: IDS.clientA1, months: 6 })) as RatingTrendView;
    expect([pending.selfPending, pending.months.length, pending.businesses.map((b) => b.self)]).toEqual([true, 6, [false]]);
    await seedSelf();
    const ready = (await registry.invoke(owner, 'get_rating_trend', { clientId: IDS.clientA1 })) as RatingTrendView;
    expect(ready.selfPending).toBe(false);
  });

  it('refuses another agency and needs dashboard', async () => {
    await expect(registry.invoke(otherAgency, 'get_rating_trend', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ownerNoDash, 'get_rating_trend', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'permission_denied' });
  });
});

describe('search_reviews', () => {
  it('rejects an offset above 5000', async () => {
    await expect(registry.invoke(am, 'search_reviews', { clientId: IDS.clientA1, offset: 5001 })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  beforeEach(async () => {
    const selfId = await seedSelf();
    await seedReview({ competitorId: selfId, rating: 5, text: 'Fast and friendly', postedAt: ago(2), analysis: { asked: ['response_time'], themes: ['response_time'], sentiment: 4 } });
    await seedReview({ rating: 2, text: 'Tech was late and pushy', postedAt: ago(1), ownerAnswer: 'Sorry!', analysis: { asked: ['response_time', 'upsell_pressure'], themes: ['response_time', 'upsell_pressure'], sentiment: 0 } });
    await seedReview({ rating: 4, text: 'Fair price, 100% happy', postedAt: ago(100) });
    await seedReview({ competitorId: IDS.competitorY, text: 'Other client’s competitor', postedAt: ago(1) });
  });

  it('returns text as published, never the reviewer, newest first, sentiment on the -1..+1 scale (decision 6)', async () => {
    const r = (await registry.invoke(owner, 'search_reviews', { clientId: IDS.clientA1 })) as ReviewList;
    expect(r.items.map((i) => [i.name, i.self, i.text])).toEqual([['Smith HVAC', false, 'Tech was late and pushy'], ['A1 HVAC', true, 'Fast and friendly']]);
    expect(r.items[0]).toMatchObject({ rating: 2, ownerAnswer: 'Sorry!', sentiment: -1, themes: [{ id: 'response_time', name: 'Response time' }, { id: 'upsell_pressure', name: 'Upsell pressure' }] });
    expect(r.items[1]?.sentiment).toBe(1);
    expect(JSON.stringify(r)).not.toContain('hash-secret');
    expect(r.hasMore).toBe(false);
  });

  it('filters by business, theme, stars, text (escaped) and period', async () => {
    const q = async (input: Record<string, unknown>) => ((await registry.invoke(am, 'search_reviews', { clientId: IDS.clientA1, ...input })) as ReviewList).items.map((i) => i.text);
    expect(await q({ business: 'self' })).toEqual(['Fast and friendly']);
    expect(await q({ business: IDS.competitorX, themeId: 'upsell_pressure' })).toEqual(['Tech was late and pushy']);
    expect(await q({ stars: 5 })).toEqual(['Fast and friendly']);
    expect(await q({ text: 'LATE' })).toEqual(['Tech was late and pushy']);
    expect(await q({ text: '100%', days: 365 })).toEqual(['Fair price, 100% happy']);
    expect(await q({ text: '%', days: 30 })).toEqual([]);
    expect(await q({ days: 365 })).toHaveLength(3);
  });

  it('refuses an unknown theme, an untracked competitor and a missing self business (Review Focus 2)', async () => {
    await expect(registry.invoke(am, 'search_reviews', { clientId: IDS.clientA1, themeId: 'nope' })).rejects.toMatchObject({ code: 'invalid_input', message: 'Unknown theme' });
    await expect(registry.invoke(am, 'search_reviews', { clientId: IDS.clientA1, business: IDS.competitorY })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ctx('account_manager', 'all'), 'search_reviews', { clientId: IDS.clientA2, business: 'self' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ownerNoDash, 'search_reviews', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'permission_denied' });
  });

  it('pages 20 at a time', async () => {
    for (let i = 0; i < 20; i++) await seedReview({ text: `bulk ${i}`, postedAt: ago(3) });
    const first = (await registry.invoke(am, 'search_reviews', { clientId: IDS.clientA1 })) as ReviewList;
    expect([first.items.length, first.hasMore]).toEqual([20, true]);
    const second = (await registry.invoke(am, 'search_reviews', { clientId: IDS.clientA1, offset: 20 })) as ReviewList;
    expect([second.items.length, second.hasMore]).toEqual([2, false]);
  });
});
