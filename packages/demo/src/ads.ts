import { ad, capture } from '@cs/db';
import { adItemIds, EVENT_SPECS } from './changes';
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

/** Spec §4.4: ~30 ads. 16 are fixed by the ad events in EVENT_SPECS (same competitor, platform, count, timing and external id); the rest are random filler. */
export async function seedAds(ctx: SeedContext): Promise<void> {
  const rng = ctx.rng('ads');
  const { clock } = ctx;
  const pending: { comp: DemoCompetitor; row: Omit<typeof ad.$inferInsert, 'firstCaptureId' | 'lastCaptureId' | 'endedCaptureId'>; ended: boolean }[] = [];
  for (const spec of EVENT_SPECS) {
    if (spec.type !== 'ad_started' && spec.type !== 'ad_stopped') continue;
    const comp = ctx.ids.competitors[spec.client][spec.comp]!;
    const platform = spec.source === 'google_ads' ? 'google' : 'meta';
    const at = spec.days + 0.25;
    for (const externalId of adItemIds(spec)) {
      const copy = AD_COPY[pending.length % AD_COPY.length]!;
      const started = spec.type === 'ad_started';
      const firstAgo = started ? at : at + rng.int(20, 100);
      pending.push({
        comp, ended: !started,
        row: {
          competitorId: comp.id, platform, externalId, advertiserId: platform === 'google' ? `AR0${1_000_000 + pending.length}` : null,
          format: platform === 'google' ? 'text' : rng.pick(['image', 'video']), title: copy.title, text: copy.text, landingUrl: `https://${comp.domain}/offers`,
          publisherPlatforms: platform === 'google' ? ['google_search'] : ['facebook', 'instagram'],
          startedAt: clock.daysAgo(firstAgo), firstSeenAt: clock.daysAgo(firstAgo),
          endedAt: started ? null : clock.daysAgo(at), isActive: started, lastSeenAt: started ? clock.daysAgo(1) : clock.daysAgo(at + 0.5),
        },
      });
    }
  }
  const have = new Map<string, number>();
  for (const p of pending) have.set(p.comp.id, (have.get(p.comp.id) ?? 0) + 1);
  const targets: [DemoCompetitor, number][] = [
    ...ctx.ids.competitors.loneStar.filter((c) => c.id !== ctx.ids.noData.ads).map((c): [DemoCompetitor, number] => [c, 4]),
    ...ctx.ids.competitors.brazos.map((c, i): [DemoCompetitor, number] => [c, i % 2 === 0 ? 3 : 2]),
  ];
  let serial = 0;
  let untitledDone = false;
  for (const [comp, n] of targets) {
    for (let k = have.get(comp.id) ?? 0; k < n; k++) {
      serial++;
      const platform = k % 2 === 0 ? 'google' : 'meta';
      const copy = AD_COPY[(serial * 5) % AD_COPY.length]!;
      const firstDays = rng.int(5, 170);
      const active = rng.chance(0.6);
      const endDays = active ? null : Math.max(2, firstDays - rng.int(10, 60));
      const untitled = !untitledDone;
      untitledDone = true;
      pending.push({
        comp, ended: !active,
        row: {
          competitorId: comp.id, platform, externalId: `demo-${platform}-${serial}`,
          advertiserId: platform === 'google' ? `AR0${2_000_000 + serial}` : null,
          format: platform === 'google' ? 'text' : rng.pick(['image', 'video']),
          // Spec §4.4: exactly one ad without a title shows as "Untitled".
          title: untitled ? null : copy.title,
          text: copy.text, landingUrl: `https://${comp.domain}/offers`,
          publisherPlatforms: platform === 'google' ? ['google_search'] : ['facebook', 'instagram'],
          startedAt: clock.daysAgo(firstDays), endedAt: endDays === null ? null : clock.daysAgo(endDays), isActive: active,
          firstSeenAt: clock.daysAgo(firstDays), lastSeenAt: clock.daysAgo(endDays === null ? 1 : endDays + 1),
        },
      });
    }
  }
  const byComp = new Map<string, typeof pending>();
  for (const p of pending) byComp.set(p.comp.id, [...(byComp.get(p.comp.id) ?? []), p]);
  for (const [competitorId, list] of byComp) {
    const checks = { google: await adChecks(ctx, competitorId, 'google_ads'), meta: await adChecks(ctx, competitorId, 'meta_ads') };
    await ctx.db.insert(ad).values(list.map(({ row, ended }) => {
      const c = checks[row.platform as 'google' | 'meta'];
      return { ...row, firstCaptureId: c.first, lastCaptureId: c.latest, endedCaptureId: ended ? c.latest : null };
    }));
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
