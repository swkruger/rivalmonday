import { FridayAvatar } from '@cs/ui';
import { CAST, SECTIONS } from '../../../content/home';
import { HomeSectionShell, SectionHeading } from './section-heading';

/** §5: three plain columns. Only Friday carries the (amber) avatar. */
export function Cast() {
  const section = SECTIONS.cast;
  return (
    <HomeSectionShell id={section.id} labelledBy={`${section.id}-heading`} className="border-t border-line bg-canvas py-20 lg:py-28">
      <SectionHeading section={section} />
      <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
        {CAST.map((c) => (
          <div key={c.name} data-cast={c.name} className="border-t border-line pt-5">
            <div className="flex items-center gap-3">
              {c.name === 'Friday' && <FridayAvatar />}
              <h3 className="text-xl font-semibold text-ink">{c.name}</h3>
            </div>
            <p className="mt-2 max-w-2xl text-base text-ink-secondary">{c.body}</p>
          </div>
        ))}
      </div>
    </HomeSectionShell>
  );
}
