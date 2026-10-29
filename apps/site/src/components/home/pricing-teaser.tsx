import { PRICING_LINES, SECTIONS } from '../../../content/home';
import { JoinButton } from '../join/join-button';
import { HomeSectionShell, SectionHeading } from './section-heading';

/** Two plain columns, no cards. Every figure comes from `PRICING` through `PRICING_LINES`. */
export function PricingTeaser() {
  return (
    <HomeSectionShell id="pricing" labelledBy="pricing-heading" className="border-t border-line py-16 lg:py-20">
      <SectionHeading section={SECTIONS.pricing} />
      <div className="mt-8 grid gap-6 border-t border-line pt-6 md:grid-cols-2 md:gap-12">
        <p data-slot="pricing-agency" className="text-base text-ink">{PRICING_LINES.agency}</p>
        <p data-slot="pricing-business" className="text-base text-ink">{PRICING_LINES.business}</p>
      </div>
      <div className="mt-8">
        <JoinButton>Join the pilot</JoinButton>
      </div>
    </HomeSectionShell>
  );
}
