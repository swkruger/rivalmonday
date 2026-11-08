import type { Ai } from '@cs/ai';
import { MAX_ACTIVE_PAGES, type PageType } from '@cs/core';
import { capture, type Db, siteDiscovery, siteUrl, trackedPage } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { recordWebCapture } from '../evidence/recorder';
import type { HostRateLimiter } from '../web/rate-limit';
import type { Renderer, RenderStatus } from '../web/renderer';
import type { RobotsPolicy } from '../web/robots';
import { type FetchText, siteHost } from '../web/user-agent';
import { classifyPage } from './classify';
import { pageKey } from './page-key';
import { type CandidatePage, cadenceFor, pageTypeRank, selectPages } from './select';
import { collectSitemapUrls } from './sitemap';
import { guessPageType, normalizeUrl } from './urls';

export interface DiscoveryDeps {
  db: Db;
  store: ObjectStore;
  renderer: Renderer;
  robots: RobotsPolicy;
  fetchText: FetchText;
  /** Crawler conduct (spec §4.2) applies to sitemap fetches too: ≥3s/host, honouring robots and crawl-delay. */
  limiter: HostRateLimiter;
  ai: Ai;
}

/**
 * Wraps `fetchText` so sitemap fetches obey the same crawler conduct as page renders: same site only
 * (www-insensitive), robots-checked, and rate-limited per host. Cross-host or disallowed URLs are
 * rejected (never reach the real `fetchText`); `collectSitemapUrls` treats that as a tolerable failure
 * for that one file and moves on. Also re-checks where a redirect actually landed (Phase 3d decision 18):
 * a sitemap that redirects off-site or into a disallowed path is rejected just like a direct cross-host/disallowed URL.
 */
function politeSitemapFetch(deps: DiscoveryDeps, homeHost: string): FetchText {
  return async (url) => {
    if (siteHost(url) !== homeHost) throw new Error(`cross-host sitemap url rejected: ${url}`);
    const verdict = await deps.robots.check(url);
    if (!verdict.allowed) throw new Error(`robots disallowed sitemap url: ${url}`);
    await deps.limiter.wait(url, verdict.crawlDelaySeconds);
    const res = await deps.fetchText(url);
    if (res.finalUrl && res.finalUrl !== url) {
      if (siteHost(res.finalUrl) !== homeHost) throw new Error(`sitemap ${url} redirected off-site to ${res.finalUrl}`);
      if (!(await deps.robots.check(res.finalUrl)).allowed) throw new Error(`sitemap ${url} redirected to a robots-disallowed url: ${res.finalUrl}`);
    }
    return res;
  };
}

/** Page types re-discovery starts tracking when they newly appear (spec D6); other new pages are only remembered. */
export const EVENT_PAGE_TYPES: ReadonlySet<PageType> = new Set<PageType>(['service', 'service_area', 'pricing', 'promo']);
/** At most this many new URLs are classified per re-discovery run (nav first); the rest wait for the next run. */
export const REDISCOVERY_MAX_CLASSIFY = 20;
/** A competitor's site is re-discovered every this many days (`site_discovery.next_due_at`). */
export const REDISCOVERY_DAYS = 28;

export interface DiscoveryResult {
  /** `initial` = no active tracked page other than `home` (full selection, baseline only); else `refresh`. */
  mode: 'initial' | 'refresh';
  /** Pages this run tracked: the selection (initial) or new + re-activated pages (refresh). */
  selected: number;
  /** Distinct candidate pages (by `pageKey`) seen this run. */
  candidates: number;
  /** Newly appeared pages tracked with `appeared_at` (refresh only). */
  newPages: number;
  /** Pages set inactive this run (`gone`, `duplicate`, `replaced`). */
  deactivated: number;
  /** The sitemap read was incomplete (see `collectSitemapUrls`). */
  truncated: boolean;
  homepageStatus: RenderStatus;
}

