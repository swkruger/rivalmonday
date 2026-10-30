import { faqPageLd } from '../../lib/json-ld';
import { JsonLd } from './json-ld';

/**
 * Questions and answers as native disclosure rows (the answers stay in the HTML, so search engines read them even
 * while collapsed) plus matching `FAQPage` JSON-LD. Server component: no script needed to open a row.
 */
export function FaqBlock({ title = 'Questions agencies ask', items }: { title?: string; items: readonly { q: string; a: string }[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="faq-heading" className="mt-12">
      <h2 id="faq-heading" className="text-xl font-semibold text-ink">{title}</h2>
      <div className="mt-3 divide-y divide-line border-y border-line">
        {items.map((f) => (
          <details key={f.q} className="group py-1">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-2 text-base font-medium text-ink [&::-webkit-details-marker]:hidden">
              {f.q}
              <span aria-hidden="true" className="text-xl leading-none text-secondary transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="pb-3 text-base leading-relaxed text-ink-secondary">{f.a}</p>
          </details>
        ))}
      </div>
      <JsonLd data={faqPageLd(items)} />
    </section>
  );
}
