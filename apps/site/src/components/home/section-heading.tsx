import type { HomeSection } from '../../../content/home';

/** One home section: anchored (`id`), clear of the sticky header, with the shared page gutter. `pad={false}` leaves the vertical padding to the caller. */
export function HomeSectionShell({ id, labelledBy, className, pad = true, children }: { id: string; labelledBy?: string; className?: string; pad?: boolean; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={`scroll-mt-20 ${pad ? 'py-14 lg:py-18' : ''} ${className ?? ''}`.trim()}>
      <div className="site-container">{children}</div>
    </section>
  );
}

/** `h2` + body. An empty body renders no paragraph; `body={false}` leaves it out (the section prints it elsewhere). */
export function SectionHeading({ section, body = true }: { section: HomeSection; body?: boolean }) {
  return (
    <div className="max-w-3xl">
      <h2 id={`${section.id}-heading`} className="text-section font-semibold text-ink">
        {section.heading}
      </h2>
      {body && section.body && <p className="mt-4 max-w-2xl text-lg text-ink-secondary">{section.body}</p>}
    </div>
  );
}
