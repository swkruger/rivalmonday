import { clientCompetitor, competitor, competitorSignal, competitorSuggestion, discoveryRun } from '@cs/db';
import { and, eq } from 'drizzle-orm';
import type { SeedContext } from './context';
import { FILLER_BUSINESSES } from './rankings';

type Sig = {
  rating: number | null; votes: number | null; reviews30d: number | null; reviews90d: number | null; replyRate: number | null;
  googleAdsActive: number | null; googleAdsNew30d: number | null; googleAccount: 'matched' | 'possible' | 'none' | null;
  metaPage: 'matched' | 'possible' | 'none' | null; metaAdsActive: number | null; claimed: boolean | null; chain: boolean | null;
  categoryMatch: 'main' | 'related' | null; distanceKm: number | null; presence: { searches: number; appeared: number; bestRank: number | null } | null;
};
const NO: Sig = {
  rating: null, votes: null, reviews30d: null, reviews90d: null, replyRate: null, googleAdsActive: null, googleAdsNew30d: null, googleAccount: null,
  metaPage: null, metaAdsActive: null, claimed: null, chain: null, categoryMatch: null, distanceKm: null, presence: null,
};
const sig = (o: Partial<Sig>): Sig => ({ ...NO, ...o });

type Match = { platform: 'google' | 'meta'; accountId: string; name: string; strength: 'strong' | 'weak' };

/** Eight candidates across all three tiers; unchecked signals stay null (a vendor outage, not "zero"). */
const CANDIDATES: { tier: 'top' | 'watch' | 'minor'; overlap: number; activity: number; signals: Sig; adMatches?: Match[] }[] = [
  { tier: 'top', overlap: 0.92, activity: 0.8, signals: sig({ rating: 4.7, votes: 212, reviews30d: 9, googleAdsActive: 4, googleAdsNew30d: 2, googleAccount: 'matched', metaPage: 'matched', metaAdsActive: 3, claimed: true, chain: false, categoryMatch: 'main', distanceKm: 3.1, presence: { searches: 9, appeared: 8, bestRank: 1 } }), adMatches: [{ platform: 'google', accountId: 'AR0DEMO001', name: 'Rapid Air Solutions LLC', strength: 'strong' }] },
  { tier: 'top', overlap: 0.85, activity: 0.55, signals: sig({ rating: 4.5, votes: 140, reviews30d: 3, googleAdsActive: 2, googleAdsNew30d: 0, googleAccount: 'matched', metaPage: 'none', claimed: true, chain: false, categoryMatch: 'main', distanceKm: 5.4, presence: { searches: 9, appeared: 7, bestRank: 2 } }) },
  { tier: 'watch', overlap: 0.66, activity: 0.5, signals: sig({ rating: 4.2, votes: 64, reviews30d: 5, googleAdsActive: 0, googleAdsNew30d: 0, googleAccount: 'none', metaPage: 'possible', metaAdsActive: null, claimed: true, chain: false, categoryMatch: 'main', distanceKm: 9.8, presence: { searches: 9, appeared: 5, bestRank: 3 } }), adMatches: [{ platform: 'meta', accountId: '1000000000DEMO', name: 'Texan Temp Control Weatherford', strength: 'weak' }] },
  { tier: 'watch', overlap: 0.6, activity: 0.3, signals: sig({ rating: 4.0, votes: 38, reviews30d: 1, claimed: false, chain: false, categoryMatch: 'related', distanceKm: 12.2, presence: { searches: 9, appeared: 4, bestRank: 5 } }) },
  { tier: 'watch', overlap: 0.52, activity: 0.2, signals: sig({ rating: 4.4, votes: 77, reviews30d: 0, googleAdsActive: 1, googleAdsNew30d: 0, googleAccount: 'matched', metaPage: 'none', claimed: true, chain: true, categoryMatch: 'main', distanceKm: 14.0, presence: { searches: 9, appeared: 3, bestRank: 6 } }) },
  { tier: 'minor', overlap: 0.31, activity: 0.1, signals: sig({ rating: 3.8, votes: 22, reviews30d: 0, googleAdsActive: 0, googleAdsNew30d: 0, googleAccount: 'none', metaPage: 'none', claimed: false, chain: false, categoryMatch: 'related', distanceKm: 18.5, presence: { searches: 9, appeared: 2, bestRank: 9 } }) },
  { tier: 'minor', overlap: 0.22, activity: 0.05, signals: sig({ rating: 4.1, votes: 15, chain: false, categoryMatch: 'main', distanceKm: 21.3, presence: { searches: 9, appeared: 1, bestRank: 12 } }) },
  { tier: 'minor', overlap: 0.15, activity: 0, signals: sig({ presence: { searches: 9, appeared: 1, bestRank: 14 } }) },
];

