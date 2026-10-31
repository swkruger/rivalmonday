import { HERO } from '../../../content/home';
import { HOW_IT_WORKS } from '../../../content/how-it-works';
import { HOW_FAQ, JUMP_LINKS, ROLES, WEEK } from '../../../content/how-it-works-page';
import { ClientView } from '../../components/client-view/client-view';
import { GuideArticles } from '../../components/guides/guide-articles';
import { ChecksHub } from '../../components/home/checks-hub';
import { CtaBand } from '../../components/home/cta-band';
import { RecommendationsSection } from '../../components/home/recommendations-section';
import { SampleSection } from '../../components/home/sample-section';
import { HomeSectionShell } from '../../components/home/section-heading';
import { Steps } from '../../components/home/steps';
import { JoinButton } from '../../components/join/join-button';
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

/** Opens on the week the product runs to, then walks the journey with the home page's working sections, the checks and the questions. */
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
              <JoinButton>{HERO.primaryCta}</JoinButton>
            </div>
          </div>
          <div className="mt-12 lg:mt-16">
            <h2 className="text-sm font-semibold text-surface">{WEEK.heading}</h2>
            {/* Ends on Monday, the one filled stop: the whole week builds to the brief. */}
            <ol className="mt-4 grid gap-3 lg:grid-cols-[3fr_2fr_3fr]">
              {WEEK.stops.map((stop, i) => {
                const monday = i === WEEK.stops.length - 1;
                return (
                  <li key={stop.when} className={`rounded-lg p-5 lg:p-6 ${monday ? 'bg-primary' : 'border border-surface/20 bg-ink/60'}`}>
                    <p className={`text-13 font-medium ${monday ? 'text-ink' : 'text-muted-surface'}`}>{stop.when}</p>
                    <h3 className={`mt-2 text-xl font-semibold ${monday ? 'text-ink' : 'text-surface'}`}>{stop.title}</h3>
                    <p className={`mt-1 text-sm leading-relaxed ${monday ? 'text-ink' : 'text-muted-surface'}`}>{stop.body}</p>
                  </li>
                );
              })}
            </ol>
          </div>
          <nav aria-label="On this page" className="mt-8">
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
      <HomeSectionShell id={ROLES.id} labelledBy={`${ROLES.id}-heading`}>
        <div className="max-w-3xl">
          <h2 id={`${ROLES.id}-heading`} className="text-section font-semibold text-ink">{ROLES.heading}</h2>
          <p className="mt-4 text-lg text-ink-secondary">{ROLES.body}</p>
        </div>
        <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          {ROLES.columns.map((c) => (
            <div key={c.who} className="border-t-2 border-secondary pt-5">
              <h3 className="text-xl font-semibold text-ink">{c.who}</h3>
              <ul className="mt-3 divide-y divide-line">
                {c.lines.map((line) => (
                  <li key={line} className="py-3 text-base text-ink-secondary">{line}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </HomeSectionShell>
      <ClientView />
      <SampleSection />
      <RecommendationsSection />
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
      <HomeSectionShell id="faq" labelledBy="faq-heading" className="border-t border-line bg-canvas py-20 lg:py-28">
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
