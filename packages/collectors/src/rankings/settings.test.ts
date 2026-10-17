import { describe, expect, it } from 'vitest';
import { rankKeywordsFor, rankMapSettingsHash, rankRadiusKm } from './settings';

describe('rank settings', () => {
  it('rankKeywordsFor falls back to the first 5 keywords', () => {
    expect(rankKeywordsFor({ keywords: ['a', 'b', 'c', 'd', 'e', 'f'], rankKeywords: [] })).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('drops rank keywords no longer in client.keywords', () => {
    expect(rankKeywordsFor({ keywords: ['a', 'b', 'c'], rankKeywords: ['b', 'gone'] })).toEqual(['b']);
  });
  it('empty intersection falls back', () => {
    expect(rankKeywordsFor({ keywords: ['a', 'b'], rankKeywords: ['gone'] })).toEqual(['a', 'b']);
  });
  it('radius clamps 1→2 and 60→40', () => {
    expect(rankRadiusKm(1)).toBe(2);
    expect(rankRadiusKm(60)).toBe(40);
    expect(rankRadiusKm(8)).toBe(8);
  });
  it('settings hash ignores key order', () => {
    const a = rankMapSettingsHash({ center: { lat: 1, lng: 2 }, radiusKm: 8, gridSize: 5 });
    const b = rankMapSettingsHash({ gridSize: 5, radiusKm: 8, center: { lng: 2, lat: 1 } });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(rankMapSettingsHash({ center: { lat: 1, lng: 2 }, radiusKm: 9, gridSize: 5 })).not.toBe(a);
  });
});