type Source = 'sitemap' | 'nav';
interface Candidate {
  key: string;
  url: string;
  text?: string;
  source: Source;
}
interface TrackedRow {
  id: string;
  key: string | null;
  url: string;
  pageType: string;
  source: string;
  pinned: boolean;
  active: boolean;
  inactiveReason: string | null;
  lastCapturedAt: Date | null;
  createdAt: Date;
}
interface PageWrite {
  url: string;
  pageType: string;
  source: string;
  cadence: string;
  appeared?: boolean;
}

/**
 * Finds a competitor's pages and keeps its tracked pages in step with the site (spec D6). One function, two modes:
 * *initial* selects up to `MAX_ACTIVE_PAGES` pages and records every candidate in `site_url` as a baseline; *refresh*
 * classifies only URLs new to `site_url` (at most `REDISCOVERY_MAX_CLASSIFY`) and tracks new service, service-area,
 * pricing and promo pages with `appeared_at`. Both modes collapse duplicate rows by `pageKey` and mark 404/410 pages
 * that left a complete run `gone`. Pages are never deactivated for merely not being selected, and a `manual`,
 * `duplicate` or `replaced` row is never re-activated here.
 */
export async function discoverPages(
  deps: DiscoveryDeps,
  competitor: { id: string; domain: string; name: string },
  opts: { max?: number; maxCandidates?: number } = {},
): Promise<DiscoveryResult> {
  const homeUrl = `https://${competitor.domain}/`;
  const home = await deps.renderer.render(homeUrl);
  try {
    const tracked = await loadTracked(deps.db, competitor.id);
    const mode: DiscoveryResult['mode'] = tracked.some((r) => r.active && r.pageType !== 'home') ? 'refresh' : 'initial';

    if (home.status !== 'ok') {
      // 2a carry-over: make "site blocks monitoring" visible — a home tracked page (never touching an existing row)
      // with a capture of the failed status. Weekly, so a blocked site is not retried every day.
      await deps.db
        .insert(trackedPage)
        .values({ competitorId: competitor.id, url: homeUrl, pageType: 'home', source: 'nav', cadence: 'weekly' })
        .onConflictDoNothing();
      const [tp] = await deps.db
        .select({ id: trackedPage.id })
        .from(trackedPage)
        .where(and(eq(trackedPage.competitorId, competitor.id), eq(trackedPage.url, homeUrl)))
        .limit(1);
      if (tp) await recordWebCapture({ db: deps.db, store: deps.store }, { trackedPage: { id: tp.id, competitorId: competitor.id, url: homeUrl }, page: home });
      await recordRun(deps.db, competitor.id, { homepageStatus: home.status });
      return { mode, selected: 0, candidates: 0, newPages: 0, deactivated: 0, truncated: false, homepageStatus: home.status };
    }

    const max = opts.max ?? MAX_ACTIVE_PAGES;
    // Candidates by page key; the stored URL is the first one seen, upgraded to an https twin when one turns up.
    const candidates = new Map<string, Candidate>();
    const add = (url: string, source: Source, text?: string) => {
      const key = pageKey(url);
      if (!key) return;
      const seen = candidates.get(key);
      if (!seen) candidates.set(key, { key, url, text, source });
      else if (seen.url.startsWith('http:') && url.startsWith('https:')) seen.url = url;
    };
    add(normalizeUrl(home.finalUrl, competitor.domain) ?? homeUrl, 'nav', 'Home');
    for (const link of home.links) {
      const u = normalizeUrl(link.href, competitor.domain);
      if (u) add(u, 'nav', link.text);
    }
    const verdict = await deps.robots.check(homeUrl);
    const sitemapSeeds = verdict.sitemaps.length > 0 ? verdict.sitemaps : [`https://${competitor.domain}/sitemap.xml`];
    const sitemap = await collectSitemapUrls(politeSitemapFetch(deps, siteHost(homeUrl)), sitemapSeeds);
    for (const raw of sitemap.urls) {
      const u = normalizeUrl(raw, competitor.domain);
      if (u) add(u, 'sitemap');
    }
    const truncated = sitemap.truncated;

    const byKey = new Map<string, TrackedRow[]>();
    for (const r of tracked) if (r.key) byKey.set(r.key, [...(byKey.get(r.key) ?? []), r]);
    let deactivated = 0;

    // Duplicates by page key: keep pinned, else most recently captured, else oldest.
    for (const rows of byKey.values()) {
      const live = rows.filter((r) => r.active);
      if (live.length > 1) deactivated += await deactivate(deps.db, live.sort(keepFirst).slice(1), 'duplicate');
    }

    // Gone: a non-pinned sitemap/nav page absent from a complete run whose latest capture was 404/410.
    if (!truncated) {
      const missing = tracked.filter((r) => r.active && !r.pinned && (r.source === 'nav' || r.source === 'sitemap') && !(r.key && candidates.has(r.key)));
      if (missing.length > 0) {
        const latest = await deps.db
          .selectDistinctOn([capture.trackedPageId], { id: capture.trackedPageId, httpStatus: capture.httpStatus })
          .from(capture)
          .where(inArray(capture.trackedPageId, missing.map((r) => r.id)))
          .orderBy(capture.trackedPageId, desc(capture.capturedAt));
        const goneIds = new Set(latest.filter((l) => l.httpStatus === 404 || l.httpStatus === 410).map((l) => l.id));
        deactivated += await deactivate(deps.db, missing.filter((r) => goneIds.has(r.id)), 'gone');
      }
    }

    const classify = async (c: Candidate): Promise<PageType> => {
      try {
        return (await classifyPage(deps.ai, { url: c.url, text: c.text, businessNames: [competitor.name, competitor.domain] })).pageType;
      } catch {
        // A single candidate's classifier failure must not abort discovery for the rest.
        return guessPageType(c.url, c.text) ?? 'other';
      }
    };
    // A key whose rows are all inactive for a reason other than `gone` (manual, duplicate, replaced) stays off.
    const blocked = (key: string) => {
      const rows = byKey.get(key);
      return !!rows && !rows.some((r) => r.active || r.inactiveReason === 'gone');
    };
    /** The existing row a candidate maps to (active first, else a `gone` one), so writes hit it instead of a twin URL. */
    const existingUrl = (key: string) => {
      const rows = byKey.get(key) ?? [];
      return (rows.find((r) => r.active) ?? rows.find((r) => r.inactiveReason === 'gone'))?.url;
    };

    let selected = 0;
    let newPages = 0;
    const unrecorded = new Set<string>();

    if (mode === 'initial') {
      // Prefilter: nav links and keyword-matching URLs first, so classification cost stays bounded.
      const ranked = [...candidates.values()]
        .filter((c) => !blocked(c.key))
        .sort((a, b) => score(b) - score(a))
        .slice(0, opts.maxCandidates ?? 60);
      const classified: CandidatePage[] = [];
      for (const c of ranked) classified.push({ url: c.url, pageType: await classify(c), source: c.source });
      const picks = selectPages(classified, max);
      await upsertPages(
        deps.db,
        competitor.id,
        picks.map((p) => ({ url: existingUrl(pageKey(p.url) ?? '') ?? p.url, pageType: p.pageType, source: p.source, cadence: p.cadence })),
      );
      selected = picks.length;
    } else {
      let active = tracked.filter((r) => r.active).length;

      // A `gone` page that is back re-activates (room permitting).
      const back: string[] = [];
      for (const c of candidates.values()) {
        const rows = byKey.get(c.key);
        if (!rows || rows.some((r) => r.active)) continue;
        const gone = rows.find((r) => r.inactiveReason === 'gone');
        if (!gone) continue;
        if (active >= max) {
          console.warn(`[discovery] ${competitor.id}: no room to re-activate ${gone.url}`);
          continue;
        }
        back.push(gone.id);
        active++;
      }
      selected += await reactivate(deps.db, back);

      const [prev] = await deps.db.select({ truncated: siteDiscovery.truncated }).from(siteDiscovery).where(eq(siteDiscovery.competitorId, competitor.id));
      const known = new Set(
        (await deps.db.select({ key: siteUrl.urlKey }).from(siteUrl).where(eq(siteUrl.competitorId, competitor.id))).map((r) => r.key),
      );
      // New = never seen before on a competitor we already have a baseline for, not tracked in any state, and from nav —
      // or from the sitemap only when neither this nor the previous sitemap read was truncated.
      const sitemapTrusted = !truncated && !prev?.truncated;
      const fresh =
        known.size === 0
          ? []
          : [...candidates.values()]
              .filter((c) => !known.has(c.key) && !byKey.has(c.key) && (c.source === 'nav' || sitemapTrusted))
              .sort((a, b) => (a.source === b.source ? 0 : a.source === 'nav' ? -1 : 1));
      // Over the cap: left out of site_url too, so the next run still sees them as new.
      for (const c of fresh.slice(REDISCOVERY_MAX_CLASSIFY)) unrecorded.add(c.key);

      const toTrack: (Candidate & { pageType: PageType })[] = [];
      for (const c of fresh.slice(0, REDISCOVERY_MAX_CLASSIFY)) {
        const pageType = await classify(c);
        if (EVENT_PAGE_TYPES.has(pageType)) toTrack.push({ ...c, pageType });
      }
      toTrack.sort((a, b) => pageTypeRank(a.pageType) - pageTypeRank(b.pageType));
      for (const p of toTrack) {
        if (active >= max) {
          // Full: replace the lowest-priority non-pinned, non-manual page of a lower-priority type, else skip.
          const victim = tracked
            .filter((r) => r.active && !r.pinned && r.source !== 'manual' && pageTypeRank(r.pageType) > pageTypeRank(p.pageType))
            .sort((a, b) => pageTypeRank(b.pageType) - pageTypeRank(a.pageType) || b.createdAt.getTime() - a.createdAt.getTime())[0];
          if (!victim) {
            console.warn(`[discovery] ${competitor.id}: ${max} pages tracked and none replaceable; new page ${p.url} skipped`);
            continue;
          }
          const n = await deactivate(deps.db, [victim], 'replaced');
          deactivated += n;
          active -= n;
          if (active >= max) continue;
        }
        const n = await upsertPages(deps.db, competitor.id, [{ url: p.url, pageType: p.pageType, source: p.source, cadence: cadenceFor(p.pageType), appeared: true }]);
        newPages += n;
        active += n;
      }
      selected += newPages;
    }

    await recordSiteUrls(deps.db, competitor.id, [...candidates.values()].filter((c) => !unrecorded.has(c.key)));
    await recordRun(deps.db, competitor.id, { homepageStatus: 'ok', urls: candidates.size, truncated });
    return { mode, selected, candidates: candidates.size, newPages, deactivated, truncated, homepageStatus: 'ok' };
  } finally {
    await home.close();
  }
}

