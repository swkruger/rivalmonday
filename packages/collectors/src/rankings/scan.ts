import {
  agencyServiceable, capture, clientWorkAllowed, client, clientCompetitor, competitor, type ClientAddress, type Db, observation, type RankResult,
  rankMapImage, rankScan, type RankScanTrigger, rankSnapshot, type ServiceArea, serpSnapshot,
} from '@cs/db';
import type { CallScope } from '@cs/core';
import type { ObjectStore } from '@cs/storage';
import type { VerticalPack } from '@cs/verticals';
import { and, eq, gt, inArray, lt, ne, or, sql } from 'drizzle-orm';
import { cityFromAddress, nameHit } from '../citations/match';
import { latestGbp } from '../citations/run';
import { recordVendorCapture } from '../evidence/vendor-capture';
import { gridPoints } from '../local/grid';
import { mapsSearch } from '../local/maps';
import { DFS_COLLECTOR_VERSION } from '../gbp/collect-gbp';
import { type DataForSeoClient, VendorError } from '../vendors/dataforseo';
import { checkRankScanBudget, estimateRankScanUsd } from './budget';
import { serpSearch } from './serp';
import { RANK_MAX_KEYWORDS, rankKeywordsFor, rankMapSettingsHash, rankRadiusKm } from './settings';

/** Capture `url` and observation kind of a stored venue events panel (18d): `listed_events` reads both. */
export const GBP_EVENTS_URL = 'gbp:events';
export const VENUE_PANEL_KIND = 'venue_panel';
/** A business whose panel was captured less than this many days ago is not searched again. */
export const PANEL_REUSE_DAYS = 6;

export interface RankScanSkipped { scanId: string; agencyId: string; clientId: string; clientName: string; estimatedUsd: number }

/** Postgres unique violation on the one-running-scan-per-client index (drizzle may wrap the driver error in `cause`). */
function isRunningUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err, i = 0; e && typeof e === 'object' && i < 4; e = (e as { cause?: unknown }).cause, i++) {
    const x = e as { code?: string; constraint_name?: string; constraint?: string };
    if (x.code === '23505' && (x.constraint_name ?? x.constraint) === 'rank_scan_running_unique') return true;
  }
  return false;
}

/**
 * Scans a client's keywords across a grid of map points and stores one tenant-scoped rank_snapshot per
 * keyword x point, grouped under one rank_scan (Phase 3b: rank deltas compare scan to scan). Each point's
 * raw Maps response is recorded as vendor evidence (`source: google_maps_rank`) and linked via
 * `capture_id`. The capture table requires a competitor, so it is filed under the client's self-business
 * (`client.self_competitor_id`); with none, or if recording fails (logged), captureId stays null and the
 * scan continues.
 *
 * After the grid, one live Google search per keyword (page one at the service-area centre, 18b-2) stores a
 * `serp_snapshot` and its evidence (`source: google_search`). A failed search is logged and skipped: it has no row and
 * never changes `failed` or the scan's status (those stay map-only). Prospect scans and scans whose grid stored nothing skip it.
 *
 * Bounds paid live DataForSEO calls: gridSize=7 x maxKeywords=5 is already 245 live searches (~$0.49)
 * per client per run.
 *
 * A VendorError on one point is logged and counted in `failed`, and the scan moves on (no snapshot is
 * stored for that point) — the job runs once (no pg-boss retry), so aborting would lose the rest of an
 * already-paid scan. Any other error (DB, bug) marks the scan failed and still throws. A scan that stored
 * no snapshot at all is marked failed too.
 */
