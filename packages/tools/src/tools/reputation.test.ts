import { IDS } from '@cs/db/test-helpers';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ThemeBenchmarkView } from './schemas';
import { ago, ctx, registry, resetWorkspace, seedReview, seedSelf } from './workspace-fixtures';

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
