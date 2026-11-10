'use client';

import { COMMERCIAL, planCells, PRICING_LINES, PRICING_LINES_TRIAL, SECTIONS } from '../../../content/home';
import { MarginExample } from '../partners/margin-example';
import { usePilot } from '../shell/pilot-context';
import { HomeSectionShell, SectionHeading } from './section-heading';
import { ValueCells } from './value-cells';

/** Section 10: promises left, calculator right from `lg`; under both the plan lead with three cells, then one planned line. */
export function Commercial() {
  const { pilotMode } = usePilot();
  return (
    <HomeSectionShell id="commercial" labelledBy="commercial-heading">
      <SectionHeading section={SECTIONS.commercial} />
      <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:gap-22">
        <div className="divide-y divide-line">
          {COMMERCIAL.points.map((p) => (
            <div key={p.heading} className="py-6 first:pt-0 last:pb-0">
              <h3 className="text-xl font-semibold text-ink">{p.heading}</h3>
              <p className="mt-2 text-lg leading-relaxed text-ink-secondary">{p.body}</p>
            </div>
          ))}
        </div>
        <div className="w-full max-w-xl">
          <MarginExample />
        </div>
      </div>
      <div data-slot="plan-line" className="mt-10 max-w-3xl">
        <p className="text-lg font-medium text-ink">
          {pilotMode ? <strong className="font-semibold">{PRICING_LINES.strong}</strong> : null}
          {pilotMode ? ' ' : null}
          {pilotMode ? PRICING_LINES.lead : PRICING_LINES_TRIAL.lead}
        </p>
        <div className="mt-4">
          <ValueCells cells={planCells()} />
        </div>
      </div>
      <p className="mt-10 max-w-3xl text-base text-ink-secondary">
        {COMMERCIAL.roadmapLine.text}{' '}
        <a href={COMMERCIAL.roadmapLine.link.href} className="font-medium text-link hover:underline">{COMMERCIAL.roadmapLine.link.label}</a>
      </p>
    </HomeSectionShell>
  );
}
