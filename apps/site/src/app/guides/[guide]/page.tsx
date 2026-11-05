import { notFound } from 'next/navigation';
import { GUIDES, guideReadMinutes } from '../../../../content/guides';
import { CtaBand } from '../../../components/home/cta-band';
import { RankMap, weekStats } from '../../../components/sample/rank-map';
import { JsonLd } from '../../../components/seo/json-ld';
import { PageIntro } from '../../../components/seo/page-intro';
import { articleLd } from '../../../lib/json-ld';
import { pageMetadata } from '../../../lib/metadata';
import { formatDay } from '../../../sample/format';
import { SAMPLE } from '../../../sample/schema';

export const dynamicParams = false;
export const generateStaticParams = () => GUIDES.map((g) => ({ guide: g.slug }));

export async function generateMetadata({ params }: { params: Promise<{ guide: string }> }) {
  const { guide } = await params;
  return pageMetadata(`/guides/${guide}`);
}

/** The sample's first and latest map scans side by side: the guide's worked example (fictional data, labelled). */
function SampleMapPair() {
  const weeks = SAMPLE.rankGrid.weeks;
  const pair = [
    { label: 'Week 1', week: weeks[0]! },
    { label: `Week ${weeks.length}`, week: weeks[weeks.length - 1]! },
  ];
  return (
    <figure className="mt-6">
      <div className="grid grid-cols-2 gap-4">
        {pair.map(({ label, week }) => {
          const { top3, points } = weekStats(week.you);
          return (
            <div key={label}>
              <div role="img" aria-label={`${label}: top 3 at ${top3} of ${points} points`}>
                <RankMap ranks={week.you} size={SAMPLE.rankGrid.size} compact />
              </div>
              <p className="mt-2 text-13 font-semibold text-ink">{label}</p>
              <p className="text-13 text-ink-secondary">Top 3 at {top3} of {points} points</p>
            </div>
          );
        })}
      </div>
      <figcaption className="mt-3 text-13 text-muted-ink">
        Sample data for a fictional business, “{SAMPLE.rankGrid.keyword}”. Darker is better; the ringed point is the business. <a href="/sample-brief" className="text-link hover:underline">Play all twelve weeks in the sample brief</a>.
      </figcaption>
    </figure>
  );
}

export default async function GuidePage({ params }: { params: Promise<{ guide: string }> }) {
  const { guide } = await params;
  const g = GUIDES.find((x) => x.slug === guide);
  if (!g) notFound();
  const path = `/guides/${g.slug}` as const;
  // The worked example sits under the section that introduces it.
  const mapAfter = g.showSampleMap ? g.sections.findIndex((s) => s.paragraphs.some((p) => p.includes('sample below'))) : -1;
  return (
    <main>
      <JsonLd data={articleLd({ path, headline: g.h1, description: g.seo.description, published: g.published, updated: g.updated })} />
      <article className="site-container py-16 lg:py-20">
        <div className="max-w-[720px]">
          <PageIntro path={path} eyebrow="Guide" h1={g.h1} lead={g.lead} />
          <p className="mt-4 text-13 text-muted-ink">
            <time dateTime={g.updated}>Updated {formatDay(g.updated)}</time> · {guideReadMinutes(g)} min read
          </p>
          <figure className="mt-8">
            <img src={g.image.src} alt={g.image.alt} width={g.image.width} height={g.image.height} decoding="async" className="aspect-[3/2] w-full rounded-lg border border-line bg-muted-surface object-cover [object-position:left_top]" />
            {g.image.caption ? <figcaption className="mt-2 text-13 text-muted-ink">{g.image.caption}</figcaption> : null}
          </figure>
          {g.sections.map((s, i) => (
            <section key={s.heading} className="mt-10">
              <h2 className="text-2xl font-semibold tracking-tight text-ink">{s.heading}</h2>
              {s.paragraphs.map((p) => (
                <p key={p} className="mt-3 text-base leading-relaxed text-ink-secondary">{p}</p>
              ))}
              {s.list && (
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-base leading-relaxed text-ink-secondary">
                  {s.list.map((l) => <li key={l}>{l}</li>)}
                </ul>
              )}
              {i === mapAfter && <SampleMapPair />}
            </section>
          ))}
          <aside aria-label="Related" className="mt-12 border-t border-line pt-6">
            <h2 className="text-base font-semibold text-ink">Go deeper</h2>
            <ul className="mt-2 flex flex-col gap-1.5 text-sm">
              {g.related.map((r) => (
                <li key={r.href}><a href={r.href} className="text-link hover:underline">{r.label}</a></li>
              ))}
            </ul>
            <h2 className="mt-6 text-base font-semibold text-ink">More guides</h2>
            <ul className="mt-2 flex flex-col gap-1.5 text-sm">
              {GUIDES.filter((x) => x.slug !== g.slug).map((x) => (
                <li key={x.slug}><a href={`/guides/${x.slug}`} className="text-link hover:underline">{x.h1}</a></li>
              ))}
            </ul>
          </aside>
        </div>
      </article>
      <CtaBand />
    </main>
  );
}