export async function scanRankings(
  deps: { db: Db; store: ObjectStore; dfs: DataForSeoClient; packs?: (verticalId: string) => Promise<VerticalPack>; onSkipped?: (s: RankScanSkipped) => Promise<void> },
  clientId: string,
  opts: { trigger: RankScanTrigger; requestedBy?: string; scanId?: string; prospect?: { gridSize: number; maxKeywords: number; depth?: number } },
): Promise<{ snapshots: number; failed: number; scanId: string | null; skipped?: 'cap' }> {
  const none = { snapshots: 0, failed: 0, scanId: null };
  const [c] = await deps.db.select().from(client).where(eq(client.id, clientId)).limit(1);
  if (!c?.serviceArea || c.keywords.length === 0) {
    if (opts.scanId) await deps.db.update(rankScan).set({ status: 'failed', finishedAt: new Date() }).where(and(eq(rankScan.id, opts.scanId), eq(rankScan.clientId, clientId), eq(rankScan.status, 'running')));
    return none;
  }
  // A scan queued before the client was paused / spend-paused / archived spends no vendor money (7b1; the job has no Ai guard).
  if (c.pausedAt !== null || c.spendPausedAt !== null || c.archivedAt !== null) {
    if (opts.scanId) await deps.db.update(rankScan).set({ status: 'failed', finishedAt: new Date() }).where(and(eq(rankScan.id, opts.scanId), eq(rankScan.clientId, clientId), eq(rankScan.status, 'running')));
    return none;
  }
  const prospect = opts.prospect;
  const gridSize = Math.min(prospect?.gridSize ?? c.rankGridSize, 7);
  const keywords = prospect ? rankKeywordsFor(c).slice(0, Math.min(prospect.maxKeywords, RANK_MAX_KEYWORDS)) : rankKeywordsFor(c);
  const depth = Math.min(prospect?.depth ?? 20, 20);
  const radiusKm = rankRadiusKm(c.serviceArea.radiusKm);
  // 18d: venues packs add one panel search per business (self + tracked rivals) to the Sunday scan.
  const panelOn = !prospect && deps.packs ? (await deps.packs(c.verticalId)).events.panel : false;
  const panelBusinesses = panelOn ? await venueBusinesses(deps.db, c) : [];
  const estimatedUsd = estimateRankScanUsd({ ...c, rankKeywords: keywords, rankGridSize: gridSize }, { search: !prospect, panelBusinesses: panelBusinesses.length }).usd;
  const settings = { gridSize, radiusKm, keywords, estimatedUsd, trigger: prospect ? ('scheduled' as const) : opts.trigger, requestedBy: opts.requestedBy ?? null };

  let skip = false;
  if (!prospect) {
    const budget = await checkRankScanBudget(deps.db, clientId, estimatedUsd);
    if (!budget.ok) skip = true;
  }

  // Adopt the pre-created manual row (a stale sweep may have failed one still waiting in the queue: re-claimed once),
  // or insert a fresh one. A concurrent running scan trips rank_scan_running_unique.
  const adoptable = opts.scanId
    ? and(
        eq(rankScan.id, opts.scanId), eq(rankScan.clientId, clientId), eq(rankScan.trigger, 'manual'),
        or(eq(rankScan.status, 'running'), and(eq(rankScan.status, 'failed'), sql`NOT EXISTS (SELECT 1 FROM rank_snapshot rs WHERE rs.scan_id = ${rankScan.id})`)),
      )
    : undefined;
  const { trigger, requestedBy, ...snapshot } = settings;
  const values = { ...snapshot, status: skip ? ('skipped' as const) : ('running' as const), finishedAt: skip ? new Date() : null };
  let scanId: string;
  try {
    if (adoptable) {
      const [row] = await deps.db.update(rankScan).set({ ...values, ...(skip ? {} : { startedAt: new Date() }) }).where(adoptable).returning({ id: rankScan.id });
      if (!row) {
        console.warn(`[rank-scan] ${clientId}: manual scan ${opts.scanId} is not claimable, skipped`);
        return none;
      }
      scanId = row.id;
    } else {
      const [row] = await deps.db.insert(rankScan).values({ agencyId: c.agencyId, clientId: c.id, trigger, requestedBy, ...values }).returning({ id: rankScan.id });
      scanId = row!.id;
    }
  } catch (err) {
    if (!isRunningUniqueViolation(err)) throw err;
    console.warn(`[rank-scan] ${clientId}: another scan is already running, skipped`);
    return none;
  }
  if (skip) {
    try {
      await deps.onSkipped?.({ scanId, agencyId: c.agencyId, clientId: c.id, clientName: c.name, estimatedUsd });
    } catch (err) {
      console.warn(`[rank-scan] ${clientId}: skip notice failed (${err instanceof Error ? err.message : String(err)})`);
    }
    return { snapshots: 0, failed: 0, scanId, skipped: 'cap' };
  }
  const points = gridPoints(c.serviceArea.center, radiusKm, gridSize);
  const scope = { agencyId: c.agencyId, clientId: c.id };
  let snapshots = 0;
  let failed = 0;
  try {
    for (const keyword of keywords) {
      for (const pt of points) {
        let places: Awaited<ReturnType<typeof mapsSearch>>['places'];
        let raw: unknown[];
        try {
          ({ places, raw } = await mapsSearch(deps.dfs, { keyword, lat: pt.lat, lng: pt.lng, depth }, scope));
        } catch (err) {
          if (!(err instanceof VendorError)) throw err;
          failed++;
          console.warn(`[rank-scan] ${clientId} "${keyword}" @ ${pt.lat},${pt.lng}: ${err.message} (code ${err.code ?? 'n/a'}) — point skipped`);
          continue;
        }
        const results: RankResult[] = places.map((p) => ({ rank: p.rank, placeId: p.placeId, cid: p.cid, domain: p.domain, title: p.title }));
        let captureId: string | null = null;
        if (c.selfCompetitorId) {
          try {
            ({ captureId } = await recordVendorCapture(deps, {
              competitorId: c.selfCompetitorId, source: 'google_maps_rank', collectorVersion: DFS_COLLECTOR_VERSION, status: 'ok', payload: raw,
            }));
          } catch (err) {
            console.warn(`[rank-scan] ${clientId} "${keyword}" @ ${pt.lat},${pt.lng}: evidence capture failed (${err instanceof Error ? err.message : String(err)}) — snapshot stored without capture`);
          }
        }
        await deps.db.insert(rankSnapshot).values({ agencyId: c.agencyId, clientId: c.id, scanId, keyword, lat: pt.lat, lng: pt.lng, captureId, results });
        snapshots++;
      }
    }
    // A scan whose grid stored nothing is failed anyway: don't pay for searches. Prospect scans never search.
    if (!prospect && snapshots > 0) await searchKeywords(deps, c, scanId, keywords, { ...c.serviceArea.center, radiusKm }, scope);
    if (!prospect && snapshots > 0 && panelBusinesses.length > 0) await searchVenuePanels(deps, { ...c, serviceArea: c.serviceArea }, panelBusinesses, scope);
  } catch (err) {
    await deps.db.update(rankScan).set({ status: 'failed', snapshots, failed, finishedAt: new Date() }).where(eq(rankScan.id, scanId));
    throw err;
  }
  // A scan that stored nothing (every point failed) is not a done scan: rank diff would treat it as one.
  await deps.db.update(rankScan).set({ status: snapshots > 0 ? 'done' : 'failed', snapshots, failed, finishedAt: new Date() }).where(eq(rankScan.id, scanId));
  return { snapshots, failed, scanId };
}

