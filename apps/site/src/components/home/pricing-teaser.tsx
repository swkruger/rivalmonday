'use client';

import { StatusChip } from '@cs/ui';
import { PRICING_HEADING_TRIAL, PRICING_LINES, PRICING_LINES_TRIAL, SECTIONS } from '../../../content/home';
import { PRICING } from '../../../content/pricing';
import { usePilot } from '../shell/pilot-context';
import { HomeSectionShell, SectionHeading } from './section-heading';

/**
 * Two plan blocks, no cards: who it is for, the monthly price large, then the full sentence. Every figure comes from
 * `PRICING` (directly or through `PRICING_LINES` / `PRICING_LINES_TRIAL`). During the pilot each block says it is
 * free. No button here: the closing band right below carries the page's last call to action.
 */
export function PricingTeaser() {
  const { pilotMode } = usePilot();
  const lines = pilotMode ? PRICING_LINES : PRICING_LINES_TRIAL;
  const section = pilotMode ? SECTIONS.pricing : { ...SECTIONS.pricing, heading: PRICING_HEADING_TRIAL };
  const plans = [
    { slot: 'pricing-agency', who: 'Agencies', price: PRICING.agency.monthlyUsd, line: lines.agency },
    { slot: 'pricing-business', who: 'Local businesses', price: PRICING.business.monthlyUsd, line: lines.business },
  ];
  return (
    <HomeSectionShell id="pricing" labelledBy="pricing-heading" className="border-t border-line py-16 lg:py-20">
      <SectionHeading section={section} />
      <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-2">
        {plans.map((p) => (
          <div key={p.slot} className="flex flex-col gap-3 bg-surface p-6 md:p-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">{p.who}</p>
              {pilotMode && <StatusChip tone="info">Free during the pilot</StatusChip>}
            </div>
            <p className="flex items-baseline gap-1 text-ink">
              <span className="text-4xl font-semibold tracking-tight tabular-nums">${p.price}</span>
              <span className="text-sm text-ink-secondary">/mo{pilotMode ? ' after the pilot' : ''}</span>
            </p>
            <p data-slot={p.slot} className="text-sm text-ink-secondary">{p.line}</p>
          </div>
        ))}
      </div>
    </HomeSectionShell>
  );
}
