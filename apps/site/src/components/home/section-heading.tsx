import type { HomeSection } from '../../../content/home';

/** One home section: anchored (`id`), clear of the sticky header, with the shared page gutter. */
export function HomeSectionShell({ id, labelledBy, className, children }: { id: string; labelledBy?: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={`scroll-mt-20 ${className ?? 'py-16 lg:py-20'}`}>
      <div className="site-container">{children}</div>
    </section>
  );
}

/** Eyebrow + `h2` + body. An empty body renders no paragraph; `body={false}` leaves it out (the section prints it elsewhere). */
export function SectionHeading({ section, body = true }: { section: HomeSection; body?: boolean }) {
  return (
    <div className="max-w-3xl">
      <p className="text-13 font-medium text-secondary">{section.eyebrow}</p>
      <h2 id={`${section.id}-heading`} className="mt-2 text-3xl font-semibold tracking-tight text-ink">
        {section.heading}
      </h2>
      {body && section.body && <p className="mt-3 text-base text-ink-secondary">{section.body}</p>}
    </div>
  );
}
