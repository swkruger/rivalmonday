import { capture, pricePoint, type PriceQualifier } from '@cs/db';
import { DAY } from './clock';
import type { SeedContext } from './context';
import type { ActiveClientKey, DemoCompetitor } from './ids';
import type { Rng } from './random';
import { DEMO_COLLECTOR } from './tenancy';

export interface PricedService {
  id: string;
  label: string;
  base: number;
  qualifier: PriceQualifier;
}

/** Spec §4.3: 8 services, HVAC for Lone Star's competitors and plumbing for Brazos's. */
export const PRICED_SERVICES: { hvac: PricedService[]; plumbing: PricedService[] } = {
  hvac: [
    { id: 'ac_tune_up', label: 'AC tune-up', base: 89, qualifier: 'exact' },
    { id: 'furnace_tune_up', label: 'Furnace tune-up', base: 99, qualifier: 'exact' },
    { id: 'ac_repair', label: 'AC repair diagnostic', base: 89, qualifier: 'from' },
    { id: 'duct_cleaning', label: 'Duct cleaning', base: 299, qualifier: 'exact' },
  ],
  plumbing: [
    { id: 'drain_cleaning', label: 'Drain cleaning', base: 149, qualifier: 'exact' },
    { id: 'water_heater', label: 'Water heater install', base: 1200, qualifier: 'from' },
    { id: 'sewer_line', label: 'Sewer camera inspection', base: 229, qualifier: 'exact' },
    { id: 'emergency_service', label: '24/7 emergency call-out', base: 179, qualifier: 'exact' },
  ],
};

interface Span {
  amount: number;
  fromDays: number;
  /** null = still shown. */
  toDays: number | null;
  promo?: boolean;
}

/** Prices end in 9 ($89, $1,319). */
export const round9 = (n: number): number => Math.max(9, Math.round((n + 1) / 10) * 10 - 1);

/** `client:competitorIndex:service` → spans matching the price events in changes.ts (days + 0.25), plus the gap on purpose. */
const FIXED: Record<string, Span[]> = {
  'loneStar:0:ac_tune_up': [{ amount: 109, fromDays: 360, toDays: 84.25 }, { amount: 99, fromDays: 84.25, toDays: 1.25 }, { amount: 79, fromDays: 1.25, toDays: null, promo: true }],
  'loneStar:0:furnace_tune_up': [{ amount: 109, fromDays: 360, toDays: 5.25 }, { amount: 89, fromDays: 5.25, toDays: null }],
  // Price event at 31 days (89 -> 99), then the "$59 AC tune-up special" promo event at 2 days.
  'loneStar:1:ac_tune_up': [{ amount: 89, fromDays: 360, toDays: 31.25 }, { amount: 99, fromDays: 31.25, toDays: 2.25 }, { amount: 59, fromDays: 2.25, toDays: null, promo: true }],
  // The "$199 whole-home duct cleaning" promo event at 25 days.
  'loneStar:0:duct_cleaning': [{ amount: 299, fromDays: 360, toDays: 25.25 }, { amount: 199, fromDays: 25.25, toDays: null, promo: true }],
  'loneStar:2:ac_repair': [{ amount: 89, fromDays: 360, toDays: 12.25 }, { amount: 69, fromDays: 12.25, toDays: null }],
  'loneStar:3:ac_repair': [{ amount: 129, fromDays: 360, toDays: 52.25 }, { amount: 99, fromDays: 52.25, toDays: null }],
  'brazos:0:drain_cleaning': [{ amount: 149, fromDays: 360, toDays: 2.25 }, { amount: 119, fromDays: 2.25, toDays: null }],
  'brazos:0:emergency_service': [{ amount: 179, fromDays: 360, toDays: 64.25 }, { amount: 149, fromDays: 64.25, toDays: null }],
  'brazos:1:sewer_line': [{ amount: 199, fromDays: 360, toDays: 21.25 }, { amount: 229, fromDays: 21.25, toDays: null }],
  // Spec §4.3 gap on purpose: last seen two months ago, nothing since.
  'brazos:2:sewer_line': [{ amount: 239, fromDays: 360, toDays: 180 }, { amount: 219, fromDays: 180, toDays: 60 }],
};

function randomSeries(rng: Rng, base: number): Span[] {
  let amount = round9(base * rng.between(0.85, 1.15));
  const changes = [300, 240, 180, 120, 60].filter(() => rng.chance(0.3)).slice(0, 2);
  const spans: Span[] = [];
  let from = 360;
  for (const d of changes) {
    spans.push({ amount, fromDays: from, toDays: d });
    amount = round9(amount * rng.pick([0.85, 0.9, 1.1, 1.15]));
    from = d;
  }
  spans.push({ amount, fromDays: from, toDays: null, promo: rng.chance(0.15) });
  return spans;
}

async function seedCompetitorPrices(ctx: SeedContext, client: ActiveClientKey, index: number, comp: DemoCompetitor, services: PricedService[], rng: Rng): Promise<void> {
  const pageId = ctx.ids.pages[comp.id]!.pricing;
  const url = `https://${comp.domain}/pricing`;
  const made = new Map<number, string>();
  const captureAt = async (at: Date): Promise<string> => {
    const hit = made.get(at.getTime());
    if (hit) return hit;
    const [c] = await ctx.db.insert(capture).values({ competitorId: comp.id, trackedPageId: pageId, source: 'web', url, status: 'ok', httpStatus: 200, collectorVersion: DEMO_COLLECTOR, capturedAt: at }).returning({ id: capture.id });
    made.set(at.getTime(), c!.id);
    return c!.id;
  };
  const latestAt = ctx.clock.daysAgo(0.5);
  const rows: (typeof pricePoint.$inferInsert)[] = [];
  for (const s of services) {
    const spans = FIXED[`${client}:${index}:${s.id}`] ?? randomSeries(rng, s.base);
    for (const span of spans) {
      const from = ctx.clock.daysAgo(span.fromDays);
      const to = span.toDays === null ? null : ctx.clock.daysAgo(span.toDays);
      const firstCaptureId = await captureAt(from);
      const text = `${s.label} ${s.qualifier === 'from' ? 'from ' : ''}$${span.amount.toLocaleString('en-US')}`;
      rows.push({
        competitorId: comp.id, trackedPageId: pageId, verticalId: 'hvac_plumbing', serviceId: s.id, amount: span.amount, unit: 'USD', qualifier: s.qualifier,
        promo: span.promo ?? false, raw: `$${span.amount.toLocaleString('en-US')}`, context: text,
        firstSeenAt: from, lastSeenAt: to ? new Date(Math.max(from.getTime(), to.getTime() - DAY)) : latestAt,
        firstCaptureId, lastCaptureId: to ? firstCaptureId : await captureAt(latestAt),
        endedAt: to, endedCaptureId: to ? await captureAt(to) : null,
      });
    }
  }
  if (rows.length) await ctx.db.insert(pricePoint).values(rows);
}

/** Spec §4.3. */
export async function seedPricing(ctx: SeedContext): Promise<void> {
  const rng = ctx.rng('pricing');
  for (const [i, comp] of ctx.ids.competitors.loneStar.entries()) {
    if (comp.id === ctx.ids.noData.pricing) continue;
    await seedCompetitorPrices(ctx, 'loneStar', i, comp, PRICED_SERVICES.hvac, rng);
  }
  for (const [i, comp] of ctx.ids.competitors.brazos.entries()) await seedCompetitorPrices(ctx, 'brazos', i, comp, PRICED_SERVICES.plumbing, rng);
}
