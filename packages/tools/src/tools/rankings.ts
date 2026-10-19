import { rankKeywordsFor, STADIA_ATTRIBUTION } from '@cs/collectors';
import { canAccessClient, insideBounds, toolkit, ToolError } from '@cs/core';
import { client, competitorSignal, evidence, type RankResult, rankMapImage, rankScan, rankSnapshot, type Tier, type Tx, withTenant } from '@cs/db';
import { competitorMatcher, NOT_FOUND_RANK, rankMetrics, rankSettingsKey } from '@cs/engine';
import { and, desc, eq, inArray, isNotNull, lt } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { enqueueMapRefresh, rankScanAvailability, rankScanLabel, requestRankScan } from '../rank-scan';
import { pickBusiness, workspaceBusinesses } from '../workspace/business';
import { workspaceClient } from '../workspace/scope';
import { BusinessKey, GeoGridView, RankTrendView, ShareOfVoiceView } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const r1 = (x: number) => Math.round(x * 10) / 10;
const byWord = (a: string, b: string) => a.localeCompare(b, 'en');

type ScanRow = { id: string; finishedAt: Date | null; gridSize: number | null; radiusKm: number | null; keywords: string[] | null };
const isDone = (clientId: string) => and(eq(rankScan.clientId, clientId), eq(rankScan.status, 'done'), isNotNull(rankScan.finishedAt));
const scanCols = { id: rankScan.id, finishedAt: rankScan.finishedAt, gridSize: rankScan.gridSize, radiusKm: rankScan.radiusKm, keywords: rankScan.keywords };

/** The client's finished scans, newest first. Takes a tenant transaction: `rank_scan` is only ever read through `withTenant`. */
export async function doneScans(tx: Tx, clientId: string, limit: number, before?: Date): Promise<ScanRow[]> {
  return tx.select(scanCols).from(rankScan)
    .where(before ? and(isDone(clientId), lt(rankScan.finishedAt, before)) : isDone(clientId)).orderBy(desc(rankScan.finishedAt)).limit(limit);
}

/** One finished scan of the client by id, or `undefined`. Same tenant-transaction rule as `doneScans`. */
export async function doneScan(tx: Tx, clientId: string, id: string): Promise<ScanRow | undefined> {
  const [row] = await tx.select(scanCols).from(rankScan)
    .where(and(eq(rankScan.id, id), isDone(clientId)));
  return row;
}

export const getGeogrid = defineTool({
  name: 'get_geogrid',
  access: 'read',
  description: 'Local-pack rank of one business (you or a tracked competitor) at every point of a rank-scan grid for one keyword, plus per-keyword summaries. '
    + "Each summary's evidenceIds are the evidence to cite for it (the scan id is not evidence).",
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
      scan: null, scans: [], keywords: [], keyword: null, size: 0, cells: [], top3: 0, points: 0, avgRank: null, keywordSummaries: [], radiusKm: c.radiusKm, lats: [] as number[], lngs: [] as number[], map: null as GeoGridView['map'],
      businesses: list.map((b) => ({ key: b.key, name: b.name, self: b.self })), business: business?.key ?? null,
    };
    if (c.keywords.length === 0 || c.radiusKm === null) return { ...base, setup: 'no_keywords' as const };

    // Tenant tables: only ever through withTenant (Review Focus 1).
    const { scans, scan, snaps, image } = await withTenant(deps.app, ctx, async (tx) => {
      const recent = await doneScans(tx, c.id, 12);
      let chosen: ScanRow | undefined = recent[0];
      if (input.scanId) {
        chosen = await doneScan(tx, c.id, input.scanId);
        if (!chosen) throw new ToolError('not_found', 'Scan not found');
      }
      const rows = chosen
        ? await tx.select({ keyword: rankSnapshot.keyword, lat: rankSnapshot.lat, lng: rankSnapshot.lng, results: rankSnapshot.results, captureId: rankSnapshot.captureId }).from(rankSnapshot).where(eq(rankSnapshot.scanId, chosen.id))
        : [];
      // An older scan opened by id is merged into the list so the picker can show it.
      const scans = chosen && !recent.some((s) => s.id === chosen!.id)
        ? [...recent, chosen].sort((a, b) => b.finishedAt!.getTime() - a.finishedAt!.getTime())
        : recent;
      const [image] = chosen
        ? await tx.select({ settingsHash: rankMapImage.settingsHash, bounds: rankMapImage.bounds, width: rankMapImage.width, height: rankMapImage.height })
          .from(rankMapImage).where(eq(rankMapImage.clientId, c.id))
        : [];
      return { scans, scan: chosen ?? null, snaps: rows, image };
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
    // One citable evidence row per keyword: the centre point's capture (the client's own business), else any captured point.
    const midLat = lats[Math.floor(lats.length / 2)];
    const midLng = lngs[Math.floor(lngs.length / 2)];
    const captureFor = (kw: string): string | null => {
      const own = snaps.filter((s) => s.keyword === kw && s.captureId !== null);
      return (own.find((s) => s.lat === midLat && s.lng === midLng) ?? own[0])?.captureId ?? null;
    };
    const captureIds = [...new Set(keywords.map(captureFor).filter((x): x is string => x !== null))];
    // The snapshot (and so its capture id) was read through RLS above; `evidence` is a global table.
    const evRows = captureIds.length
      ? await deps.service.select({ id: evidence.id, captureId: evidence.captureId }).from(evidence).where(inArray(evidence.captureId, captureIds))
      : [];
    const summary = (kw: string) => {
      const ranks = snaps.filter((s) => s.keyword === kw).map((s) => rankIn(s.results)).filter((r): r is number => r !== null);
      const cap = captureFor(kw);
      const evidenceIds = cap ? evRows.filter((e) => e.captureId === cap).map((e) => e.id).slice(0, 1) : [];
      return { keyword: kw, top3: ranks.filter((r) => r <= 3).length, points: ranks.length, avgRank: ranks.length ? r1(ranks.reduce((a, b) => a + b, 0) / ranks.length) : null, evidenceIds };
    };
    const current = keyword ? summary(keyword) : { top3: 0, points: 0, avgRank: null };
    // The map shows only when it covers every point of this scan (the grid may have grown since the image was made).
    const map = image && snaps.every((s) => insideBounds({ lat: s.lat, lng: s.lng }, image.bounds))
      ? { url: `/files/rank-map/${c.id}?v=${image.settingsHash.slice(0, 12)}`, bounds: image.bounds, width: image.width, height: image.height, attribution: STADIA_ATTRIBUTION }
      : null;
    return {
      ...base, lats, lngs, map, setup: 'ready' as const, scan: { id: scan.id, finishedAt: scan.finishedAt!.toISOString() }, scans: scanList, keywords, keyword,
      size: Math.max(lats.length, lngs.length), cells, top3: current.top3, points: current.points, avgRank: current.avgRank, keywordSummaries: keywords.map(summary),
    };
  },
});

