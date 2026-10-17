import { rankKeywordsFor } from '@cs/collectors';
import { canAccessClient, toolkit, ToolError } from '@cs/core';
import { client, type RankResult, rankScan, rankSnapshot, type Tx, withTenant } from '@cs/db';
import { competitorMatcher, NOT_FOUND_RANK } from '@cs/engine';
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { enqueueMapRefresh, rankScanAvailability, rankScanLabel, requestRankScan } from '../rank-scan';
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
  access: 'read',
  description: 'Local-pack rank of one business (you or a tracked competitor) at every point of a rank-scan grid for one keyword, plus per-keyword summaries.',
  input: z.object({ clientId: uuid, keyword: z.string().trim().min(1).max(100).optional(), business: BusinessKey.optional(), scanId: uuid.optional() }),
  output: GeoGridView,
  permission: 'read',
  channels: ['web', 'mcp', 'ask'],
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
    // No business to rank (no place id, no tracked competitor) is no data, never "not in the top 20".
    const rankIn = (results: RankResult[]): number | null => (business ? (results.find(match)?.rank ?? NOT_FOUND_RANK) : null);
    const cells = lats.map((lat) => lngs.map((lng) => {
      const s = snaps.find((x) => x.keyword === keyword && x.lat === lat && x.lng === lng);
      return s ? rankIn(s.results) : null;
    }));
    const summary = (kw: string) => {
      const ranks = snaps.filter((s) => s.keyword === kw).map((s) => rankIn(s.results)).filter((r): r is number => r !== null);
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
  access: 'read',
  description: 'Share of the top-3 local-pack slots held by you, each tracked competitor and other businesses, per monthly rank scan.',
  input: z.object({ clientId: uuid, keyword: z.string().trim().min(1).max(100).optional(), scans: z.number().int().min(1).max(12).default(6) }),
  output: ShareOfVoiceView,
  permission: 'read',
  channels: ['web', 'mcp', 'ask'],
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

const GridSize = z.union([z.literal(5), z.literal(7)]);
const ScanState = z.enum(['available', 'weekly_limit', 'agency_daily_limit', 'cap', 'running', 'not_ready']);

/** The client in the caller's agency and scope, or the same `not_found` for unknown, other-agency and out-of-scope ids. */
async function agencyClient(deps: ToolDeps, ctx: { agencyId: string; clientScope: 'all' | readonly string[] } & Parameters<typeof canAccessClient>[0], clientId: string) {
  if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
  const [c] = await deps.service.select().from(client).where(and(eq(client.id, clientId), eq(client.agencyId, ctx.agencyId)));
  if (!c) throw new ToolError('not_found', 'Client not found');
  return c;
}

export const getRankSettings = defineTool({
  name: 'get_rank_settings',
  access: 'read',
  description: "A client's local-rank settings (keywords, grid size, radius) and whether a manual scan can start now. Agency roles only.",
  input: z.object({ clientId: uuid }),
  output: z.object({
    keywords: z.array(z.string()), allKeywords: z.array(z.string()), gridSize: GridSize, radiusKm: z.number().nullable(),
    scan: z.object({ state: ScanState, nextAvailableAt: z.string().nullable(), label: z.string().nullable() }),
  }),
  permission: 'agency',
  async handler(ctx, { clientId }, deps) {
    const c = await agencyClient(deps, ctx, clientId);
    const a = await rankScanAvailability(deps.service, { id: c.id, agencyId: c.agencyId }, new Date());
    return {
      keywords: rankKeywordsFor(c), allKeywords: c.keywords, gridSize: (c.rankGridSize === 5 ? 5 : 7) as 5 | 7, radiusKm: c.serviceArea?.radiusKm ?? null,
      scan: { state: a.state, nextAvailableAt: a.nextAvailableAt ?? null, label: rankScanLabel(a, c) },
    };
  },
});

export const updateClientRankSettings = defineTool({
  name: 'update_client_rank_settings',
  access: 'write',
  description: "Set which of a client's keywords are rank-scanned, the grid size (5 or 7) and the scan radius (2-40 km).",
  input: z.object({
    clientId: uuid, keywords: z.array(z.string().trim().min(1).max(120)).min(1).max(5), gridSize: GridSize, radiusKm: z.number().min(2).max(40),
  }),
  output: z.object({ ok: z.literal(true) }),
  permission: 'agency',
  async handler(ctx, input, deps) {
    if (!canAccessClient(ctx, input.clientId)) throw new ToolError('not_found', 'Client not found');
    const keywords = [...new Set(input.keywords)];
    await withTenant(deps.app, ctx, async (tx) => {
      const [current] = await tx.select().from(client).where(eq(client.id, input.clientId)).for('update');
      if (!current) throw new ToolError('not_found', 'Client not found');
      if (!keywords.every((k) => current.keywords.includes(k))) throw new ToolError('invalid_input', "Pick keywords from the client's keyword list.");
      if (!current.serviceArea) throw new ToolError('invalid_input', 'Set a service area on the Profile page first.');
      await tx.update(client).set({ rankKeywords: keywords, rankGridSize: input.gridSize, serviceArea: { ...current.serviceArea, radiusKm: input.radiusKm } }).where(eq(client.id, input.clientId));
    });
    await enqueueMapRefresh(deps, input.clientId);
    return { ok: true as const };
  },
});

export const requestRankScanTool = defineTool({
  name: 'request_rank_scan',
  access: 'write',
  description: 'Start a manual local-rank scan ("Scan now") for a client: one per client per 7 days, 10 per agency per day, within the monthly cost cap.',
  input: z.object({ clientId: uuid }),
  output: z.union([
    z.object({ queued: z.literal(true), scanEtaMinutes: z.number() }),
    z.object({ queued: z.literal(false), reason: z.enum(['weekly_limit', 'agency_daily_limit', 'cap', 'not_ready']), nextAvailableAt: z.string().optional() }),
  ]),
  permission: 'agency',
  async handler(ctx, { clientId }, deps) {
    const c = await agencyClient(deps, ctx, clientId);
    return requestRankScan(deps, ctx.userId, { id: c.id, agencyId: c.agencyId });
  },
});

export const rankingTools = [getGeogrid, getShareOfVoice, getRankSettings, updateClientRankSettings, requestRankScanTool];
