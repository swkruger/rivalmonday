import { notFound } from 'next/navigation';
import { Frame } from '@cs/ui';
import { COMPARE_COPY, enabledRivals, formatFactDate } from '../../../../content/compare';
import { CapabilityTable } from '../../../components/compare/capability-table';
import { FactList } from '../../../components/compare/fact-list';
import { CtaBand } from '../../../components/home/cta-band';
import { PageIntro } from '../../../components/seo/page-intro';
import { pageMetadata } from '../../../lib/metadata';

export const dynamicParams = false;
export const generateStaticParams = () => enabledRivals().map((r) => ({ rival: r.slug }));

export async function generateMetadata({ params }: { params: Promise<{ rival: string }> }) {
  const { rival } = await params;
  return pageMetadata(`/compare/${rival}`);
}

// Draft copy: owner + counsel sign.
const H2 = 'text-xl font-semibold text-ink';

export default async function ComparePage({ params }: { params: Promise<{ rival: string }> }) {
  const { rival: slug } = await params;
  const r = enabledRivals().find((x) => x.slug === slug);
  if (!r) notFound();
  return (
    <main>
      <section className="site-container py-16 lg:py-20">
        <div className="max-w-[960px]">
          <PageIntro path={`/compare/${r.slug}`} eyebrow="Compare" h1={`Rival Monday vs ${r.name}`} />
          <p className="mt-3 text-sm font-medium text-ink-secondary">Facts checked {formatFactDate(r.factsCheckedOn)}</p>
          <p className="mt-4 text-lg leading-relaxed text-ink-secondary">{r.summary}</p>

          <Frame flush className="mt-8 overflow-hidden px-4">
            <CapabilityTable rival={r} />
          </Frame>

          <h2 className={`${H2} mt-12`}>Where {r.name} is better</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-base leading-relaxed text-ink-secondary">
            {r.betterAt.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>

          <h2 className={`${H2} mt-10`}>Where Rival Monday is different</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-base leading-relaxed text-ink-secondary">
            {r.weDiffer.map((d) => (
              <li key={d.key}>{d.text}</li>
            ))}
          </ul>

          <h2 className={`${H2} mt-10`}>Pricing</h2>
          <FactList items={r.pricing} />

          <h2 className={`${H2} mt-10`}>What {r.name} says about itself</h2>
          <FactList items={r.facts} />

          <div className="mt-12 space-y-1 border-t border-line pt-6 text-13 text-muted-ink">
            <p>{COMPARE_COPY.asOf(r.factsCheckedOn)}</p>
            <p>{COMPARE_COPY.trademark(r.name)}</p>
            <p>{COMPARE_COPY.corrections}</p>
          </div>
        </div>
      </section>
      <CtaBand />
    </main>
  );
}