function score(c: { url: string; text?: string; source: Source }): number {
  return (c.source === 'nav' ? 2 : 0) + (guessPageType(c.url, c.text) ? 3 : 0);
}

function keepFirst(a: TrackedRow, b: TrackedRow): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  const at = a.lastCapturedAt?.getTime() ?? -Infinity;
  const bt = b.lastCapturedAt?.getTime() ?? -Infinity;
  if (at !== bt) return bt - at;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

async function loadTracked(db: Db, competitorId: string): Promise<TrackedRow[]> {
  const rows = await db
    .select({
      id: trackedPage.id, url: trackedPage.url, pageType: trackedPage.pageType, source: trackedPage.source, pinned: trackedPage.pinned,
      active: trackedPage.active, inactiveReason: trackedPage.inactiveReason, lastCapturedAt: trackedPage.lastCapturedAt, createdAt: trackedPage.createdAt,
    })
    .from(trackedPage)
    .where(eq(trackedPage.competitorId, competitorId));
  return rows.map((r) => ({ ...r, key: pageKey(r.url) }));
}

/** Sets still-active rows inactive with `reason` (the CHECK needs one); mirrors the change on the in-memory rows. */
async function deactivate(db: Db, rows: TrackedRow[], reason: 'gone' | 'duplicate' | 'replaced'): Promise<number> {
  if (rows.length === 0) return 0;
  const done = await db
    .update(trackedPage)
    .set({ active: false, inactiveReason: reason })
    .where(and(inArray(trackedPage.id, rows.map((r) => r.id)), eq(trackedPage.active, true)))
    .returning({ id: trackedPage.id });
  const ids = new Set(done.map((d) => d.id));
  for (const r of rows) if (ids.has(r.id)) Object.assign(r, { active: false, inactiveReason: reason });
  return ids.size;
}

