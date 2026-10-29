'use client';

import { Kpi, KpiStrip } from '@cs/ui';
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
    <HomeSectionShell id="live" labelledBy="live-heading" className="py-12 lg:py-16">
      <SectionHeading section={SECTIONS.live} body={false} />
      <KpiStrip aria-label="Live platform numbers" className="mt-8">
        {shown.map((c) => (
          // Figures are rounded down by the API, so "+" says "at least".
          <Kpi key={c.key} label={c.label} value={`${number.format(c.value)}+`} caption={c.caption} />
        ))}
      </KpiStrip>
      <p className="mt-3 text-xs text-muted-ink">{SECTIONS.live.body}</p>
    </HomeSectionShell>
  );
}
