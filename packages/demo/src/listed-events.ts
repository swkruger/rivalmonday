import { GBP_EVENTS_URL } from '@cs/collectors';
import { capture, type ListedEventSource, listedEvent, type ListedEventStatus } from '@cs/db';
import type { SeedContext } from './context';
import { putEvidence } from './evidence';
import { DEMO_COLLECTOR } from './tenancy';

interface DemoEvent { name: string; inDays: number; hour: number; status?: ListedEventStatus; ticketed?: boolean; url: string | null }

/** Three upcoming events of Lone Star's first rival: one ticketed, one cancelled (a website says so), one plain. Dates are relative to the demo clock. */
const EVENTS: DemoEvent[] = [
  { name: 'Spring Tune-Up Open House', inDays: 3, hour: 10, url: 'https://{domain}/events/open-house' },
  { name: 'HVAC Careers Night', inDays: 8, hour: 18, ticketed: true, url: 'https://{domain}/events/careers-night' },
  { name: 'Customer Appreciation BBQ', inDays: 14, hour: 12, status: 'cancelled', url: null },
];

const dayOf = (d: Date) => d.toISOString().slice(0, 10);

/** 18d: one Events page with data. The rival's events come from one Google panel capture (its stored JSON is the evidence) and, for the website ones, the same capture row stands in for the page read. */
export async function seedListedEvents(ctx: SeedContext): Promise<void> {
  const rival = ctx.ids.competitors.loneStar[0]!;
  const at = ctx.clock.daysAgo(2);
  const [cap] = await ctx.db.insert(capture).values({
    competitorId: rival.id, source: 'google_business_profile', url: GBP_EVENTS_URL, status: 'ok', collectorVersion: DEMO_COLLECTOR, capturedAt: at,
  }).returning({ id: capture.id });
  const rows = EVENTS.map((e) => {
    const start = ctx.clock.daysAgo(-e.inDays);
    start.setUTCHours(e.hour, 0, 0, 0);
    return { ...e, start, url: e.url?.replace('{domain}', rival.domain) ?? null };
  });
  await putEvidence(ctx, {
    captureId: cap!.id, competitorId: rival.id, kind: 'vendor_json', contentType: 'application/json',
    body: new TextEncoder().encode(JSON.stringify({ panel: rival.name, events: rows.map((r) => ({ title: r.name, date: dayOf(r.start), time: r.start.toISOString() })) }, null, 2)),
  });
  await ctx.db.insert(listedEvent).values(rows.map((r) => ({
    competitorId: rival.id, eventKey: `demo:${dayOf(r.start)}:${r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name: r.name, nameNorm: r.name.toLowerCase(),
    startDate: dayOf(r.start), startsAt: r.start, status: r.status ?? 'scheduled',
    sources: (r.status === 'cancelled' ? ['web'] : ['google_panel']) as ListedEventSource[], url: r.url, ticketed: r.ticketed ?? false,
    firstCaptureId: cap!.id, lastCaptureId: cap!.id, firstSeenAt: at, lastSeenAt: at,
    ...(r.status === 'cancelled' ? { statusCaptureId: cap!.id, statusChangedAt: at } : {}),
  })));
}
