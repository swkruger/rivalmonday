import { SOURCES, SOURCES_PAGE } from '../../../content/sources';
import { CtaBand } from '../../components/home/cta-band';
import { PageIntro } from '../../components/seo/page-intro';
import { SourceIcon } from '../../components/sources/source-icon';
import { pageMetadata } from '../../lib/metadata';

export const metadata = pageMetadata('/sources');

export default function SourcesPage() {
  return (
    <main>
      <section className="site-container py-16 lg:py-20">
        <div className="max-w-[720px]">
          <PageIntro path="/sources" eyebrow={SOURCES_PAGE.eyebrow} h1={SOURCES_PAGE.h1} lead={SOURCES_PAGE.lead} />
        </div>
        <ul className="mt-10 grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-2">
          {SOURCES.map((s) => (
            <li key={s.slug} className="bg-surface">
              <a href={`/sources/${s.slug}`} className="flex h-full items-start gap-4 p-5 hover:bg-canvas">
                <SourceIcon icon={s.icon} />
                <span>
                  <span className="block text-base font-semibold text-ink">{s.name}</span>
                  <span className="mt-1 block text-sm text-ink-secondary">{s.oneLine}</span>
                  <span className="mt-1 block text-13 text-muted-ink">{s.howOften}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-[720px] text-13 text-muted-ink">{SOURCES_PAGE.trademarkNote}</p>
      </section>
      <CtaBand />
    </main>
  );
}
