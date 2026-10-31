import { ANY_INDUSTRY, INDUSTRIES, INDUSTRIES_PAGE } from '../../../content/industries';
import { CtaBand } from '../../components/home/cta-band';
import { PageIntro } from '../../components/seo/page-intro';
import { pageMetadata } from '../../lib/metadata';

export const metadata = pageMetadata('/for');

/** Industry hub: one cell per trade. Reached from the footer and the sitemap, not the top nav. */
export default function IndustriesPage() {
  return (
    <main>
      <section className="site-container py-16 lg:py-20">
        <div className="max-w-[720px]">
          <PageIntro path="/for" eyebrow={INDUSTRIES_PAGE.eyebrow} h1={INDUSTRIES_PAGE.h1} lead={INDUSTRIES_PAGE.lead} />
        </div>
        <ul className="mt-10 grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-2">
          {INDUSTRIES.map((i) => (
            <li key={i.slug} className="bg-surface">
              <a href={`/for/${i.slug}`} className="block h-full p-5 hover:bg-canvas">
                <span className="block text-base font-semibold text-ink">{i.h1}</span>
                <span className="mt-1 block text-sm text-ink-secondary">{i.seo.description}</span>
              </a>
            </li>
          ))}
          {/* Closes the grid: thirteen trades would otherwise leave an empty cell. */}
          <li className="bg-canvas p-5">
            <h2 className="text-base font-semibold text-secondary">{ANY_INDUSTRY.heading}</h2>
            <p className="mt-1 text-sm text-ink-secondary">{ANY_INDUSTRY.body}</p>
          </li>
        </ul>
      </section>
      <CtaBand />
    </main>
  );
}
