import { toolkit, ToolError } from '@cs/core';
import { type RankResult, rankScan, rankSnapshot, type Tx, withTenant } from '@cs/db';
import { competitorMatcher, NOT_FOUND_RANK } from '@cs/engine';
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { pickBusiness, workspaceBusinesses } from '../workspace/business';
import { workspaceClient } from '../workspace/scope';
import { BusinessKey, GeoGridView, ShareOfVoiceView } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const r1 = (x: number) => Math.round(x * 10) / 10;
const byWord = (a: string, b: string) => a.localeCompare(b, 'en');

type ScanRow = { id: string; finishedAt: Date | null };
const isDone = (clientId: string) => and(eq(rankScan.clientId, clientId), eq(rankScan.status, 'done'), isNotNull(rankScan.finishedAt));

/** The client's finished scans, newest first. Takes a tenant transaction: `rank_scan` is only ever read through `withTenant`. */
export async function doneScans(tx: Tx, clientId: string, limit: number): Promise<ScanRow[]> {
  return tx.select({ id: rankScan.id, finishedAt: rankScan.finishedAt }).from(rankScan)
    .where(isDone(clientId)).orderBy(desc(rankScan.finishedAt)).limit(limit);
}

/** One finished scan of the client by id, or `undefined`. Same tenant-transaction rule as `doneScans`. */
export async function doneScan(tx: Tx, clientId: string, id: string): Promise<ScanRow | undefined> {
  const [row] = await tx.select({ id: rankScan.id, finishedAt: rankScan.finishedAt }).from(rankScan)
    .where(and(eq(rankScan.id, id), isDone(clientId)));
  return row;
}

export const getGeogrid = defineTool({
  name: 'get_geogrid',
  description: 'Local-pack rank of one business (you or a tracked competitor) at every point of a rank-scan grid for one keyword, plus per-keyword summaries.',
  input: z.object({ clientId: uuid, keyword: z.string().trim().min(1).max(100).optional(), business: BusinessKey.optional(), scanId: uuid.optional() }),
  output: GeoGridView,
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, input, deps) {
    const c = await workspaceClient(deps, ctx, input.clientId);
    const list = await workspaceBusinesses(deps, ctx, c);
    const business = input.business ? pickBusiness(list, input.business) : (list[0] ?? null);
    const base = {
      scan: null, scans: [], keywords: [], keyword: null, size: 0, cells: [], top3: 0, points: 0, avgRank: null, keywordSummaries: [], radiusKm: c.radiusKm,
      businesses: list.map((b) => ({ key: b.key, name: b.name, self: b.self })), business: business?.key ?? null,
    };
    if (c.keywords.length === 0 || c.radiusKm === null) return { ...base, setup: 'no_keywords' as const };

    // Tenant tables: only ever through withTenant (Review Focus 1).
    const { scans, scan, snaps } = await withTenant(deps.app, ctx, async (tx) => {
      const recent = await doneScans(tx, c.id, 12);
      let chosen: ScanRow | undefined = recent[0];
      if (input.scanId) {
        chosen = await doneScan(tx, c.id, input.scanId);
        if (!chosen) throw new ToolError('not_found', 'Scan not found');
      }
      const rows = chosen
        ? await tx.select({ keyword: rankSnapshot.keyword, lat: rankSnapshot.lat, lng: rankSnapshot.lng, results: rankSnapshot.results }).from(rankSnapshot).where(eq(rankSnapshot.scanId, chosen.id))
        : [];
      return { scans: recent, scan: chosen ?? null, snaps: rows };
    });
    const scanList = scans.map((s) => ({ id: s.id, finishedAt: s.finishedAt!.toISOString() }));
    if (!scan) return { ...base, scans: scanList, setup: 'no_scan' as const };

    const keywords = [...new Set(snaps.map((s) => s.keyword))].sort(byWord);
    const keyword = input.keyword && keywords.includes(input.keyword) ? input.keyword : (keywords[0] ?? null);
    const lats = [...new Set(snaps.map((s) => s.lat))].sort((a, b) => b - a);
    const lngs = [...new Set(snaps.map((s) => s.lng))].sort((a, b) => a - b);
    const match = business ? competitorMatcher(business) : () => false;
    const rankIn = (results: RankResult[]) => results.find(match)?.rank ?? NOT_FOUND_RANK;
    const cells = lats.map((lat) => lngs.map((lng) => {
      const s = snaps.find((x) => x.keyword === keyword && x.lat === lat && x.lng === lng);
      return s ? rankIn(s.results) : null;
    }));
    const summary = (kw: string) => {
      const ranks = snaps.filter((s) => s.keyword === kw).map((s) => rankIn(s.results));
      return { keyword: kw, top3: ranks.filter((r) => r <= 3).length, points: ranks.length, avgRank: ranks.length ? r1(ranks.reduce((a, b) => a + b, 0) / ranks.length) : null };
    };
    const current = keyword ? summary(keyword) : { top3: 0, points: 0, avgRank: null };
    return {
      ...base, setup: 'ready' as const, scan: { id: scan.id, finishedAt: scan.finishedAt!.toISOString() }, scans: scanList, keywords, keyword,
      size: Math.max(lats.length, lngs.length), cells, top3: current.top3, points: current.points, avgRank: current.avgRank, keywordSummaries: keywords.map(summary),
    };
  },
});

