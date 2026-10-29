import { HOW_STEPS, SECTIONS } from '../../../content/home';
import { HomeSectionShell, SectionHeading } from './section-heading';

/** Four numbered steps: a row from `lg`, a vertical rail below. */
export function Steps() {
  return (
    <HomeSectionShell id="how-it-works" labelledBy="how-it-works-heading" className="border-t border-line bg-canvas py-16 lg:py-20">
      <SectionHeading section={SECTIONS['how-it-works']} />
      <ol className="mt-10 grid gap-8 lg:grid-cols-4 lg:gap-6">
        {HOW_STEPS.map((step, i) => (
          <li key={step.title} className="relative flex gap-4 lg:flex-col lg:gap-3">
            {i < HOW_STEPS.length - 1 && (
              <span aria-hidden="true" className="absolute bottom-[-2rem] left-4 top-10 w-px bg-line lg:bottom-auto lg:left-11 lg:top-4 lg:h-px lg:w-[calc(100%-1.25rem)]" />
            )}
            <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-secondary bg-surface text-sm font-semibold text-secondary">
              {i + 1}
            </span>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-ink">{step.title}</h3>
              <p className="mt-1 text-sm text-ink-secondary">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </HomeSectionShell>
  );
}
