import { createHash } from 'node:crypto';
import { pseudonymizeReviewer } from '@cs/collectors';
import { capture, observation, review, reviewAnalysis } from '@cs/db';
import { DAY, notAfter } from './clock';
import type { SeedContext } from './context';
import { FIRST_NAMES, HVAC_THEMES, type HvacTheme, LAST_INITIALS, LATE_PHRASE, OWNER_ANSWERS, reviewText } from './names';
import { DEMO_COLLECTOR, LONE_STAR_PLACE_ID } from './tenancy';

interface Target {
  competitorId: string;
  slug: string;
  name: string;
  domain: string;
  placeId: string;
  lat: number;
  lng: number;
  category: string;
  count: number;
  mean: number;
  self: boolean;
  /** Ratings drop by 1.3 stars over the last 60 days (the reputation-slump move). */
  slump?: boolean;
  /** Spec §4.5 heatmap gap: this theme is never asked for this business. */
  skipTheme?: HvacTheme;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const clamp = (n: number) => Math.min(5, Math.max(1, n));

function targets(ctx: SeedContext): Target[] {
  const { ids } = ctx;
  const ls = ids.competitors.loneStar;
  const bz = ids.competitors.brazos;
  const comp = (c: (typeof ls)[number], category: string, count: number, mean: number, extra: Partial<Target> = {}): Target =>
    ({ competitorId: c.id, slug: c.slug, name: c.name, domain: c.domain, placeId: c.placeId, lat: c.lat, lng: c.lng, category, count, mean, self: false, ...extra });
  return [
    { competitorId: ids.selfLoneStar, slug: 'lone-star-cooling', name: 'Lone Star Cooling', domain: 'lone-star-cooling.example', placeId: LONE_STAR_PLACE_ID, lat: 32.447, lng: -97.798, category: 'HVAC contractor', count: 60, mean: 4.7, self: true },
    comp(ls[0]!, 'HVAC contractor', 36, 4.4, { skipTheme: 'cleanliness' }),
    comp(ls[1]!, 'HVAC contractor', 36, 3.9),
    comp(ls[2]!, 'HVAC contractor', 36, 4.5),
    comp(ls[3]!, 'HVAC contractor', 36, 4.2, { slump: true }),
    comp(ls[4]!, 'HVAC contractor', 36, 4.0),
    comp(ls[5]!, 'HVAC contractor', 36, 4.6),
    comp(bz[0]!, 'Plumber', 40, 4.1),
    comp(bz[1]!, 'Plumber', 40, 3.7),
    comp(bz[2]!, 'Plumber', 40, 4.3),
    comp(bz[3]!, 'Plumber', 0, 0), // ids.noData.reviews: a profile, no reviews
  ];
}

/** Spec §4.5. */
export async function seedReviews(ctx: SeedContext): Promise<void> {
  const rng = ctx.rng('reviews');
  const now = ctx.clock.now;
  for (const t of targets(ctx)) {
    const pool = HVAC_THEMES.filter((x) => x !== t.skipTheme);
    const rows: (typeof review.$inferInsert)[] = [];
    const analyses = new Map<string, { themes: HvacTheme[]; rating: number; text: string; analyzedAt: Date }>();
    const add = (rating: number, days: number, text: string, themes: HvacTheme[]) => {
      const postedAt = ctx.clock.daysAgo(days);
      const answered = rng.chance(t.self ? 0.7 : 0.3);
      const dedupeKey = `demo-${t.slug}-${rows.length}`;
      const firstSeenAt = notAfter(new Date(postedAt.getTime() + DAY), new Date(now.getTime() - 3_600_000));
      rows.push({
        competitorId: t.competitorId, source: 'google', dedupeKey, externalId: dedupeKey, rating, text,
        reviewerHash: pseudonymizeReviewer(`${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_INITIALS)}.`, ctx.salt), postedAt,
        ownerAnswer: answered ? OWNER_ANSWERS[rating >= 4 ? rng.int(0, 1) : 2] : null,
        ownerAnsweredAt: answered ? notAfter(new Date(postedAt.getTime() + rng.int(1, 3) * DAY), now) : null,
        firstSeenAt, lastSeenAt: ctx.clock.daysAgo(0.5),
      });
      analyses.set(dedupeKey, { themes, rating, text, analyzedAt: firstSeenAt });
    };
    for (let n = 0; n < t.count; n++) {
      const days = 0.5 + rng.next() * 364;
      const mean = t.mean - (t.slump && days < 60 ? 1.3 : 0);
      const rating = clamp(Math.round(mean + (rng.next() + rng.next() - 1) * 1.6));
      // Cycle the first theme so every theme the business is asked about appears at least once.
      const first = pool[n % pool.length]!;
      const second = rng.chance(0.4) ? rng.pick(pool.filter((x) => x !== first)) : null;
      const themes = second ? [first, second] : [first];
      add(rating, days, reviewText(rng, rating, themes), themes);
    }
    if (t.competitorId === ctx.ids.competitors.loneStar[1]!.id) {
      add(2, 9, `The tech ${LATE_PHRASE} and never called ahead. Fixed the AC in the end.`, ['scheduling', 'communication']);
    }
    const inserted: { id: string; dedupeKey: string }[] = [];
    for (let i = 0; i < rows.length; i += 100) {
      inserted.push(...(await ctx.db.insert(review).values(rows.slice(i, i + 100)).returning({ id: review.id, dedupeKey: review.dedupeKey })));
    }
    // Pair analyses to reviews by dedupeKey (unique per competitor/source), never by RETURNING order.
    if (inserted.length) {
      await ctx.db.insert(reviewAnalysis).values(inserted.map((r) => {
        const a = analyses.get(r.dedupeKey)!;
        return {
          reviewId: r.id, verticalId: 'hvac_plumbing', competitorId: t.competitorId, textSha: sha(a.text), asked: [...pool], themes: a.themes,
          other: false, sentiment: a.rating - 1, confidence: 0.9, needsReview: false, analysisVersion: 1, analyzedAt: a.analyzedAt,
        };
      }));
    }
    if (!t.self && ctx.ids.sampleReviewIds.length < 3) ctx.ids.sampleReviewIds.push(...inserted.slice(0, 3 - ctx.ids.sampleReviewIds.length).map((r) => r.id));
    await gbpProfile(ctx, t, [...analyses.values()].map((a) => a.rating));
  }
  // The prospect's competitors (dental) get a profile too; the pitch snapshot shows their ratings.
  for (const [i, c] of ctx.ids.competitors.lakeside.entries()) {
    await gbpProfile(ctx, { competitorId: c.id, slug: c.slug, name: c.name, domain: c.domain, placeId: c.placeId, lat: c.lat, lng: c.lng, category: 'Dentist', count: 0, mean: 0, self: false }, [], [4.6, 4.3][i] ?? 4.5, [210, 95][i] ?? 50);
  }
}

async function gbpProfile(ctx: SeedContext, t: Target, ratings: number[], fixedRating?: number, fixedVotes?: number): Promise<void> {
  const at = ctx.clock.daysAgo(1.5);
  const rating = fixedRating ?? (ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null);
  const votes = fixedVotes ?? (ratings.length ? ratings.length + 40 : 0);
  const [c] = await ctx.db.insert(capture).values({ competitorId: t.competitorId, source: 'google_business_profile', status: 'ok', collectorVersion: DEMO_COLLECTOR, capturedAt: at }).returning({ id: capture.id });
  await ctx.db.insert(observation).values({
    competitorId: t.competitorId, captureId: c!.id, kind: 'gbp_profile', key: 'profile', observedAt: at,
    data: {
      title: t.name, category: t.category, additionalCategories: [], rating, votes, phone: null, url: `https://${t.domain}/`, domain: t.domain,
      address: 'Granbury, TX', isClaimed: true, currentStatus: 'open', cid: null, placeId: t.placeId, latitude: t.lat, longitude: t.lng,
    },
  });
}
