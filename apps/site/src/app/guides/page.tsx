import { GUIDES, GUIDES_PAGE } from '../../../content/guides';
import { CtaBand } from '../../components/home/cta-band';
import { PageIntro } from '../../components/seo/page-intro';
import { pageMetadata } from '../../lib/metadata';
import { formatDay } from '../../sample/format';

export const metadata = pageMetadata('/guides');

/** Guides hub. Reached from the footer, the sitemap and in-text links, not the top nav. */
export default function GuidesPage() {
  return (
    <main>
      <section className="site-container py-16 lg:py-20">
        <div className="max-w-[720px]">
          <PageIntro path="/guides" eyebrow={GUIDES_PAGE.eyebrow} h1={GUIDES_PAGE.h1} lead={GUIDES_PAGE.lead} />
          <ul className="mt-10 divide-y divide-line border-y border-line">
            {GUIDES.map((g) => (
              <li key={g.slug}>
                <a href={`/guides/${g.slug}`} className="block py-5 hover:underline">
                  <span className="block text-base font-semibold text-ink">{g.h1}</span>
                  <span className="mt-1 block text-sm text-ink-secondary">{g.seo.description}</span>
                  <span className="mt-1 block text-13 text-muted-ink">Updated {formatDay(g.updated)}</span>
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