/** Not `other` — that key is `foldSeries`'s folded remainder. */
export const OTHER_BUSINESSES = 'other_businesses';
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export const getShareOfVoice = defineTool({
  name: 'get_share_of_voice',
  description: 'Share of the top-3 local-pack slots held by you, each tracked competitor and other businesses, per monthly rank scan.',
  input: z.object({ clientId: uuid, keyword: z.string().trim().min(1).max(100).optional(), scans: z.number().int().min(1).max(12).default(6) }),
  output: ShareOfVoiceView,
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, input, deps) {
    const c = await workspaceClient(deps, ctx, input.clientId);
    const businesses = await workspaceBusinesses(deps, ctx, c);
    // Tenant tables: only ever through withTenant (Review Focus 1).
    const { scans, snaps } = await withTenant(deps.app, ctx, async (tx) => {
      const recent = await doneScans(tx, c.id, input.scans);
      const rows = recent.length
        ? await tx.select({ scanId: rankSnapshot.scanId, keyword: rankSnapshot.keyword, results: rankSnapshot.results }).from(rankSnapshot).where(inArray(rankSnapshot.scanId, recent.map((s) => s.id)))
        : [];
      return { scans: recent.reverse(), snaps: rows };
    });
    const keywords = [...new Set(snaps.map((s) => s.keyword))].sort(byWord);
    const keyword = input.keyword && keywords.includes(input.keyword) ? input.keyword : null;
    const matchers = businesses.map((b) => ({ key: b.key, match: competitorMatcher(b) }));
    const tallies = scans.map((scan) => {
      const tally = new Map<string, number>();
      let total = 0;
      for (const s of snaps) {
        if (s.scanId !== scan.id || (keyword && s.keyword !== keyword)) continue;
        for (const r of s.results) {
          if (r.rank > 3) continue;
          total++;
          const key = matchers.find((m) => m.match(r))?.key ?? OTHER_BUSINESSES;
          tally.set(key, (tally.get(key) ?? 0) + 1);
        }
      }
      return { tally, total };
    });
    const share = (key: string) => tallies.map(({ tally, total }) => (total === 0 ? null : r3((tally.get(key) ?? 0) / total)));
    return {
      keyword, keywords,
      scans: scans.map((s) => ({ id: s.id, finishedAt: s.finishedAt!.toISOString() })),
      series: [
        ...businesses.map((b) => ({ key: b.key, name: b.name, self: b.self, points: share(b.key) })),
        { key: OTHER_BUSINESSES, name: 'Other businesses', self: false, points: share(OTHER_BUSINESSES) },
      ],
    };
  },
});

export const rankingTools = [getGeogrid, getShareOfVoice];
