import { PRICING_FAQ } from '../../../content/pricing-page';

/** Native `<details>`; the same list feeds the page's FAQPage JSON-LD, so visible and structured text cannot drift. */
export function Faq() {
  return (
    <div className="divide-y divide-line border-y border-line">
      {PRICING_FAQ.map((f) => (
        <details key={f.ledger} className="py-4">
          <summary className="cursor-pointer text-base font-semibold text-ink">{f.q}</summary>
          <p className="mt-2 text-base leading-relaxed text-ink-secondary">{f.a}</p>
          {f.link ? (
            <p className="mt-2 text-sm">
              <a href={f.link.href} className="text-secondary hover:underline">{f.link.label}</a>
            </p>
          ) : null}
        </details>
      ))}
    </div>
  );
}