/** Re-activates `gone` rows only — never `manual`, `duplicate` or `replaced` ones. */
async function reactivate(db: Db, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const done = await db
    .update(trackedPage)
    .set({ active: true, inactiveReason: null })
    .where(and(inArray(trackedPage.id, ids), eq(trackedPage.active, false), eq(trackedPage.inactiveReason, 'gone')))
    .returning({ id: trackedPage.id });
  return done.length;
}

/**
 * Inserts tracked pages. On a URL conflict it only touches an inactive `gone` row (re-activating it, clearing the
 * reason); active, `manual`, `duplicate` and `replaced` rows are left alone. Pinned pages keep their type/cadence.
 * Returns the number of rows inserted or re-activated.
 */
async function upsertPages(db: Db, competitorId: string, pages: PageWrite[]): Promise<number> {
  if (pages.length === 0) return 0;
  const done = await db
    .insert(trackedPage)
    .values(pages.map((p) => ({ competitorId, url: p.url, pageType: p.pageType, source: p.source, cadence: p.cadence, appearedAt: p.appeared ? sql`now()` : null })))
    .onConflictDoUpdate({
      target: [trackedPage.competitorId, trackedPage.url],
      set: {
        pageType: sql`CASE WHEN ${trackedPage.pinned} THEN ${trackedPage.pageType} ELSE excluded.page_type END`,
        cadence: sql`CASE WHEN ${trackedPage.pinned} THEN ${trackedPage.cadence} ELSE excluded.cadence END`,
        active: sql`true`,
        inactiveReason: sql`NULL`,
      },
      setWhere: sql`NOT ${trackedPage.active} AND ${trackedPage.inactiveReason} = 'gone'`,
    })
    .returning({ id: trackedPage.id });
  return done.length;
}

