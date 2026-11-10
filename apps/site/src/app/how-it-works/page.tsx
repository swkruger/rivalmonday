import { ArrowRight } from 'lucide-react';
import { HERO } from '../../../content/home';
import { HOW_IT_WORKS } from '../../../content/how-it-works';
import { HOW_FAQ, HOW_LINKS, JUMP_LINKS } from '../../../content/how-it-works-page';
import { GuideArticles } from '../../components/guides/guide-articles';
import { ChecksHub } from '../../components/home/checks-hub';
import { CtaBand } from '../../components/home/cta-band';
import { HomeSectionShell } from '../../components/home/section-heading';
import { Steps } from '../../components/home/steps';
import { JoinButton } from '../../components/join/join-button';
import { JOIN_INK_CLASS } from '../../components/join/join-classes';
import { SAMPLE_MAP_SRC } from '../../components/sample/rank-map';
import { FaqRows } from '../../components/seo/faq-block';
import { JsonLd } from '../../components/seo/json-ld';
import { PageIntro } from '../../components/seo/page-intro';
import { faqPageLd } from '../../lib/json-ld';
import { pageMetadata } from '../../lib/metadata';

export const metadata = pageMetadata('/how-it-works');

const NUMBERED = /^(\d+)\.\s*(.+)$/;
const checkSteps = HOW_IT_WORKS.sections.flatMap((s) => {
  const m = NUMBERED.exec(s.heading);
  return m ? [{ n: m[1]!, title: m[2]!, body: s.body }] : [];
});
const dontDo = HOW_IT_WORKS.sections.find((s) => !NUMBERED.test(s.heading))!;

/** The four steps, links to what moved to /agencies, the claim checks, the questions and the guides. */
export default function HowItWorksPage() {
  return (
    <main>
      <section className="relative overflow-hidden bg-ink">
        <img src={SAMPLE_MAP_SRC} alt="" width={960} height={960} decoding="async" className="night-map pointer-events-none absolute inset-0 size-full" />
        <div aria-hidden="true" className="night-veil absolute inset-0" />
        <div className="site-container relative py-14 lg:py-20">
          <div className="max-w-3xl">
            <PageIntro path="/how-it-works" eyebrow="How it works" h1={HOW_IT_WORKS.h1} lead={HOW_IT_WORKS.lead} tone="night" />
            <div className="mt-7">
              <JoinButton className={JOIN_INK_CLASS}>
                {HERO.primaryCta}
                <ArrowRight aria-hidden="true" className="size-4.5" />
              </JoinButton>
            </div>
          </div>
          <nav aria-label="On this page" className="mt-10">
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              {JUMP_LINKS.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="inline-flex min-h-11 items-center text-surface hover:underline">{l.label}</a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </section>
      <Steps />
      <nav aria-label="Where things moved" className="site-container pb-6 lg:pb-8">
        <ul className="flex flex-wrap gap-x-8 gap-y-1">
          {HOW_LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="inline-flex min-h-11 items-center text-sm font-medium text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{l.label}</a>
            </li>
          ))}
        </ul>
      </nav>
      <ChecksHub hideLink />
      <section className="site-container pb-20 lg:pb-28" aria-labelledby="check-detail-heading">
        <div className="border-t border-line pt-12 lg:pt-16">
          <h2 id="check-detail-heading" className="text-section font-semibold text-ink">{HOW_IT_WORKS.title}</h2>
          <ol className="mt-10 grid gap-x-12 gap-y-10 md:grid-cols-2">
            {checkSteps.map((s) => (
              <li key={s.n} className="flex gap-5">
                <span aria-hidden="true" className="text-numeral w-10 shrink-0 font-semibold tabular-nums text-secondary lg:w-14">{s.n}</span>
                <div className="min-w-0">
                  <h3 className="text-xl font-semibold text-ink">{s.title}</h3>
                  <p className="mt-2 text-base leading-relaxed text-ink-secondary">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-12 rounded-lg bg-muted-surface p-6 lg:p-8">
            <h3 className="text-xl font-semibold text-ink">{dontDo.heading}</h3>
            <p className="mt-2 max-w-3xl text-base leading-relaxed text-ink-secondary">{dontDo.body}</p>
          </div>
        </div>
      </section>
      <HomeSectionShell id="faq" labelledBy="faq-heading" className="border-t border-line bg-canvas">
        <h2 id="faq-heading" className="text-section font-semibold text-ink">{HOW_FAQ.heading}</h2>
        <div className="mt-12 flex flex-col gap-12">
          {HOW_FAQ.groups.map((g) => (
            <div key={g.title} className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-10">
              <h3 className="text-xl font-semibold text-ink">{g.title}</h3>
              <FaqRows items={g.items} />
            </div>
          ))}
        </div>
        <JsonLd data={faqPageLd(HOW_FAQ.groups.flatMap((g) => g.items.map(({ q, a }) => ({ q, a }))))} />
      </HomeSectionShell>
      <GuideArticles slugs={['write-competitor-brief', 'read-competitor-reviews', 'read-competitor-ads']} />
      <CtaBand />
    </main>
  );
}
