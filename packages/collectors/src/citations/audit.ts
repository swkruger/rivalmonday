import type { CallScope } from '@cs/core';
import { citationListing, type Db, type SerpOrganicItem, type Tx } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { type Directory, isBannedHost } from '@cs/verticals';
import { and, eq, notInArray, sql } from 'drizzle-orm';
import { DFS_COLLECTOR_VERSION } from '../gbp/collect-gbp';
import { recordVendorCapture } from '../evidence/vendor-capture';
import type { DataForSeoClient } from '../vendors/dataforseo';
import { alsoFoundOn, type CitationBiz, type ListingMatch, matchListing, phone10 } from './match';
import { CITATION_CALL_USD, CITATION_DEPTH, CITATIONS_SOURCE, citationSearch } from './search';

export interface CitationBudget { spentUsd: number; readonly capUsd: number }
export interface CitationRow { host: string; status: 'listed' | 'not_found'; inCatalogue: boolean; match: ListingMatch | null; captureId: string }

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const stripQuotes = (s: string): string => s.replace(/["\u201c\u201d]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * P14: one business, at most two searches. Stage 1 `"name" "NNN-NNN-NNNN"` (also feeds "Also found on"), stage 2 one
 * `"name" city` search for the catalogue hosts stage 1 missed. A failed call writes a vendor_error capture and no rows for
 * the hosts it would have classified (P2). Stops before a call that would cross the run cap.
 */
export async function auditBusiness(
  deps: { db: Db; store: ObjectStore; dfs: DataForSeoClient; now?: () => Date },
  biz: CitationBiz & { competitorId: string },
  catalogue: Directory[],
  budget: CitationBudget,
  scope: CallScope,
): Promise<{ rows: CitationRow[]; calls: number; usd: number; capped: boolean }> {
  const rows: CitationRow[] = [];
  let calls = 0, usd = 0, capped = false;
  const hosts = catalogue.map((d) => d.host).filter((h) => !isBannedHost(h));
  const name = stripQuotes(biz.name);

  async function run(query: string, url: string): Promise<{ organic: SerpOrganicItem[]; captureId: string } | null> {
    if (budget.spentUsd + CITATION_CALL_USD > budget.capUsd) { capped = true; return null; }
    budget.spentUsd += CITATION_CALL_USD;
    usd += CITATION_CALL_USD;
    calls++;
    const base = { competitorId: biz.competitorId, source: CITATIONS_SOURCE, url, collectorVersion: DFS_COLLECTOR_VERSION };
    try {
      const r = await citationSearch(deps.dfs, { query, depth: CITATION_DEPTH }, scope);
      const { captureId } = await recordVendorCapture(deps, { ...base, status: 'ok', payload: r.raw });
      return { organic: r.organic, captureId };
    } catch (err) {
      await recordVendorCapture(deps, { ...base, status: 'vendor_error', error: errText(err) });
      return null;
    }
  }

  const p = phone10(biz.phone);
  const missed = new Set(hosts);
  let stage1Ok = false;
  if (p && hosts.length > 0) {
    const s1 = await run(`"${name}" "${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}"`, 'citations:name_phone');
    if (s1) {
      stage1Ok = true;
      for (const host of hosts) {
        const match = matchListing(s1.organic, host, biz);
        if (!match) continue;
        rows.push({ host, status: 'listed', inCatalogue: true, match, captureId: s1.captureId });
        missed.delete(host);
      }
      for (const a of alsoFoundOn(s1.organic, hosts, biz)) {
        rows.push({ host: a.host, status: 'listed', inCatalogue: false, match: { url: a.url, title: a.title, nameMatch: true, phoneMatch: true, shownPhone: null }, captureId: s1.captureId });
      }
    }
  }
  if (missed.size > 0 && !capped) {
    const s2 = await run(biz.city ? `"${name}" ${biz.city}` : `"${name}"`, 'citations:name_city');
    if (s2) {
      // P4: without a successful phone search a phone is never compared.
      const b2 = stage1Ok ? biz : { ...biz, phone: null };
      for (const host of missed) {
        const match = matchListing(s2.organic, host, b2);
        rows.push(match ? { host, status: 'listed', inCatalogue: true, match, captureId: s2.captureId } : { host, status: 'not_found', inCatalogue: true, match: null, captureId: s2.captureId });
      }
    }
  }
  return { rows, calls, usd, capped };
}

/** One upsert per business; see spec 18c for the first/last seen and `newly_found_at` rules. With `stage1Ok`, also-found rows not seen again are deleted (P12). */
export async function upsertCitationRows(db: Db | Tx, competitorId: string, rows: CitationRow[], checkedAt: Date, opts: { stage1Ok: boolean }): Promise<void> {
  const kept = rows.filter((r) => !isBannedHost(r.host));
  if (kept.length > 0) {
    await db.insert(citationListing).values(kept.map((r) => {
      const listed = r.status === 'listed';
      return {
        competitorId, host: r.host, status: r.status,
        nameMatch: r.match?.nameMatch ?? null, phoneMatch: r.match?.phoneMatch ?? null,
        listingUrl: r.match?.url ?? null, listingTitle: r.match?.title ?? null, shownPhone: r.match?.shownPhone ?? null,
        captureId: r.captureId, firstSeenAt: listed ? checkedAt : null, lastSeenAt: listed ? checkedAt : null, newlyFoundAt: null,
        inCatalogue: r.inCatalogue, checkedAt,
      };
    })).onConflictDoUpdate({
      target: [citationListing.competitorId, citationListing.host],
      set: {
        status: sql`excluded.status`, nameMatch: sql`excluded.name_match`, phoneMatch: sql`excluded.phone_match`,
        listingUrl: sql`excluded.listing_url`, listingTitle: sql`excluded.listing_title`, shownPhone: sql`excluded.shown_phone`,
        captureId: sql`excluded.capture_id`, inCatalogue: sql`excluded.in_catalogue`, checkedAt: sql`excluded.checked_at`,
        firstSeenAt: sql`CASE WHEN excluded.status = 'listed' AND citation_listing.status <> 'listed' THEN excluded.checked_at ELSE citation_listing.first_seen_at END`,
        lastSeenAt: sql`CASE WHEN excluded.status = 'listed' THEN excluded.checked_at ELSE citation_listing.last_seen_at END`,
        newlyFoundAt: sql`CASE WHEN excluded.status = 'listed' AND citation_listing.status = 'not_found' AND excluded.in_catalogue THEN excluded.checked_at WHEN excluded.status <> 'listed' THEN NULL ELSE citation_listing.newly_found_at END`,
      },
    });
  }
  if (opts.stage1Ok) {
    const seen = kept.map((r) => r.host);
    await db.delete(citationListing).where(and(
      eq(citationListing.competitorId, competitorId), eq(citationListing.inCatalogue, false),
      seen.length > 0 ? notInArray(citationListing.host, seen) : undefined,
    ));
  }
}
