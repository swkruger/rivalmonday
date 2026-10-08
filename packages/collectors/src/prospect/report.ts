import type { ProspectBusiness, ProspectRank, ProspectReportData, RankResult } from '@cs/db';

export interface RankPoint { keyword: string; results: RankResult[] }
export interface ReportInputBusiness {
  competitorId: string;
  name: string;
  self: boolean;
  placeId: string | null;
  cid: string | null;
  gbp: Record<string, unknown> | null;
  ads: { google: number | null; meta: number | null };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Decision 11: per keyword, grid points where the business appears, points in the top 3, and its average rank where it appears. */
export function summarizeRanks(points: RankPoint[], keywords: string[], who: { placeId: string | null; cid: string | null }): ProspectRank[] {
  const matches = (r: RankResult) => (who.placeId !== null && r.placeId === who.placeId) || (who.cid !== null && r.cid === who.cid);
  return keywords.map((keyword) => {
    const found = points.filter((p) => p.keyword === keyword).map((p) => p.results.find(matches)?.rank).filter((r): r is number => typeof r === 'number');
    return { keyword, found: found.length, top3: found.filter((r) => r <= 3).length, averageRank: found.length ? round1(found.reduce((a, b) => a + b, 0) / found.length) : null };
  });
}

/** The latest GBP observation's headline numbers (collect-gbp.ts `extractGbpProfile` shape). */
export function gbpSummary(data: Record<string, unknown> | null): ProspectBusiness['gbp'] {
  if (!data) return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    rating: num(data.rating), reviews: num(data.votes), category: typeof data.category === 'string' ? data.category : null,
    extraCategories: Array.isArray(data.additionalCategories) ? data.additionalCategories.length : 0,
  };
}

/** Deterministic landscape report — no model text (owner decision). The prospect first, then competitors by name. */
export function buildProspectReport(input: {
  generatedAt: Date; keywords: string[]; points: number; scanId: string | null; businesses: ReportInputBusiness[]; rankPoints: RankPoint[]; notes: string[];
}): ProspectReportData {
  const businesses: ProspectBusiness[] = input.businesses
    .map((b) => ({ competitorId: b.competitorId, name: b.name, self: b.self, gbp: gbpSummary(b.gbp), ads: b.ads, ranks: summarizeRanks(input.rankPoints, input.keywords, b) }))
    .sort((a, b) => Number(b.self) - Number(a.self) || a.name.localeCompare(b.name));
  return { generatedAt: input.generatedAt.toISOString(), keywords: input.keywords, points: input.points, scanId: input.scanId, businesses, notes: input.notes };
}
