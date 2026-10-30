import { notFound } from 'next/navigation';
import { GUIDES } from '../../../../content/guides';
import { INDUSTRIES, watchList } from '../../../../content/industries';
import { SOURCES } from '../../../../content/sources';
import { CtaBand } from '../../../components/home/cta-band';
import { FaqBlock } from '../../../components/seo/faq-block';
import { PageIntro } from '../../../components/seo/page-intro';
import { SourceIcon } from '../../../components/sources/source-icon';
import { pageMetadata } from '../../../lib/metadata';

export const dynamicParams = false;
export const generateStaticParams = () => INDUSTRIES.map((i) => ({ industry: i.slug }));

export async function generateMetadata({ params }: { params: Promise<{ industry: string }> }) {
  const { industry } = await params;
  return pageMetadata(`/for/${industry}`);
}

const sourceOf = (slug: string) => SOURCES.find((s) => s.slug === slug)!;

/** One trade: what its rivals change, what Rival Monday watches, example keywords and brief lines, FAQ. */
export default async function IndustryPage({ params }: { params: Promise<{ industry: string }> }) {
  const { industry } = await params;
  const ind = INDUSTRIES.find((i) => i.slug === industry);
  if (!ind) notFound();
  const guides = GUIDES.filter((g) => ind.guides.includes(g.slug));
  const others = INDUSTRIES.filter((i) => i.slug !== ind.slug);
  const rivals = ind.slug === 'dental' ? 'nearby practices' : `${ind.name} rivals`;
  // "HVAC" stays an acronym; other trade names read in lower case mid-sentence.
  const trade = ind.slug === 'hvac' ? ind.name : ind.name.toLowerCase();
  return (
    <main>
      <section className="site-container py-16 lg:py-20">
        <div className="max-w-[720px]">
          <PageIntro path={`/for/${ind.slug}`} eyebrow="Industries" h1={ind.h1} lead={ind.lead} />
        </div>

        <h2 className="mt-14 text-2xl font-semibold tracking-tight text-ink">What {rivals} change, and how you would know</h2>
        <ul className="mt-6 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {ind.rivalMoves.map((m) => {
            const src = sourceOf(m.source);
            return (
              <li key={m.title} className="flex flex-col gap-2 bg-surface p-5">
                <SourceIcon icon={src.icon} className="size-5" />
                <h3 className="text-base font-semibold text-ink">{m.title}</h3>
                <p className="text-sm leading-relaxed text-ink-secondary">{m.body}</p>
                <a href={`/sources/${src.slug}`} className="mt-auto pt-1 text-13 text-link hover:underline">{src.name}</a>
              </li>
            );
          })}
        </ul>

        <div className="mt-14 grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-xl font-semibold text-ink">What Rival Monday watches for each client</h2>
            <ul className="mt-4 flex flex-col gap-3">
              {watchList().map((w) => {
                const src = sourceOf(w.source);
                return (
                  <li key={w.source} className="flex gap-3 text-base text-ink-secondary">
                    <SourceIcon icon={src.icon} className="mt-0.5 size-5" />
                    <span>{w.line}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-ink">Map keywords {ind.slug === 'hvac' ? 'an' : 'a'} {trade} client might track</h2>
            <p className="mt-2 text-sm text-ink-secondary">Examples. Each client tracks up to five, scanned weekly across the service area.</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {ind.keywordExamples.map((k) => (
                <li key={k} className="rounded-full border border-line-control px-3 py-1 text-sm text-ink">{k}</li>
              ))}
            </ul>
            <h2 className="mt-10 text-xl font-semibold text-ink">How it reads in a Monday brief</h2>
            <p className="mt-2 text-sm text-ink-secondary">Example lines. Every line in a real brief links to its evidence.</p>
            <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
              {ind.briefExamples.map((b) => (
                <li key={b} className="px-4 py-3 text-sm text-ink">{b}</li>
              ))}
            </ul>
            <a href="/sample-brief" className="mt-3 inline-flex text-sm font-medium text-link hover:underline">See a full sample brief →</a>
          </div>
        </div>

        <div className="max-w-[720px]">
          <FaqBlock items={ind.faq} />
          <div className="mt-12 border-t border-line pt-6">
            {guides.length > 0 && (
              <>
                <h2 className="text-base font-semibold text-ink">Guides</h2>
                <ul className="mt-2 mb-6 flex flex-col gap-1.5 text-sm">
                  {guides.map((g) => (
                    <li key={g.slug}><a href={`/guides/${g.slug}`} className="text-link hover:underline">{g.h1}</a></li>
                  ))}
                </ul>
              </>
            )}
            <h2 className="text-base font-semibold text-ink">Other industries</h2>
            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
              {others.map((o) => (
                <li key={o.slug}><a href={`/for/${o.slug}`} className="text-link hover:underline">{o.name}</a></li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <CtaBand />
    </main>
  );
}