/**
 * 12a: one finished discovery run for Lone Star with tiered suggestions (varied and partly unchecked signals), a weekly rating
 * (`competitor_signal`) for the tracked competitors of both active clients, and one matched plus one pending ad account.
 */
export async function seedRivals(ctx: SeedContext): Promise<void> {
  const { db, ids, clock } = ctx;
  const ls = ids.clients.loneStar;
  const [run] = await db.insert(discoveryRun).values({
    agencyId: ids.agencyId, clientId: ls, trigger: 'manual', status: 'done', kept: CANDIDATES.length, startedAt: clock.daysAgo(6), finishedAt: clock.daysAgo(6),
    hidden: { wrong_category: 2, outside_area: 1, self: 1 },
    progress: {
      searchesDone: 9, searchesTotal: 9, checksDone: CANDIDATES.length, checksTotal: CANDIDATES.length,
      hiddenList: [{ name: 'Home Depot', reason: 'wrong_category' }, { name: 'Fort Worth Mechanical', reason: 'outside_area' }, { name: 'Lone Star Cooling', reason: 'self' }],
    },
  }).returning({ id: discoveryRun.id });
  await db.insert(competitorSuggestion).values(CANDIDATES.map((c, i) => ({
    agencyId: ids.agencyId, clientId: ls, name: FILLER_BUSINESSES[i]!, domain: null, placeId: `demo-filler-${i}`, cid: null, rating: c.signals.rating, votes: c.signals.votes,
    appearances: c.signals.presence?.appeared ?? 0, bestRank: c.signals.presence?.bestRank ?? null, overlapScore: c.overlap, status: 'suggested', createdAt: clock.daysAgo(6),
    runId: run!.id, category: 'HVAC contractor', distanceKm: c.signals.distanceKm, overlap: c.overlap, activity: c.activity, tier: c.tier, signals: c.signals, adMatches: c.adMatches ?? [],
  })));

  // Weekly ratings for every tracked competitor except Lone Star's last one, so "Not rated yet" shows on the tracked list.
  const tiers = ['top', 'watch', 'minor'] as const;
  const shapes = [CANDIDATES[0]!, CANDIDATES[3]!, CANDIDATES[5]!];
  const unrated = ids.competitors.loneStar.at(-1)!.id;
  const rated = [...ids.competitors.loneStar.map((c, i) => ({ clientId: ls, c, i })), ...ids.competitors.brazos.map((c, i) => ({ clientId: ids.clients.brazos, c, i }))];
  await db.insert(competitorSignal).values(rated.filter((r) => r.c.id !== unrated).map(({ clientId, c, i }) => ({
    agencyId: ids.agencyId, clientId, competitorId: c.id, tier: tiers[i % 3]!, overlap: shapes[i % 3]!.overlap, activity: shapes[i % 3]!.activity,
    signals: shapes[i % 3]!.signals, computedAt: clock.daysAgo(i % 3 === 0 ? 1 : 2),
  })));

  // The competitor the profile page opens: one matched Google advertiser and one weak Meta match awaiting confirmation.
  const first = ids.competitors.loneStar[0]!;
  await db.update(competitor).set({ googleAdvertiserIds: ['AR0DEMO001'] }).where(eq(competitor.id, first.id));
  await db.update(clientCompetitor).set({ pendingAdMatches: [{ platform: 'meta', accountId: '1000000000DEMO', name: `${first.name} Services`, strength: 'weak' }] })
    .where(and(eq(clientCompetitor.clientId, ls), eq(clientCompetitor.competitorId, first.id)));
}
