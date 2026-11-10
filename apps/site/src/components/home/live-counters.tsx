'use client';

import { COUNTER_LABELS, SECTIONS } from '../../../content/home';
import { usePilot } from '../shell/pilot-context';
import { HomeSectionShell, SectionHeading } from './section-heading';

const KEY_MAP = {
  rivalsWatched: 'rivalSitesWatched',
  snapshots: 'snapshotsThisWeek',
  claimsChecked: 'claimsChecked',
  claimsDropped: 'claimsDropped',
} as const;

const number = new Intl.NumberFormat('en-US');

/** The live band. Nothing (no skeleton) while loading, on a degraded answer, or when every counter is null; a null counter is omitted. */
export function LiveCounters() {
  const { status } = usePilot();
  const counters = status?.counters;
  if (!counters) return null;
  const shown = COUNTER_LABELS.flatMap((c) => {
    const value = counters[KEY_MAP[c.key]];
    return value === null || value === undefined ? [] : [{ ...c, value }];
  });
  if (shown.length === 0) return null;
  return (
    <HomeSectionShell id="live" labelledBy="live-heading" className="py-20 lg:py-28">
      <SectionHeading section={SECTIONS.live} body={false} />
      <div role="group" aria-label="Live platform numbers" className="mt-12 grid grid-cols-2 gap-x-6 gap-y-10 lg:auto-cols-fr lg:grid-flow-col lg:grid-cols-none">
        {shown.map((c) => (
          // Figures are rounded down by the API, so "+" says "at least".
          <div key={c.key} data-slot="kpi" className="min-w-0">
            <div className="text-numeral font-semibold tabular-nums text-ink">{number.format(c.value)}+</div>
            <div className="mt-3 text-sm font-medium text-ink">{c.label}</div>
            <div className="mt-0.5 text-13 text-muted-ink">{c.caption}</div>
          </div>
        ))}
      </div>
      <p className="mt-8 text-xs text-muted-ink">{SECTIONS.live.body}</p>
    </HomeSectionShell>
  );
}
