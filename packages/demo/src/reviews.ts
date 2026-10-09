import { createHash } from 'node:crypto';
import { pseudonymizeReviewer } from '@cs/collectors';
import { capture, observation, review, reviewAnalysis } from '@cs/db';
import { DAY, notAfter } from './clock';
import type { SeedContext } from './context';
import { FIRST_NAMES, HVAC_THEMES, type HvacTheme, LAST_INITIALS, LATE_PHRASE, OWNER_ANSWERS, reviewText } from './names';
import { type EventSpec, EVENT_SPECS } from './changes';
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
  /** Which EVENT_SPECS this business is: its review_spike and rating_change events shape its reviews. */
  ref?: { client: 'loneStar' | 'brazos'; comp: number };
  /** Spec §4.5 heatmap gap: this theme is never asked for this business. */
  skipTheme?: HvacTheme;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const clamp = (n: number) => Math.min(5, Math.max(1, n));

function targets(ctx: SeedContext): Target[] {
  const { ids } = ctx;
  const ls = ids.competitors.loneStar;
  const bz = ids.competitors.brazos;
  const comp = (c: (typeof ls)[number], client: 'loneStar' | 'brazos', i: number, category: string, count: number, mean: number, extra: Partial<Target> = {}): Target =>
    ({ competitorId: c.id, slug: c.slug, name: c.name, domain: c.domain, placeId: c.placeId, lat: c.lat, lng: c.lng, category, count, mean, self: false, ref: { client, comp: i }, ...extra });
  return [
    { competitorId: ids.selfLoneStar, slug: 'lone-star-cooling', name: 'Lone Star Cooling', domain: 'lone-star-cooling.example', placeId: LONE_STAR_PLACE_ID, lat: 32.447, lng: -97.798, category: 'HVAC contractor', count: 50, mean: 4.7, self: true },
    comp(ls[0]!, 'loneStar', 0, 'HVAC contractor', 30, 4.4, { skipTheme: 'cleanliness' }),
    comp(ls[1]!, 'loneStar', 1, 'HVAC contractor', 30, 3.9),
    comp(ls[2]!, 'loneStar', 2, 'HVAC contractor', 30, 4.5),
    comp(ls[3]!, 'loneStar', 3, 'HVAC contractor', 74, 4.2),
    comp(ls[4]!, 'loneStar', 4, 'HVAC contractor', 30, 4.0),
    comp(ls[5]!, 'loneStar', 5, 'HVAC contractor', 30, 4.6),
    comp(bz[0]!, 'brazos', 0, 'Plumber', 34, 4.1),
    comp(bz[1]!, 'brazos', 1, 'Plumber', 34, 3.7),
    comp(bz[2]!, 'brazos', 2, 'Plumber', 34, 4.3),
    comp(bz[3]!, 'brazos', 3, 'Plumber', 0, 0), // ids.noData.reviews: a profile, no reviews
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
    const mine = (type: string) => EVENT_SPECS.filter((e) => e.type === type && t.ref && e.client === t.ref.client && e.comp === t.ref.comp);
    const detail = (e: EventSpec) => e.details as unknown as Record<string, number | string>;
    const change = mine('rating_change')[0];
    const split = change ? change.days + 0.25 : null; // age (days) of the rating_change event
    interface Plan { days: number; rating: number; themes: HvacTheme[]; fixed: boolean }
    const plan: Plan[] = [];
    // Spike reviews: at least `count` low-rated reviews on the theme inside the `windowDays` ending at the event.
    for (const e of mine('review_spike')) {
      const d = detail(e);
      for (let k = 0; k < Number(d.count); k++) plan.push({ days: e.days + 0.25 + 0.2 + rng.next() * (Number(d.windowDays) - 0.4), rating: rng.int(1, 2), themes: [String(d.theme) as HvacTheme], fixed: true });
    }
    for (let n = 0; n < t.count; n++) {
      // A rating_change business keeps 24 regular reviews after the event so its post-event mean can be shaped.
      const days = split !== null && n < 24 ? 0.5 + rng.next() * (split - 0.6) : (split ?? 0.5) + rng.next() * (364 - (split ?? 0.5));
      const rating = clamp(Math.round(t.mean + (rng.next() + rng.next() - 1) * 1.6));
      // Cycle the first theme so every theme the business is asked about appears at least once.
      const first = pool[n % pool.length]!;
      const second = rng.chance(0.4) ? rng.pick(pool.filter((x) => x !== first)) : null;
      plan.push({ days, rating, themes: second ? [first, second] : [first], fixed: false });
    }
    if (change) {
      // Nudge individual regular ratings until each side's mean is within 0.04 of the event's before/after rating.
      const d = detail(change);
      for (const [side, target] of [['after', Number(d.ratingAfter)], ['before', Number(d.ratingBefore)]] as const) {
        const seg = plan.filter((p) => (side === 'after' ? p.days < split! : p.days >= split!));
        const mean = () => seg.reduce((a, p) => a + p.rating, 0) / seg.length;
        for (let guard = 0; guard < 1000 && Math.abs(mean() - target) > 0.04; guard++) {
          const up = mean() < target;
          const cand = seg.filter((p) => !p.fixed && (up ? p.rating < 5 : p.rating > 1)).sort((x, y) => (up ? x.rating - y.rating : y.rating - x.rating))[0];
          if (!cand) break;
          cand.rating += up ? 1 : -1;
        }
      }
    }
    for (const p of plan) add(p.rating, p.days, reviewText(rng, p.rating, p.themes), p.themes);
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
    const ratings = [...analyses.values()].map((a) => a.rating);
    if (change) {
      const d = detail(change);
      await gbpProfile(ctx, t, ratings, Number(d.ratingBefore), undefined, split! + 5); // the older profile, before the event
      await gbpProfile(ctx, t, ratings, Number(d.ratingAfter));
    } else await gbpProfile(ctx, t, ratings);
  }
  // The prospect's competitors (dental) get a profile too; the pitch snapshot shows their ratings.
  for (const [i, c] of ctx.ids.competitors.lakeside.entries()) {
    await gbpProfile(ctx, { competitorId: c.id, slug: c.slug, name: c.name, domain: c.domain, placeId: c.placeId, lat: c.lat, lng: c.lng, category: 'Dentist', count: 0, mean: 0, self: false }, [], [4.6, 4.3][i] ?? 4.5, [210, 95][i] ?? 50);
  }
}

async function gbpProfile(ctx: SeedContext, t: Target, ratings: number[], fixedRating?: number, fixedVotes?: number, ageDays = 1.5): Promise<void> {
  const at = ctx.clock.daysAgo(ageDays);
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
