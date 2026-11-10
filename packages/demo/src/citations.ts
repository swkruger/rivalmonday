import { citationAuditRun, citationListing, type CitationStatus } from '@cs/db';
import type { SeedContext } from './context';

/** A listing as the audit stores it; hosts are hvac_plumbing catalogue hosts (general + home_services groups). */
interface DemoListing { host: string; status: Exclude<CitationStatus, 'not_checked'>; name?: boolean | null; phone?: boolean | null; shownPhone?: string }

const L = (host: string, name: boolean | null = true, phone: boolean | null = true, shownPhone?: string): DemoListing => ({ host, status: 'listed', name, phone, shownPhone });
const NF = (host: string): DemoListing => ({ host, status: 'not_found' });

/**
 * Lone Star's own listings: a mix of listed (one with a different phone, one with a different name), not found, and two
 * catalogue hosts with no row (houzz.com, porch.com), which the page shows as "Not checked yet".
 */
const SELF: DemoListing[] = [
  L('facebook.com'), L('bbb.org', true, false, '8175550142'), L('yellowpages.com'), NF('manta.com'), NF('foursquare.com'),
  L('mapquest.com', true, null), NF('angi.com'), L('homeadvisor.com', false, true), NF('thumbtack.com'),
];
/** The three audited rivals, in run order: each is listed on more directories than Lone Star somewhere. */
const RIVALS: DemoListing[][] = [
  [L('facebook.com'), L('bbb.org'), L('yellowpages.com'), L('manta.com'), NF('foursquare.com'), L('mapquest.com'), L('angi.com'), L('homeadvisor.com'), NF('thumbtack.com')],
  [L('facebook.com'), NF('bbb.org'), L('yellowpages.com'), NF('manta.com'), L('foursquare.com'), NF('mapquest.com'), L('angi.com'), NF('homeadvisor.com'), L('thumbtack.com')],
  [NF('facebook.com'), L('bbb.org'), NF('yellowpages.com'), NF('manta.com'), NF('foursquare.com'), L('mapquest.com'), NF('angi.com'), L('homeadvisor.com'), NF('thumbtack.com')],
];

/** 18c-1: one finished monthly listings check for Lone Star (you + 3 rivals) and one "Also found on" row. No evidence, like the search results. */
export async function seedCitations(ctx: SeedContext): Promise<void> {
  const { ids, clock } = ctx;
  const self = ids.selfLoneStar;
  const rivals = ids.competitors.loneStar.slice(0, RIVALS.length);
  const checkedAt = clock.daysAgo(9);
  const firstSeenAt = clock.daysAgo(39);
  const rowsFor = (competitorId: string, slug: string, listings: DemoListing[]): (typeof citationListing.$inferInsert)[] => listings.map((l) => ({
    competitorId, host: l.host, status: l.status,
    nameMatch: l.status === 'listed' ? l.name ?? null : null,
    phoneMatch: l.status === 'listed' ? l.phone ?? null : null,
    // Reserved `.example` hosts (facebook.example, bbb.example): no demo link can reach a real page. `host` stays the real directory.
    listingUrl: l.status === 'listed' ? `https://${l.host.replace(/\.[a-z]+$/, '')}.example/${slug}` : null,
    listingTitle: l.status === 'listed' ? `${slug} | ${l.host}` : null,
    shownPhone: l.shownPhone ?? null,
    captureId: null,
    firstSeenAt: l.status === 'listed' ? firstSeenAt : null,
    lastSeenAt: l.status === 'listed' ? checkedAt : null,
    inCatalogue: true,
    checkedAt,
  }));
  await ctx.db.insert(citationListing).values([
    ...rowsFor(self, 'lone-star-cooling', SELF),
    ...rivals.flatMap((c, i) => rowsFor(c.id, c.slug, RIVALS[i]!)),
    // C12: an own listing outside the catalogue (demo domain).
    {
      competitorId: self, host: 'hoodcountychamber.example', status: 'listed', nameMatch: true, phoneMatch: true,
      listingUrl: 'https://hoodcountychamber.example/members/lone-star-cooling', listingTitle: 'Lone Star Cooling | Hood County Chamber',
      captureId: null, firstSeenAt, lastSeenAt: checkedAt, inCatalogue: false, checkedAt,
    },
  ]);
  await ctx.db.insert(citationAuditRun).values({
    agencyId: ids.agencyId, clientId: ids.clients.loneStar, trigger: 'monthly', status: 'done',
    competitorIds: [self, ...rivals.map((c) => c.id)], calls: 8, estUsd: '0.0320', startedAt: checkedAt, finishedAt: checkedAt,
  });
}
