import { brief, briefItem, client, recommendation } from '@cs/db';
import { eq } from 'drizzle-orm';
import { atUtc, DAY, notAfter } from './clock';
import type { SeedContext } from './context';

/** Fictional, like the other demo names: the fresh client has no data yet, so its starting point is still being prepared. */
export const FRESH_CLIENT_NAME = 'Mesquite Creek Plumbing';
const SELF = 'Brazos Plumbing Co';

type Values = Record<'rating' | 'reviews90d' | 'replyRate' | 'mapTop3Share' | 'adsActive' | 'metaAdsActive', number | null>;
const METRICS = ['rating', 'reviews90d', 'replyRate', 'mapTop3Share'] as const;

/** Brazos at the starting point; the rivals' figures are reused in the quiet week below. */
const START: { self: Values; rivals: Values[] } = {
  self: { rating: 4.4, reviews90d: 7, replyRate: 0.22, mapTop3Share: 0.18, adsActive: 0, metaAdsActive: null },
  rivals: [
    { rating: 4.7, reviews90d: 31, replyRate: 0.71, mapTop3Share: 0.45, adsActive: 3, metaAdsActive: 1 },
    { rating: 4.6, reviews90d: 19, replyRate: 0.64, mapTop3Share: 0.33, adsActive: 0, metaAdsActive: null },
    { rating: 4.3, reviews90d: 12, replyRate: 0.58, mapTop3Share: 0.27, adsActive: 2, metaAdsActive: 0 },
    { rating: 4.5, reviews90d: 16, replyRate: null, mapTop3Share: null, adsActive: null, metaAdsActive: null },
  ],
};
const TIERS = ['top', 'top', 'watch', 'minor'] as const;

const median = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return Math.round((v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2) * 100) / 100;
};

function scorecard(ctx: SeedContext, self: Values, evidenceIds: string[], base: { briefId: string; self: Values } | null, openMoves: { recommendationId: string; title: string }[]) {
  const rivals = ctx.ids.competitors.brazos;
  return {
    asOf: ctx.clock.now.toISOString(), baselineBriefId: base?.briefId ?? null,
    tiles: METRICS.map((metric) => ({
      metric, you: self[metric], rivalMedian: median(START.rivals.map((r) => r[metric])),
      deltaSinceStart: base && self[metric] !== null && base.self[metric] !== null ? Math.round((self[metric]! - base.self[metric]!) * 100) / 100 : null,
    })),
    rows: [
      { competitorId: null, name: SELF, self: true, tier: null, values: self },
      ...rivals.map((c, i) => ({ competitorId: c.id, name: c.name, self: false, tier: TIERS[i]!, values: START.rivals[i]! })),
    ],
    evidenceIds, openFirstMoves: openMoves,
  };
}

/**
 * Phase 12b: Brazos has a sent starting point (three findings about itself, one a strength) and a later quiet week whose
 * scorecard shows movement since then plus the first moves still open; a fresh active client has nothing yet, so its home
 * page shows the "Preparing your starting point" checklist.
 */