/**
 * One live Google search per keyword at the service-area centre (18b-2, spec E2). A search problem never fails the map
 * scan: any error on a keyword (vendor, evidence, insert) is logged with the keyword and that keyword has no
 * `serp_snapshot` row. An empty organic result (no results / zero organic items) counts as a failed search too.
 */
async function searchKeywords(
  deps: { db: Db; store: ObjectStore; dfs: DataForSeoClient },
  c: { id: string; agencyId: string; selfCompetitorId: string | null },
  scanId: string,
  keywords: string[],
  at: { lat: number; lng: number; radiusKm: number },
  scope: { agencyId: string; clientId: string },
): Promise<void> {
  for (const keyword of keywords) {
    try {
      const result = await serpSearch(deps.dfs, { keyword, lat: at.lat, lng: at.lng, radiusM: at.radiusKm * 1000 }, scope);
      if (result.organic.length === 0) {
        console.warn(`[rank-scan] ${c.id} "${keyword}": Google search returned no organic results — keyword skipped`);
        continue;
      }
      let captureId: string | null = null;
      if (c.selfCompetitorId) {
        try {
          ({ captureId } = await recordVendorCapture(deps, {
            competitorId: c.selfCompetitorId, source: 'google_search', collectorVersion: DFS_COLLECTOR_VERSION, status: 'ok', payload: result.raw,
          }));
        } catch (err) {
          console.warn(`[rank-scan] ${c.id} "${keyword}": search evidence capture failed (${errText(err)}) — snapshot stored without capture`);
        }
      }
      await deps.db.insert(serpSnapshot).values({
        agencyId: c.agencyId, clientId: c.id, scanId, keyword, captureId, capturedAt: new Date(), organic: result.organic, localServices: result.localServices,
      }).onConflictDoNothing();
    } catch (err) {
      const code = err instanceof VendorError ? ` (code ${err.code ?? 'n/a'})` : '';
      console.warn(`[rank-scan] ${c.id} "${keyword}": Google search failed: ${errText(err)}${code} — keyword skipped`);
    }
  }
}