export const getRankTrend = defineTool({
  name: 'get_rank_trend',
  access: 'read',
  description: 'Weekly local-rank history for one keyword, newest first: for each completed weekly scan, your and every tracked competitor\'s average map position across the grid '
    + '(avgRank, 1 best; 21 = not in the top 20) and top3Share (share of grid points where the business is in the top 3), plus the competitor tier. '
    + 'settingsChanged marks a scan whose grid size, radius or keywords differ from the previous scan, so compare across it with care. Page back with nextCursor (pass it as before).',
  input: z.object({ clientId: uuid, keyword: z.string().trim().min(1).max(100), limit: z.number().int().min(1).max(26).default(12), before: uuid.optional() }),
  output: RankTrendView,
  permission: 'read',
  channels: ['web', 'mcp', 'ask'],
  feature: 'dashboard',
  async handler(ctx, input, deps) {
    const c = await workspaceClient(deps, ctx, input.clientId);
    const businesses = await workspaceBusinesses(deps, ctx, c);
    const { page, older, snaps, tiers } = await withTenant(deps.app, ctx, async (tx) => {
      let beforeAt: Date | undefined;
      if (input.before) {
        const cursor = await doneScan(tx, c.id, input.before);
        if (!cursor) throw new ToolError('not_found', 'Scan not found');
        beforeAt = cursor.finishedAt!;
      }
      // One extra row: it tells whether another page exists and supplies the settings to compare the last scan with.
      const rows = await doneScans(tx, c.id, input.limit + 1, beforeAt);
      const shown = rows.slice(0, input.limit);
      const [snapRows, tierRows] = await Promise.all([
        shown.length
          ? tx.select({ scanId: rankSnapshot.scanId, results: rankSnapshot.results }).from(rankSnapshot)
            .where(and(inArray(rankSnapshot.scanId, shown.map((s) => s.id)), eq(rankSnapshot.keyword, input.keyword)))
          : [],
        tx.select({ competitorId: competitorSignal.competitorId, tier: competitorSignal.tier }).from(competitorSignal).where(eq(competitorSignal.clientId, c.id)),
      ]);
      return { page: shown, older: rows[input.limit], snaps: snapRows, tiers: new Map<string, Tier>(tierRows.map((t) => [t.competitorId, t.tier])) };
    });
    const self = businesses.find((b) => b.self);
    const rivals = businesses.filter((b) => !b.self).sort((a, b) => byWord(a.name, b.name));
    const scans = page.map((scan, i) => {
      const key = rankSettingsKey(scan);
      const prev = page[i + 1] ?? older;
      const results = snaps.filter((s) => s.scanId === scan.id).map((s) => s.results);
      const metrics = (b: { placeId: string | null; cid: string | null; domain: string | null }) => rankMetrics(results, competitorMatcher(b));
      // A scan with no snapshots for this keyword has no data, which is not the same as "not in the top 20".
      const hasData = results.length > 0;
      return {
        scanId: scan.id, finishedAt: scan.finishedAt!.toISOString(), settingsKey: key,
        settingsChanged: prev ? rankSettingsKey(prev) !== key : false,
        self: self && hasData ? metrics(self) : null,
        competitors: hasData
          ? rivals.map((b) => ({ competitorId: b.competitorId!, name: b.name, tier: tiers.get(b.competitorId!) ?? null, ...pick(metrics(b)) }))
          : [],
      };
    });
    return { scans, nextCursor: older ? page[page.length - 1]!.id : null };
  },
});
const pick = (m: { avgRank: number; top3Share: number }) => ({ avgRank: m.avgRank, top3Share: m.top3Share });

/** Not `other` — that key is `foldSeries`'s folded remainder. */
export const OTHER_BUSINESSES = 'other_businesses';
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export const getShareOfVoice = defineTool({
  name: 'get_share_of_voice',
  access: 'read',
  description: 'Share of the top-3 local-pack slots held by you, each tracked competitor and other businesses, per weekly rank scan.',
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
      if (!current.serviceArea) throw new ToolError('invalid_input', 'Set a service area on the Business profile page first.');
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

export const rankingTools = [getGeogrid, getRankTrend, getShareOfVoice, getRankSettings, updateClientRankSettings, requestRankScanTool];
