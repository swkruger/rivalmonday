export type FaqItem = { q: string; a: string; link?: { href: string; label: string } };

/** Native `<details>`; the same list feeds the page's FAQPage JSON-LD, so visible and structured text cannot drift. */
export function Faq({ items, heading }: { items: readonly FaqItem[]; heading: string }) {
  return (
    <section className="site-container border-t border-line py-16" aria-labelledby="faq-heading">
      <div className="max-w-[720px]">
        <h2 id="faq-heading" className="text-2xl font-semibold tracking-tight text-ink">{heading}</h2>
        <div className="mt-6 divide-y divide-line border-y border-line">
          {items.map((f) => (
            <details key={f.q} className="py-4">
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
      </div>
    </section>
  );
}
