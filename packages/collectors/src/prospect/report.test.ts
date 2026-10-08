import { describe, expect, it } from 'vitest';
import { buildProspectReport, gbpSummary, summarizeRanks } from './report';

const at = (keyword: string, ...results: { rank: number; placeId?: string; cid?: string }[]) => ({
  keyword, results: results.map((r) => ({ rank: r.rank, placeId: r.placeId ?? null, cid: r.cid ?? null, domain: null, title: 'x' })),
});

describe('summarizeRanks', () => {
  it('counts points found, points in the top 3 and the average rank where found, per keyword', () => {
    const points = [at('ac repair', { rank: 1, placeId: 'P1' }), at('ac repair', { rank: 5, placeId: 'P1' }), at('ac repair', { rank: 2, placeId: 'P2' }), at('furnace', { rank: 3, cid: 'C1' })];
    expect(summarizeRanks(points, ['ac repair', 'furnace'], { placeId: 'P1', cid: 'C1' })).toEqual([
      { keyword: 'ac repair', found: 2, top3: 1, averageRank: 3 },
      { keyword: 'furnace', found: 1, top3: 1, averageRank: 3 },
    ]);
    expect(summarizeRanks(points, ['ac repair'], { placeId: null, cid: null })).toEqual([{ keyword: 'ac repair', found: 0, top3: 0, averageRank: null }]);
  });
});

describe('gbpSummary', () => {
  it('reads rating, reviews and categories defensively', () => {
    expect(gbpSummary({ rating: 4.6, votes: 212, category: 'HVAC contractor', additionalCategories: ['Plumber', 'Electrician'] })).toEqual({ rating: 4.6, reviews: 212, category: 'HVAC contractor', extraCategories: 2 });
    expect(gbpSummary({ rating: 'x', votes: null })).toEqual({ rating: null, reviews: null, category: null, extraCategories: 0 });
    expect(gbpSummary(null)).toBeNull();
  });
});

describe('buildProspectReport', () => {
  it('puts the prospect first, then competitors by name, with no model text', () => {
    const r = buildProspectReport({
      generatedAt: new Date('2026-10-07T12:00:00Z'), keywords: ['ac repair'], points: 9, scanId: 's1', notes: [],
      rankPoints: [at('ac repair', { rank: 1, placeId: 'SELF' })],
      businesses: [
        { competitorId: 'b', name: 'Zeta Air', self: false, placeId: 'Z', cid: null, gbp: null, ads: { google: 2, meta: null } },
        { competitorId: 'a', name: 'Alpha Air', self: false, placeId: 'A', cid: null, gbp: null, ads: { google: 0, meta: 1 } },
        { competitorId: 's', name: 'Our Shop', self: true, placeId: 'SELF', cid: null, gbp: { rating: 4.9, votes: 10 }, ads: { google: null, meta: null } },
      ],
    });
    expect(r.businesses.map((b) => b.name)).toEqual(['Our Shop', 'Alpha Air', 'Zeta Air']);
    expect(r.businesses[0]!.ranks).toEqual([{ keyword: 'ac repair', found: 1, top3: 1, averageRank: 1 }]);
    expect(r).toMatchObject({ generatedAt: '2026-10-07T12:00:00.000Z', points: 9, scanId: 's1' });
  });
});
