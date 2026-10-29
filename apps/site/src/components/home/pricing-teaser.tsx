'use client';

import { PRICING_HEADING_TRIAL, PRICING_LINES, PRICING_LINES_TRIAL, SECTIONS } from '../../../content/home';
import { JoinButton } from '../join/join-button';
import { usePilot } from '../shell/pilot-context';
import { HomeSectionShell, SectionHeading } from './section-heading';

/** Two plain columns, no cards. Every figure comes from `PRICING` through `PRICING_LINES` / `PRICING_LINES_TRIAL`. */
export function PricingTeaser() {
  const { pilotMode } = usePilot();
  const lines = pilotMode ? PRICING_LINES : PRICING_LINES_TRIAL;
  const section = pilotMode ? SECTIONS.pricing : { ...SECTIONS.pricing, heading: PRICING_HEADING_TRIAL };
  return (
    <HomeSectionShell id="pricing" labelledBy="pricing-heading" className="border-t border-line py-16 lg:py-20">
      <SectionHeading section={section} />
      <div className="mt-8 grid gap-6 border-t border-line pt-6 md:grid-cols-2 md:gap-12">
        <p data-slot="pricing-agency" className="text-base text-ink">{lines.agency}</p>
        <p data-slot="pricing-business" className="text-base text-ink">{lines.business}</p>
      </div>
      <div className="mt-8">
        <JoinButton>Join the pilot</JoinButton>
      </div>
    </HomeSectionShell>
  );
}
