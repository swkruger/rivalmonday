import { HOME_IMAGES, HOW_STEPS, SECTIONS } from '../../../content/home';
import { ANY_INDUSTRY, INDUSTRIES } from '../../../content/industries';
import { Reveal } from '../motion/in-view';
import { HomeSectionShell, SectionHeading } from './section-heading';

/** Four numbered steps: a row from `lg`, stacked below; the numbers carry the section. */
export function Steps() {
  return (
    <HomeSectionShell id="how-it-works" labelledBy="how-it-works-heading" className="border-t border-line bg-canvas py-20 lg:py-28">
      <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:gap-16">
        <SectionHeading section={SECTIONS['how-it-works']} />
        <img src={HOME_IMAGES.street.src} alt={HOME_IMAGES.street.alt} width={1200} height={800} loading="lazy" decoding="async" className="aspect-[16/9] w-full rounded-lg border border-line bg-muted-surface object-cover" />
      </div>
      <Reveal>
        <ol className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {HOW_STEPS.map((step, i) => (
            <li key={step.title} className="border-t-2 border-secondary pt-5">
              <span aria-hidden="true" className="block text-numeral font-semibold tabular-nums text-secondary">{i + 1}</span>
              <h3 className="mt-5 text-xl font-semibold text-ink">{step.title}</h3>
              <p className="mt-2 text-base text-ink-secondary">{step.body}</p>
            </li>
          ))}
        </ol>
      </Reveal>
      <div data-slot="any-industry" className="mt-16 border-t border-line pt-8">
        <h3 className="text-xl font-semibold text-ink">{ANY_INDUSTRY.heading}</h3>
        <p className="mt-2 max-w-2xl text-base text-ink-secondary">{ANY_INDUSTRY.body}</p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {INDUSTRIES.map((i) => (
            <li key={i.slug}>
              <a href={`/for/${i.slug}`} className="inline-flex rounded-full border border-line-control bg-surface px-3 py-1 text-sm text-ink hover:border-secondary">{i.name}</a>
            </li>
          ))}
        </ul>
        <a href="/for" className="mt-4 inline-flex text-sm font-medium text-link hover:underline">{ANY_INDUSTRY.link}</a>
      </div>
    </HomeSectionShell>
  );
}