async function recordSiteUrls(db: Db, competitorId: string, rows: Candidate[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    await db
      .insert(siteUrl)
      .values(rows.slice(i, i + 500).map((c) => ({ competitorId, urlKey: c.key, url: c.url, source: c.source })))
      .onConflictDoUpdate({ target: [siteUrl.competitorId, siteUrl.urlKey], set: { lastSeenAt: sql`now()` } });
  }
}

/**
 * Upserts the competitor's `site_discovery` row: `runs + 1`, `last_run_at`, homepage status (and, after a read of the
 * site, `urls`/`truncated`). `next_due_at` only moves later — `greatest(existing, now() + REDISCOVERY_DAYS)` — so a
 * tool-started run is not followed by a scheduled one the next day.
 */
async function recordRun(db: Db, competitorId: string, run: { homepageStatus: RenderStatus; urls?: number; truncated?: boolean }): Promise<void> {
  const nextDue = sql`now() + ${sql.raw(`interval '${REDISCOVERY_DAYS} days'`)}`;
  const read = run.urls !== undefined;
  await db
    .insert(siteDiscovery)
    .values({
      competitorId, lastRunAt: sql`now()`, nextDueAt: nextDue, homepageStatus: run.homepageStatus, runs: 1,
      ...(read ? { urls: run.urls, truncated: run.truncated ?? false } : {}),
    })
    .onConflictDoUpdate({
      target: siteDiscovery.competitorId,
      set: {
        lastRunAt: sql`now()`,
        nextDueAt: sql`greatest(${siteDiscovery.nextDueAt}, excluded.next_due_at)`,
        homepageStatus: sql`excluded.homepage_status`,
        runs: sql`${siteDiscovery.runs} + 1`,
        ...(read ? { urls: sql`excluded.urls`, truncated: sql`excluded.truncated` } : {}),
      },
    });
}