export async function seedStartingPoint(ctx: SeedContext): Promise<void> {
  const { db, ids, clock } = ctx;
  const clientId = ids.clients.brazos;
  const admin = ids.users.admin.userId;
  const evidence = [...new Set(ids.events.filter((e) => e.client === 'brazos').flatMap((e) => e.evidenceIds))];
  if (evidence.length < 5) throw new Error('seedStartingPoint: Brazos needs 5 evidence ids from its events');

  const deliveryDate = new Date(atUtc(clock.pastMondays[1]!).getTime() - 14 * DAY).toISOString().slice(0, 10);
  const end = atUtc(deliveryDate, 9);
  const approvedAt = notAfter(new Date(end.getTime() + 2 * 3_600_000), clock.now);
  const [sp] = await db.insert(brief).values({
    agencyId: ids.agencyId, clientId, deliveryDate, periodStart: new Date(end.getTime() - 2 * DAY), periodEnd: end, kind: 'starting_point', status: 'sent',
    summary: `Where ${SELF} stands against the ${ids.competitors.brazos.length} rivals we now watch. Weekly briefs from here show what changes.`,
    scorecard: scorecard(ctx, START.self, evidence.slice(0, 6), null, []), trend: null, dropped: { items: 0, sentences: 0 },
    generatedAt: new Date(end.getTime() - 3_600_000), approvedAt, approvedBy: admin, sentAt: approvedAt, createdAt: new Date(end.getTime() - 3_600_000), updatedAt: approvedAt,
  }).returning({ id: brief.id });
  ids.briefs.startingPointBrazos = sp!.id;

  const findings = [
    {
      headline: 'Ask more customers for a review', playbookId: 'ask_for_reviews', effort: 'L', impact: 'H', status: 'todo' as const,
      fact: `You got 7 new reviews in 90 days; ${ids.competitors.brazos[0]!.name} got 31.`,
      why: 'Review count and freshness help decide who shows first on Google Maps.',
      action: 'Text every customer a Google review link right after the job is done, and aim for a few new reviews each week.',
    },
    {
      headline: 'Reply to your reviews', playbookId: 'reply_to_reviews', effort: 'L', impact: 'M', status: 'todo' as const,
      fact: 'You replied to 22% of reviews; the rival median is 64%.',
      why: 'People comparing businesses read the replies, and replying shows you are active and care.',
      action: 'Reply to every new review within two days, starting with the last 20.',
    },
    {
      headline: 'Promote what customers praise', playbookId: 'promote_strength', effort: 'L', impact: 'M', status: 'done' as const,
      fact: 'Customers mention punctuality in 24% of your reviews vs 9% for rivals.',
      why: 'Something reviewers keep praising is a reason to choose you, and it is worth saying out loud.',
      action: 'Feature punctuality as a strength on your website and Google profile, with a short quote from a customer review.',
    },
  ];
  const items = await db.insert(briefItem).values(findings.map((f, k) => ({
    briefId: sp!.id, agencyId: ids.agencyId, clientId, ord: k + 1, competitorId: null, subject: 'self' as const, headline: f.headline, whatChanged: f.fact, whyItMatters: f.why,
    recommendedAction: f.action, confidence: 1, effort: f.effort, impact: f.impact, eventIds: [], evidenceIds: evidence.slice(k, k + 3), playbookId: f.playbookId, status: 'active',
  }))).returning({ id: briefItem.id });
  const recs: { id: string; title: string; status: string }[] = [];
  for (const [k, f] of findings.entries()) {
    const [r] = await db.insert(recommendation).values({
      agencyId: ids.agencyId, clientId, title: f.action, rationale: f.why, evidenceIds: evidence.slice(k, k + 3), eventIds: [], briefItemId: items[k]!.id, playbookId: f.playbookId,
      effort: f.effort, impact: f.impact, owner: 'client', status: f.status, source: 'brief', createdAt: approvedAt, updatedAt: approvedAt,
    }).returning({ id: recommendation.id });
    recs.push({ id: r!.id, title: f.action, status: f.status });
  }

  // The quiet week since: reviews and rating moved up, the reply rate down, and two first moves are still open.
  const now: Values = { rating: 4.5, reviews90d: 11, replyRate: 0.19, mapTop3Share: 0.26, adsActive: 0, metaAdsActive: null };
  const open = recs.filter((r) => r.status === 'todo').map((r) => ({ recommendationId: r.id, title: r.title }));
  await db.update(brief).set({ scorecard: scorecard(ctx, now, evidence.slice(0, 6), { briefId: sp!.id, self: START.self }, open) }).where(eq(brief.id, ids.briefs.quietBrazos));

  const [fresh] = await db.insert(client).values({
    agencyId: ids.agencyId, name: FRESH_CLIENT_NAME, verticalId: 'hvac_plumbing', status: 'active', features: ['dashboard'], services: ['drain_cleaning', 'water_heater'],
    keywords: ['plumber mesquite creek', 'drain cleaning'], serviceArea: { center: { lat: 32.43, lng: -97.74 }, radiusKm: 15, zips: ['76048'] }, competitorLimit: 5, createdAt: clock.daysAgo(1),
  }).returning({ id: client.id });
  ids.startingPointFresh = fresh!.id;
}