const DAY_MS = 86_400_000;

/** Self business plus tracked rivals with the city to search each in: self = client address, else its Google address; rival = its Google address, else the client's city (18c P5). */
async function venueBusinesses(
  db: Db,
  c: { id: string; selfCompetitorId: string | null; address: ClientAddress | null },
): Promise<{ competitorId: string; name: string; city: string | null }[]> {
  const rivals = await db
    .select({ id: competitor.id, name: competitor.name })
    .from(clientCompetitor)
    .innerJoin(competitor, eq(competitor.id, clientCompetitor.competitorId))
    .where(and(eq(clientCompetitor.clientId, c.id), c.selfCompetitorId ? ne(clientCompetitor.competitorId, c.selfCompetitorId) : undefined))
    .orderBy(competitor.id);
  const ids = [...(c.selfCompetitorId ? [c.selfCompetitorId] : []), ...rivals.map((r) => r.id)];
  if (ids.length === 0) return [];
  const names = new Map(rivals.map((r) => [r.id, r.name]));
  if (c.selfCompetitorId) {
    const [self] = await db.select({ name: competitor.name }).from(competitor).where(eq(competitor.id, c.selfCompetitorId));
    if (self) names.set(c.selfCompetitorId, self.name);
  }
  const clientCity = c.address?.city?.trim() || null;
  const out: { competitorId: string; name: string; city: string | null }[] = [];
  for (const id of ids) {
    const name = names.get(id);
    if (!name) continue;
    const gbpCity = cityFromAddress((await latestGbp(db, id)).address);
    out.push({ competitorId: id, name, city: id === c.selfCompetitorId ? (clientCity ?? gbpCity) : (gbpCity ?? clientCity) });
  }
  return out;
}

/**
 * One live Google search per business for its venue Events panel (18d D2). A panel is kept only when the knowledge panel
 * title names the business (P3); then a `gbp:events` capture and a `venue_panel` observation are stored. A fresh capture
 * (< PANEL_REUSE_DAYS) means no call. An error on one business is logged with its competitor id and never touches the scan.
 */
