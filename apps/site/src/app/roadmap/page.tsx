import { ROADMAP } from '../../../content/roadmap';
import { CtaBand } from '../../components/home/cta-band';
import { ActionLoop } from '../../components/roadmap/action-loop';
import { PageIntro } from '../../components/seo/page-intro';
import { pageMetadata } from '../../lib/metadata';

export const metadata = pageMetadata('/roadmap');

export default function RoadmapPage() {
  return (
    <main>
      <section className="site-container py-16 lg:py-20">
        <div className="max-w-[720px]">
          <PageIntro path="/roadmap" eyebrow={ROADMAP.eyebrow} h1={ROADMAP.h1} lead={ROADMAP.lead} />
          <p className="mt-6 flex flex-wrap items-center gap-3 text-sm text-ink-secondary">
            <span className="rounded-full border border-secondary px-3 py-1 font-medium text-secondary">{ROADMAP.status}</span>
            <span>{ROADMAP.notice}</span>
          </p>
        </div>
        <ActionLoop />
      </section>
      <section className="site-container border-t border-line py-16" aria-labelledby="covers-heading">
        <h2 id="covers-heading" className="text-2xl font-semibold tracking-tight text-ink">{ROADMAP.covers.heading}</h2>
        <dl className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {ROADMAP.covers.items.map((item) => (
            <div key={item.name} className="rounded-lg border border-line bg-surface p-5">
              <dt className="text-base font-semibold text-ink">{item.name}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-ink-secondary">{item.body}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="site-container border-t border-line py-16" aria-labelledby="google-heading">
        <div className="max-w-[720px]">
          <h2 id="google-heading" className="text-2xl font-semibold tracking-tight text-ink">{ROADMAP.google.heading}</h2>
          <p className="mt-3 text-base leading-relaxed text-ink-secondary">{ROADMAP.google.body}</p>
        </div>
      </section>
      <CtaBand />
    </main>
  );
}
