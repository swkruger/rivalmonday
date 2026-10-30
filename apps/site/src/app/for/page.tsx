import { INDUSTRIES, INDUSTRIES_PAGE } from '../../../content/industries';
import { CtaBand } from '../../components/home/cta-band';
import { PageIntro } from '../../components/seo/page-intro';
import { pageMetadata } from '../../lib/metadata';

export const metadata = pageMetadata('/for');

/** Industry hub: one row per trade. Reached from the footer and the sitemap, not the top nav. */
export default function IndustriesPage() {
  return (
    <main>
      <section className="site-container py-16 lg:py-20">
        <div className="max-w-[720px]">
          <PageIntro path="/for" eyebrow={INDUSTRIES_PAGE.eyebrow} h1={INDUSTRIES_PAGE.h1} lead={INDUSTRIES_PAGE.lead} />
          <ul className="mt-10 divide-y divide-line border-y border-line">
            {INDUSTRIES.map((i) => (
              <li key={i.slug}>
                <a href={`/for/${i.slug}`} className="block py-5 hover:underline">
                  <span className="block text-base font-semibold text-ink">{i.h1}</span>
                  <span className="mt-1 block text-sm text-ink-secondary">{i.seo.description}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <CtaBand />
    </main>
  );
}
