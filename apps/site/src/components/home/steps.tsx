import { HOME_IMAGES, HOW_STEPS, SECTIONS } from '../../../content/home';
import { ANY_INDUSTRY, INDUSTRIES } from '../../../content/industries';
import { Reveal } from '../motion/in-view';
import { HomeSectionShell, SectionHeading } from './section-heading';

/** Four numbered steps: a row from `lg`, stacked below; the numbers carry the section. */
export function Steps({ industries = true, afterSteps }: { industries?: boolean; afterSteps?: string } = {}) {
  return (
    <HomeSectionShell id="how-it-works" labelledBy="how-it-works-heading" className="border-t border-line bg-canvas py-20 lg:py-28">
      <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:gap-16">
        <SectionHeading section={SECTIONS['how-it-works']} />
        <span className="scope">
          <img src={HOME_IMAGES.street.src} alt={HOME_IMAGES.street.alt} width={1200} height={800} loading="lazy" decoding="async" className="aspect-[16/9] w-full rounded-card border border-line bg-muted-surface object-cover" />
        </span>
      </div>
      <Reveal>
        <ol className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_STEPS.map((step, i) => {
            // D14: steps are the canvas's bordered cards; the last one (the brief) is its ink card.
            const last = i === HOW_STEPS.length - 1;
            return (
              <li key={step.title} className={`rounded-frame px-6 py-7 ${last ? 'bg-ink shadow-frame' : 'border border-line bg-surface'}`}>
                <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-amber text-base font-bold tabular-nums text-amber-text">{i + 1}</span>
                <h3 className={`mt-5 text-xl font-bold ${last ? 'text-surface' : 'text-ink'}`}>{step.title}</h3>
                <p className={`mt-2 text-base ${last ? 'text-muted-surface' : 'text-ink-secondary'}`}>{step.body}</p>
              </li>
            );
          })}
        </ol>
      </Reveal>
      {afterSteps && <p className="mt-10 max-w-3xl text-lg text-ink-secondary">{afterSteps}</p>}
      {industries && (
      <div data-slot="any-industry" className="mt-16 rounded-frame border border-line bg-surface p-6 md:p-10">
        <h3 className="text-xl font-semibold text-ink">{ANY_INDUSTRY.heading}</h3>
        <p className="mt-2 max-w-2xl text-base text-ink-secondary">{ANY_INDUSTRY.body}</p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {INDUSTRIES.map((i) => (
            <li key={i.slug}>
              <a href={`/for/${i.slug}`} className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4.5 text-base font-medium text-ink hover:border-primary">{i.name}</a>
            </li>
          ))}
        </ul>
        <a href="/for" className="mt-4 inline-flex text-sm font-medium text-link hover:underline">{ANY_INDUSTRY.link}</a>
      </div>
      )}
    </HomeSectionShell>
  );
}