export async function searchVenuePanels(
  deps: { db: Db; store: ObjectStore; dfs: DataForSeoClient; now?: () => Date },
  c: { id: string; agencyId: string; timezone: string; serviceArea: ServiceArea; address: ClientAddress | null },
  businesses: { competitorId: string; name: string; city: string | null }[],
  scope: CallScope,
): Promise<{ searched: number; reused: number; stored: number }> {
  const now = (deps.now ?? (() => new Date()))();
  const since = new Date(now.getTime() - PANEL_REUSE_DAYS * DAY_MS);
  const tally = { searched: 0, reused: 0, stored: 0 };
  for (const b of businesses) {
    try {
      const [fresh] = await deps.db.select({ id: capture.id }).from(capture).where(and(
        eq(capture.competitorId, b.competitorId), eq(capture.url, GBP_EVENTS_URL), eq(capture.status, 'ok'), gt(capture.capturedAt, since),
      )).limit(1);
      if (fresh) { tally.reused++; continue; }
      tally.searched++;
      const keyword = [b.name.replace(/"/g, ''), b.city].filter(Boolean).join(' ');
      const { lat, lng, radiusKm } = { ...c.serviceArea.center, radiusKm: rankRadiusKm(c.serviceArea.radiusKm) };
      const result = await serpSearch(deps.dfs, { keyword, lat, lng, radiusM: radiusKm * 1000, tag: VENUE_PANEL_KIND }, scope);
      const k = result.knowledge;
      if (!k || !nameHit(k.title, b.name, b.city)) continue;
      const { captureId, capturedAt } = await recordVendorCapture(
        { ...deps, now: () => now },
        { competitorId: b.competitorId, source: 'google_business_profile', collectorVersion: DFS_COLLECTOR_VERSION, url: GBP_EVENTS_URL, status: 'ok', payload: result.raw },
      );
      await deps.db.insert(observation).values({
        competitorId: b.competitorId, captureId, kind: VENUE_PANEL_KIND, key: 'events', observedAt: capturedAt,
        data: { timeZone: c.timezone, title: k.title, events: k.events },
      }).onConflictDoNothing({ target: [observation.captureId, observation.kind, observation.key] });
      tally.stored++;
    } catch (err) {
      console.warn(`[rank-scan] ${c.id} venue panel for competitor ${b.competitorId} failed: ${errText(err)} � skipped`);
    }
  }
  return tally;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Clients due a weekly rank scan: active (5b-2 decision 9), with a service area and at least one keyword. */
export async function listRankClients(db: Db): Promise<string[]> {
  const rows = await db
    .select({ id: client.id })
    .from(client)
    .where(sql`${client.serviceArea} IS NOT NULL AND jsonb_array_length(${client.keywords}) > 0 AND ${clientWorkAllowed(client)} AND ${agencyServiceable(client.agencyId)}`);
  return rows.map((r) => r.id);
}

/** A `running` rank scan older than this is presumed dead (the job's own expiry is 3 h): the weekly sweep fails it. */
export const RANK_SCAN_STALE_HOURS = 3;

/** Marks `running` scans older than RANK_SCAN_STALE_HOURS as failed (frees rank_scan_running_unique); returns how many. */
export async function failStaleRankScans(db: Db, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RANK_SCAN_STALE_HOURS * 3_600_000);
  const rows = await db
    .update(rankScan)
    .set({ status: 'failed', finishedAt: now })
    .where(and(eq(rankScan.status, 'running'), lt(rankScan.startedAt, cutoff)))
    .returning({ id: rankScan.id });
  return rows.length;
}

/**
 * Of `clientIds`, those whose map needs a refresh: no `rank_map_image` row yet, or a row whose settings hash no longer
 * matches the client's grid settings and map style (the weekly schedule enqueues one map refresh for each). A row for
 * a client without a service area is left alone (the refresh would skip it).
 */
export async function clientsNeedingRankMap(db: Db, clientIds: string[]): Promise<string[]> {
  if (clientIds.length === 0) return [];
  const rows = await db
    .select({ id: client.id, serviceArea: client.serviceArea, gridSize: client.rankGridSize, hash: rankMapImage.settingsHash })
    .from(client)
    .leftJoin(rankMapImage, eq(rankMapImage.clientId, client.id))
    .where(inArray(client.id, clientIds));
  const need = new Set(rows.filter((r) => {
    if (r.hash === null) return true;
    if (!r.serviceArea) return false;
    return r.hash !== rankMapSettingsHash({ center: r.serviceArea.center, radiusKm: rankRadiusKm(r.serviceArea.radiusKm), gridSize: r.gridSize });
  }).map((r) => r.id));
  return clientIds.filter((id) => need.has(id));
}
