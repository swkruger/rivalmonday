import { client, clientCompetitor, competitor, type Db, type detectedChange, rankScan, serpSnapshot } from '@cs/db';
import { and, desc, eq, inArray, isNotNull, lte } from 'drizzle-orm';
import { RANK_DIFF_VERSION, rankSettingsKey } from './rank';

/** A change is confirmed only after two scans agree: s0 and s1 equal, s2 different. */
export const SERP_SERIES = 3;
/** How many finished scans back we look for a series (a keyword's failed searches leave gaps). */
const SCAN_LOOKBACK = 12;

/** Lowercase host without scheme, `www.`, path or trailing dot — so a vendor result and a stored competitor domain compare equal. */
export function normalizeDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const host = raw.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#]/)[0]!.replace(/:\d+$/, '').replace(/^www\./, '').replace(/\.$/, '');
  return host === '' ? null : host;
}

/** Shared hosts (social, directories, site builders, google): a rival whose only "domain" is one of these is skipped, or any result on that host would be read as the rival. */
export const SHARED_HOSTS: readonly string[] = [
  'facebook.com', 'instagram.com', 'linkedin.com', 'x.com', 'twitter.com', 'youtube.com', 'tiktok.com', 'pinterest.com', 'nextdoor.com', 'yelp.com', 'angi.com', 'angieslist.com',
  'homeadvisor.com', 'thumbtack.com', 'bbb.org', 'yellowpages.com', 'mapquest.com', 'houzz.com', 'porch.com', 'healthgrades.com', 'zocdoc.com', 'google.com', 'sites.google.com',
  'business.site', 'wix.com', 'wixsite.com', 'squarespace.com', 'godaddysites.com',
];
/** The registrable host or any subdomain of it (m.facebook.com, foo.business.site). */
export const isSharedHost = (host: string): boolean => SHARED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));

/**
 * 18b-2 page one of Google: per keyword and tracked rival, `entered`/`left` page one once two consecutive scans
 * agree against the one before (spec § Differ). Tenant-private `rank_change` rows with `surface 'organic'`.
 * Never the client's own business; rivals without a domain are skipped.
 */
export async function diffSerp(db: Db, scanId: string): Promise<(typeof detectedChange.$inferInsert)[]> {
  const [scan] = await db.select().from(rankScan).where(eq(rankScan.id, scanId)).limit(1);
  if (!scan?.finishedAt) return [];
  const key = rankSettingsKey(scan);
  const recent = await db
    .select({ id: rankScan.id, gridSize: rankScan.gridSize, radiusKm: rankScan.radiusKm, keywords: rankScan.keywords })
    .from(rankScan)
    .where(and(eq(rankScan.clientId, scan.clientId), eq(rankScan.status, 'done'), isNotNull(rankScan.finishedAt), lte(rankScan.finishedAt, scan.finishedAt)))
    .orderBy(desc(rankScan.finishedAt))
    .limit(SCAN_LOOKBACK);
  // Lookback: the 3 newest scans with the same settings key, so a reverted change (A, A, B, A) compares across B: acceptable, same search area.
  // Newest first, this scan leading (a same-instant sibling never displaces it).
  const sameSeries = recent.filter((r) => r.id !== scanId && rankSettingsKey(r) === key).map((r) => r.id);
  const scanIds = [scanId, ...sameSeries];
  if (scanIds.length < SERP_SERIES) return [];
  const order = new Map(scanIds.map((id, i) => [id, i]));
  const snaps = await db.select().from(serpSnapshot).where(and(eq(serpSnapshot.clientId, scan.clientId), inArray(serpSnapshot.scanId, scanIds)));
  const byKeyword = new Map<string, typeof snaps>();
  for (const s of snaps) byKeyword.set(s.keyword, [...(byKeyword.get(s.keyword) ?? []), s]);
  const tracked = await db
    .select({ id: competitor.id, domain: competitor.domain })
    .from(clientCompetitor)
    .innerJoin(competitor, eq(competitor.id, clientCompetitor.competitorId))
    .where(eq(clientCompetitor.clientId, scan.clientId));
  const [self] = await db.select({ id: client.selfCompetitorId }).from(client).where(eq(client.id, scan.clientId)).limit(1);

  const rows: (typeof detectedChange.$inferInsert)[] = [];
  for (const [keyword, list] of [...byKeyword].sort(([a], [b]) => a.localeCompare(b))) {
    const series = list.sort((a, b) => order.get(a.scanId)! - order.get(b.scanId)!).slice(0, SERP_SERIES);
    if (series.length < SERP_SERIES || series[0]!.scanId !== scanId) continue;
    const [s0, s1, s2] = series as [typeof series[0], typeof series[0], typeof series[0]];
    for (const c of tracked) {
      const domain = normalizeDomain(c.domain);
      if (!domain || isSharedHost(domain) || c.id === self?.id) continue;
      const at = (s: typeof s0) => s.organic.find((o) => normalizeDomain(o.domain) === domain);
      const [a0, a1, a2] = [at(s0), at(s1), at(s2)];
      if (Boolean(a0) !== Boolean(a1) || Boolean(a1) === Boolean(a2)) continue;
      const entered = Boolean(a0);
      rows.push({
        competitorId: c.id, source: 'rank', kind: entered ? 'added' : 'removed', rankScanId: scanId, agencyId: scan.agencyId, clientId: scan.clientId, blockKey: `serp:${keyword}`,
        beforeText: null, afterText: null,
        details: { changeType: 'rank_change', surface: 'organic', keyword, direction: entered ? 'entered' : 'left', ...(entered ? { position: a0!.rank } : {}), scanId },
        stageVersion: RANK_DIFF_VERSION,
      });
    }
  }
  return rows;
}
