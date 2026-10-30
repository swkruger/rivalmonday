import { notFound } from 'next/navigation';
import { GUIDES } from '../../../../content/guides';
import { SOURCE_DEPTH, SOURCES, SOURCES_PAGE } from '../../../../content/sources';
import { CtaBand } from '../../../components/home/cta-band';
import { FaqBlock } from '../../../components/seo/faq-block';
import { PageIntro } from '../../../components/seo/page-intro';
import { SourceIcon } from '../../../components/sources/source-icon';
import { pageMetadata } from '../../../lib/metadata';

export const dynamicParams = false;
export const generateStaticParams = () => SOURCES.map((s) => ({ source: s.slug }));

export async function generateMetadata({ params }: { params: Promise<{ source: string }> }) {
  const { source } = await params;
  return pageMetadata(`/sources/${source}`);
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-8">
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-base leading-relaxed text-ink-secondary">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export default async function SourcePage({ params }: { params: Promise<{ source: string }> }) {
  const { source } = await params;
  const s = SOURCES.find((x) => x.slug === source);
  if (!s) notFound();
  const others = SOURCES.filter((x) => x.slug !== s.slug);
  const depth = SOURCE_DEPTH[s.slug];
  const guide = depth.guide ? GUIDES.find((g) => g.slug === depth.guide) : undefined;
  return (
    <main>
      <section className="site-container py-16 lg:py-20">
        <div className="max-w-[720px]">
          <PageIntro path={`/sources/${s.slug}`} eyebrow={SOURCES_PAGE.eyebrow} h1={s.name} lead={s.oneLine} />
          <div className="mt-6">
            <SourceIcon icon={s.icon} className="size-9" />
          </div>
          <div className="mt-8">
            <h2 className="text-xl font-semibold text-ink">Why it matters</h2>
            {depth.whyItMatters.map((p) => (
              <p key={p} className="mt-2 text-base leading-relaxed text-ink-secondary">{p}</p>
            ))}
          </div>
          <Section title="What we collect" items={s.whatWeCollect} />
          <div className="mt-8">
            <h2 className="text-xl font-semibold text-ink">How often</h2>
            <p className="mt-2 text-base leading-relaxed text-ink-secondary">{s.howOften}</p>
          </div>
          <Section title="What we don't do" items={s.whatWeDont} />
          <div className="mt-8">
            <h2 className="text-xl font-semibold text-ink">In your brief, for example</h2>
            <p className="mt-2 text-base leading-relaxed text-ink-secondary">{s.inTheBrief}</p>
            <a href="/sample-brief" className="mt-2 inline-flex text-sm font-medium text-link hover:underline">See it in the sample brief →</a>
          </div>
          <FaqBlock items={depth.faq} />
          {guide && (
            <p className="mt-8 text-base text-ink-secondary">
              Go deeper: <a href={`/guides/${guide.slug}`} className="font-medium text-link hover:underline">{guide.h1}</a>
            </p>
          )}
          <div className="mt-10 border-t border-line pt-6">
            <h2 className="text-base font-semibold text-ink">Other sources</h2>
            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {others.map((o) => (
                <li key={o.slug}>
                  <a href={`/sources/${o.slug}`} className="text-secondary hover:underline">
                    {o.name}
                  </a>
                </li>
              ))}
              <li>
                <a href="/sources" className="text-secondary hover:underline">
                  All sources
                </a>
              </li>
            </ul>
            <p className="mt-4 text-13 text-muted-ink">{SOURCES_PAGE.trademarkNote}</p>
          </div>
        </div>
      </section>
      <CtaBand />
    </main>
  );
}
