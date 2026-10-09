import { client } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { monthKeys } from './reputation';
import type { RatingTrendView, ThemeBenchmarkView } from './schemas';
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
  it('gives per-business rating, velocity, reply rate, mix and monthly stars (decision 8)', async () => {
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
