import type { WorkspaceOverview } from '@cs/tools';
import { formatDate, formatWeekOf } from '@/lib/format';

export interface Pill {
  text: string;
  tone: 'up' | 'down' | 'warn' | 'info';
}
export interface KpiCard {
  title: string;
  value: string;
  pill: Pill | null;
  hint: string;
}

const signed = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

function adsPill(now: number | null, before: number | null): Pill | null {
  if (now === null || before === null) return null;
  const d = now - before;
  return { text: d === 0 ? 'Same as last week' : `${signed(d)} vs last week`, tone: 'info' };
}

function ratingPill(self: number | null, avg: number | null): Pill | null {
  if (self === null || avg === null) return null;
  const d = Math.round((self - avg) * 10) / 10;
  if (d > 0) return { text: `+${d} above avg`, tone: 'up' };
  if (d < 0) return { text: `−${Math.abs(d)} below avg`, tone: 'down' };
  return { text: 'On par with the area', tone: 'info' };
}

/**
 * The four Overview KPI cards (mockup 01). Pure: every missing figure degrades to "—" with an honest hint. The
 * "add your Place ID" hint is for agency roles only — client users can't edit the profile.
 */
export function kpiCards(o: WorkspaceOverview, { agency }: { agency: boolean }): KpiCard[] {
  return [
    {
      title: 'Changes this week',
      value: String(o.changes7d),
      pill: o.alerts7d > 0 ? { text: `${o.alerts7d} high`, tone: 'warn' } : null,
      hint: 'Across websites, ads, reviews and profiles',
    },
    {
      title: 'Competitor price moves',
      value: String(o.priceMoves7d),
      pill: o.priceCuts7d > 0 ? { text: `↓ ${o.priceCuts7d} ${o.priceCuts7d === 1 ? 'cut' : 'cuts'}`, tone: 'down' } : null,
      hint: 'On services you also offer',
    },
    {
      title: 'Active competitor ads',
      value: o.activeAds === null ? '—' : String(o.activeAds),
      pill: adsPill(o.activeAds, o.activeAds7dAgo),
      hint: o.activeAds === null ? 'The first weekly ad check fills this in' : 'Meta and Google, where visible',
    },
    {
      title: 'Your rating vs area',
      value: o.rating.self === null ? '—' : `${o.rating.self} ★`,
      pill: ratingPill(o.rating.self, o.rating.competitorAverage),
      hint:
        o.rating.self === null
          ? agency
            ? 'Add your Google Place ID to compare'
            : 'Not available yet'
          : o.rating.competitorAverage === null
            ? 'No competitor ratings yet'
            : `Competitor average ${o.rating.competitorAverage}`,
    },
  ];
}

/**
 * The brief the Overview treats as latest: most recent `generatedAt` (fallback `deliveryDate`); ties keep list order.
 * Weekly briefs carry next Monday's date, so ordering by delivery date alone would hide a newer starting point.
 */
export function latestBrief<T extends { generatedAt: string | null; deliveryDate: string }>(items: readonly T[]): { latest: T | null; rest: T[] } {
  const stamp = (b: T): number => Date.parse(b.generatedAt ?? b.deliveryDate);
  let best = -1;
  items.forEach((b, i) => {
    if (best < 0 || stamp(b) > stamp(items[best]!)) best = i;
  });
  if (best < 0) return { latest: null, rest: [] };
  return { latest: items[best]!, rest: items.filter((_, i) => i !== best) };
}

/** Header-line label for the brief shown on the Overview (without the leading separator). */
export const briefLabel = (b: { kind: string; deliveryDate: string }): string =>
  b.kind === 'starting_point' ? `Starting point · ${formatDate(b.deliveryDate, { tz: 'UTC' })}` : `Brief · ${formatWeekOf(b.deliveryDate, { tz: 'UTC' })}`;
