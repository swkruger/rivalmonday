import type { Ai } from '@cs/ai';
import type { PageType } from '@cs/core';
import { type Db, trackedPage } from '@cs/db';
import { sql } from 'drizzle-orm';
import type { HostRateLimiter } from '../web/rate-limit';
import type { Renderer, RenderStatus } from '../web/renderer';
import type { RobotsPolicy } from '../web/robots';
import { type FetchText, siteHost } from '../web/user-agent';
import { classifyPage } from './classify';
import { type CandidatePage, selectPages } from './select';
import { collectSitemapUrls } from './sitemap';
import { guessPageType, normalizeUrl } from './urls';

export interface DiscoveryDeps {
  db: Db;
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
 * for that one file and moves on.
 */
function politeSitemapFetch(deps: DiscoveryDeps, homeHost: string): FetchText {
  return async (url) => {
    if (siteHost(url) !== homeHost) throw new Error(`cross-host sitemap url rejected: ${url}`);
    const verdict = await deps.robots.check(url);
    if (!verdict.allowed) throw new Error(`robots disallowed sitemap url: ${url}`);
    await deps.limiter.wait(url, verdict.crawlDelaySeconds);
    return deps.fetchText(url);
  };
}

export async function discoverPages(
  deps: DiscoveryDeps,
  competitor: { id: string; domain: string },
  opts: { max?: number; maxCandidates?: number } = {},
): Promise<{ selected: number; candidates: number; homepageStatus: RenderStatus }> {
  const homeUrl = `https://${competitor.domain}/`;
  const home = await deps.renderer.render(homeUrl);
  try {
    if (home.status !== 'ok') return { selected: 0, candidates: 0, homepageStatus: home.status };

    const candidates = new Map<string, { url: string; text?: string; source: 'sitemap' | 'nav' }>();
    const homeNorm = normalizeUrl(home.finalUrl, competitor.domain) ?? homeUrl;
    candidates.set(homeNorm, { url: homeNorm, text: 'Home', source: 'nav' });
    for (const link of home.links) {
      const u = normalizeUrl(link.href, competitor.domain);
      if (u && !candidates.has(u)) candidates.set(u, { url: u, text: link.text, source: 'nav' });
    }
    const verdict = await deps.robots.check(homeUrl);
    const sitemapSeeds = verdict.sitemaps.length > 0 ? verdict.sitemaps : [`https://${competitor.domain}/sitemap.xml`];
    const homeHost = siteHost(homeUrl);
    for (const raw of await collectSitemapUrls(politeSitemapFetch(deps, homeHost), sitemapSeeds)) {
      const u = normalizeUrl(raw, competitor.domain);
      if (u && !candidates.has(u)) candidates.set(u, { url: u, source: 'sitemap' });
    }

    // Prefilter: nav links and keyword-matching URLs first, so classification cost stays bounded.
    const ranked = [...candidates.values()].sort((a, b) => score(b) - score(a)).slice(0, opts.maxCandidates ?? 60);
    const classified: CandidatePage[] = [];
    for (const c of ranked) {
      let pageType: PageType;
      try {
        pageType = (await classifyPage(deps.ai, { ...c, businessName: competitor.domain })).pageType;
      } catch {
        // A single candidate's classifier failure must not abort discovery for the rest.
        pageType = guessPageType(c.url, c.text) ?? 'other';
      }
      classified.push({ url: c.url, pageType, source: c.source });
    }
    const selected = selectPages(classified, opts.max ?? 25);

    if (selected.length > 0) {
      await deps.db
        .insert(trackedPage)
        .values(selected.map((p) => ({ competitorId: competitor.id, url: p.url, pageType: p.pageType, source: p.source, cadence: p.cadence })))
        .onConflictDoUpdate({
          target: [trackedPage.competitorId, trackedPage.url],
          // Pinned pages keep the type/cadence an account manager chose.
          set: {
            pageType: sql`CASE WHEN ${trackedPage.pinned} THEN ${trackedPage.pageType} ELSE excluded.page_type END`,
            cadence: sql`CASE WHEN ${trackedPage.pinned} THEN ${trackedPage.cadence} ELSE excluded.cadence END`,
            active: sql`true`,
          },
        });
    }
    return { selected: selected.length, candidates: candidates.size, homepageStatus: 'ok' };
  } finally {
    await home.close();
  }
}

function score(c: { url: string; text?: string; source: 'sitemap' | 'nav' }): number {
  return (c.source === 'nav' ? 2 : 0) + (guessPageType(c.url, c.text) ? 3 : 0);
}
