import { ad, capture } from '@cs/db';
import type { SeedContext } from './context';
import type { DemoCompetitor } from './ids';
import { DEMO_COLLECTOR } from './tenancy';

export const AD_COPY: readonly { title: string; text: string }[] = [
  { title: 'Same-day AC repair in Granbury', text: 'Techs on the road now. Book online and save $25 on any repair.' },
  { title: '$79 AC tune-up', text: 'Beat the heat with a 21-point tune-up, this month only.' },
  { title: 'Furnace check before the first freeze', text: 'Schedule a furnace safety check for $89.' },
  { title: '0% financing on new systems', text: 'Replace your old unit with 0% APR for 60 months on approved credit.' },
  { title: 'Join our Comfort Club', text: 'Two tune-ups a year, priority service and 15% off repairs.' },
  { title: 'Emergency service 24/7', text: 'No overtime charges on nights and weekends.' },
  { title: 'Clogged drain? We are 30 minutes away', text: 'Upfront drain cleaning prices, no surprises.' },
  { title: 'Water heater out? Same-day install', text: 'Tank and tankless installs with a 6-year warranty.' },
  { title: 'Free camera inspection', text: 'With any sewer line service booked this week.' },
  { title: 'Duct cleaning special $199', text: 'Breathe easier this spring with whole-home duct cleaning.' },
  { title: 'Rated 4.8 stars by your neighbors', text: 'See why Hood County families call us first.' },
  { title: 'Leak detection without the mess', text: 'Non-invasive leak detection and repair.' },
];

/** Spec §4.4: ~30 ads; Lone Star competitors 4 each (minus the no-ads one), Brazos competitors 3/2/3/2. */
export async function seedAds(ctx: SeedContext): Promise<void> {
  const rng = ctx.rng('ads');
  const plan: [DemoCompetitor, number][] = [
    ...ctx.ids.competitors.loneStar.filter((c) => c.id !== ctx.ids.noData.ads).map((c): [DemoCompetitor, number] => [c, 4]),
    ...ctx.ids.competitors.brazos.map((c, i): [DemoCompetitor, number] => [c, i % 2 === 0 ? 3 : 2]),
  ];
  let serial = 0;
  for (const [comp, n] of plan) {
    const checks: Record<'google' | 'meta', { first: string; latest: string }> = {
      google: await adChecks(ctx, comp.id, 'google_ads'),
      meta: await adChecks(ctx, comp.id, 'meta_ads'),
    };
    const rows: (typeof ad.$inferInsert)[] = [];
    for (let k = 0; k < n; k++) {
      serial++;
      const platform = k % 2 === 0 ? 'google' : 'meta';
      const copy = AD_COPY[(serial * 5) % AD_COPY.length]!;
      const firstDays = rng.int(5, 170);
      const active = k === 0 || rng.chance(0.6);
      const endDays = active ? null : Math.max(2, firstDays - rng.int(10, 60));
      rows.push({
        competitorId: comp.id, platform, externalId: `demo-${platform}-${serial}`,
        advertiserId: platform === 'google' ? `AR0${1_000_000 + serial}` : null,
        format: platform === 'google' ? 'text' : rng.pick(['image', 'video']),
        // Spec §4.4: exactly one ad without a title shows as "Untitled".
        title: serial === 2 ? null : copy.title,
        text: copy.text, landingUrl: `https://${comp.domain}/offers`,
        publisherPlatforms: platform === 'google' ? ['google_search'] : ['facebook', 'instagram'],
        startedAt: ctx.clock.daysAgo(firstDays), endedAt: endDays === null ? null : ctx.clock.daysAgo(endDays), isActive: active,
        firstSeenAt: ctx.clock.daysAgo(firstDays), lastSeenAt: ctx.clock.daysAgo(endDays === null ? 1 : endDays + 1),
        firstCaptureId: checks[platform].first, lastCaptureId: checks[platform].latest, endedCaptureId: endDays === null ? null : checks[platform].latest,
      });
    }
    await ctx.db.insert(ad).values(rows);
  }
}

/** The first ok ad check (200 days ago) and the latest one (yesterday) for one platform. */
async function adChecks(ctx: SeedContext, competitorId: string, source: 'google_ads' | 'meta_ads'): Promise<{ first: string; latest: string }> {
  const rows = await ctx.db.insert(capture).values([
    { competitorId, source, status: 'ok', collectorVersion: DEMO_COLLECTOR, capturedAt: ctx.clock.daysAgo(200) },
    { competitorId, source, status: 'ok', collectorVersion: DEMO_COLLECTOR, capturedAt: ctx.clock.daysAgo(1) },
  ]).returning({ id: capture.id, capturedAt: capture.capturedAt });
  const sorted = [...rows].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  return { first: sorted[0]!.id, latest: sorted[1]!.id };
}
