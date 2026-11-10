import { OPPORTUNITY, opportunityCells, SECTIONS } from '../../../content/home';
import { HomeSectionShell } from './section-heading';
import { ValueCells } from './value-cells';

/** §4: heading beside the body (from `lg`), three outcome columns, then the one grey economics strip. */
export function Opportunity() {
  const section = SECTIONS.opportunity;
  return (
    <HomeSectionShell id={section.id} labelledBy={`${section.id}-heading`} className="border-t border-line bg-surface">
      <div className="grid gap-6 lg:grid-cols-12 lg:gap-16">
        <h2 id={`${section.id}-heading`} className="text-section font-semibold text-ink lg:col-span-5">
          {section.heading}
        </h2>
        <p className="text-lg text-ink-secondary lg:col-span-7 lg:pt-2">{section.body}</p>
      </div>
      <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
        {OPPORTUNITY.outcomes.map((o) => (
          <div key={o.lead} className="border-t-2 border-secondary pt-5">
            <h3 className="text-xl font-semibold text-ink">{o.lead}</h3>
            <p className="mt-2 text-base text-ink-secondary">{o.body}</p>
          </div>
        ))}
      </div>
      <div className="mt-12 max-w-3xl rounded-card bg-muted-surface p-6">
        <p className="mb-4 text-sm font-medium text-ink-secondary">{OPPORTUNITY.exampleLabel}</p>
        <ValueCells cells={opportunityCells()} />
        <p className="mt-5 text-sm text-ink-secondary">{OPPORTUNITY.exampleNote}</p>
        <a href={OPPORTUNITY.link.href} className="mt-4 inline-flex text-sm font-medium text-link hover:underline">{OPPORTUNITY.link.label}</a>
      </div>
    </HomeSectionShell>
  );
}
