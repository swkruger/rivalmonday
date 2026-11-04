'use client';

import { COMMERCIAL, PRICING_LINES, PRICING_LINES_TRIAL, SECTIONS } from '../../../content/home';
import { MarginExample } from '../partners/margin-example';
import { usePilot } from '../shell/pilot-context';
import { HomeSectionShell, SectionHeading } from './section-heading';

/** Section 10: brand, price and billing in the /partners row style, then the plan line, the calculator and one planned line. */
export function Commercial() {
  const { pilotMode } = usePilot();
  const plan = (pilotMode ? PRICING_LINES : PRICING_LINES_TRIAL).agency;
  return (
    <HomeSectionShell id="commercial" labelledBy="commercial-heading">
      <SectionHeading section={SECTIONS.commercial} />
      <div className="mt-10 max-w-[1100px] divide-y divide-line">
        {COMMERCIAL.points.map((p) => (
          <div key={p.heading} className="grid gap-3 py-8 first:pt-0 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-10 lg:py-10">
            <h3 className="text-xl font-semibold text-ink">{p.heading}</h3>
            <p className="text-lg leading-relaxed text-ink-secondary">{p.body}</p>
          </div>
        ))}
      </div>
      <p data-slot="plan-line" className="mt-8 max-w-3xl text-lg font-medium text-ink">{plan}</p>
      <div className="mt-8 max-w-xl">
        <MarginExample />
      </div>
      <p className="mt-10 max-w-3xl text-base text-ink-secondary">
        {COMMERCIAL.roadmapLine.text}{' '}
        <a href={COMMERCIAL.roadmapLine.link.href} className="font-medium text-link hover:underline">{COMMERCIAL.roadmapLine.link.label}</a>
      </p>
    </HomeSectionShell>
  );
}
