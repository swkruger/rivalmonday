import { GUIDES, GUIDES_PAGE } from '../../../content/guides';
import { GuideTeaser } from '../../components/guides/guide-articles';
import { CtaBand } from '../../components/home/cta-band';
import { PageIntro } from '../../components/seo/page-intro';
import { pageMetadata } from '../../lib/metadata';

export const metadata = pageMetadata('/guides');

/** Guides hub: every guide as an article, newest first. Reached from the footer, the sitemap and in-text links, not the top nav. */
export default function GuidesPage() {
  const newestFirst = [...GUIDES].sort((a, b) => b.published.localeCompare(a.published));
  return (
    <main>
      <section className="site-container py-16 lg:py-20">
        <div className="max-w-[720px]">
          <PageIntro path="/guides" eyebrow={GUIDES_PAGE.eyebrow} h1={GUIDES_PAGE.h1} lead={GUIDES_PAGE.lead} />
        </div>
        <div className="mt-12 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {newestFirst.map((g) => (
            <GuideTeaser key={g.slug} guide={g} stacked />
          ))}
        </div>
      </section>
      <CtaBand />
    </main>
  );
}
