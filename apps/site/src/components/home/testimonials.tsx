import { TESTIMONIALS, type Testimonial } from '../../../content/testimonials';

/** Agency quotes, once there are real ones (`content/testimonials.ts`); nothing at all until then. */
export function Testimonials({ items = TESTIMONIALS }: { items?: readonly Testimonial[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="What agencies say" className="py-16 lg:py-20">
      <div className="site-container grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {items.map((t) => (
          <figure key={`${t.name}-${t.agency}`} className="flex flex-col gap-4 border-l-2 border-secondary pl-5">
            <blockquote className="text-base text-ink">&ldquo;{t.quote}&rdquo;</blockquote>
            <figcaption className="text-sm text-ink-secondary">
              <span className="font-semibold text-ink">{t.name}</span>, {t.role} · {t.agency}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
