import { OPPORTUNITY, opportunityLine, SECTIONS } from '../../../content/home';
import { HomeSectionShell, SectionHeading } from './section-heading';

/** §4: body, three outcome columns, then the one grey economics strip. */
export function Opportunity() {
  const section = SECTIONS.opportunity;
  return (
    <HomeSectionShell id={section.id} labelledBy={`${section.id}-heading`} className="border-t border-line bg-surface py-20 lg:py-28">
      <SectionHeading section={section} />
      <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
        {OPPORTUNITY.outcomes.map((o) => (
          <div key={o.lead} className="border-t-2 border-secondary pt-5">
            <h3 className="text-xl font-semibold text-ink">{o.lead}</h3>
            <p className="mt-2 text-base text-ink-secondary">{o.body}</p>
          </div>
        ))}
      </div>
      <div className="mt-12 max-w-3xl rounded-card bg-muted-surface p-6">
        <p className="text-base tabular-nums text-ink">{opportunityLine()}</p>
        <p className="mt-2 text-sm text-ink-secondary">{OPPORTUNITY.exampleNote}</p>
        <a href={OPPORTUNITY.link.href} className="mt-4 inline-flex text-sm font-medium text-link hover:underline">{OPPORTUNITY.link.label}</a>
      </div>
    </HomeSectionShell>
  );
}
