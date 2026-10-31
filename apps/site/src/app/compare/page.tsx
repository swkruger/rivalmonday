import { COMPARE_COPY, enabledRivals } from '../../../content/compare';
import { CategoryTable } from '../../components/compare/category-table';
import { CtaBand } from '../../components/home/cta-band';
import { PageIntro } from '../../components/seo/page-intro';
import { pageMetadata } from '../../lib/metadata';

export const metadata = pageMetadata('/compare');

// Draft copy: owner + counsel sign.
const HUB = {
  eyebrow: 'Compare',
  h1: 'How Rival Monday compares',
  lead: 'Tools for watching local competitors fall into a few groups. Here is how each group typically works, next to Rival Monday.',
  note: 'The other columns describe what such tools typically do, not any one product.',
  named: 'Named comparisons',
};

export default function CompareHub() {
  const rivals = enabledRivals();
  return (
    <main>
      <section className="site-container py-16 lg:py-20">
        <div className="max-w-[1200px]">
          <div className="max-w-[720px]">
            <PageIntro path="/compare" eyebrow={HUB.eyebrow} h1={HUB.h1} lead={HUB.lead} />
          </div>
          <CategoryTable />
          <p className="mt-6 text-13 text-muted-ink">{HUB.note}</p>
          {rivals.length > 0 ? (
            <div className="mt-12">
              <h2 className="text-xl font-semibold text-ink">{HUB.named}</h2>
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {rivals.map((r) => (
                  <li key={r.slug}>
                    <a href={`/compare/${r.slug}`} className="block py-4 hover:underline">
                      <span className="block text-base font-semibold text-ink">Rival Monday vs {r.name}</span>
                      <span className="mt-1 block text-sm text-ink-secondary">{r.kind}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="mt-10 text-13 text-muted-ink">{COMPARE_COPY.corrections}</p>
        </div>
      </section>
      <CtaBand />
    </main>
  );
}
