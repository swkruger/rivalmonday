import { HOW_IT_WORKS } from '../../../content/how-it-works';
import { ChecksHub } from '../../components/home/checks-hub';
import { CtaBand } from '../../components/home/cta-band';
import { Steps } from '../../components/home/steps';
import { PageIntro } from '../../components/seo/page-intro';
import { pageMetadata } from '../../lib/metadata';

export const metadata = pageMetadata('/how-it-works');

/** The journey first (four steps), then how a claim is checked: the diagram, then the same story in words. */
export default function HowItWorksPage() {
  return (
    <main>
      <section className="site-container pb-12 pt-16 lg:pt-20">
        <div className="max-w-[720px]">
          <PageIntro path="/how-it-works" eyebrow="How it works" h1={HOW_IT_WORKS.h1} lead={HOW_IT_WORKS.lead} />
        </div>
      </section>
      <Steps />
      <ChecksHub hideLink />
      <section className="site-container border-t border-line py-16 lg:py-20" aria-labelledby="check-detail-heading">
        <div className="max-w-[720px]">
          <h2 id="check-detail-heading" className="text-2xl font-semibold tracking-tight text-ink">{HOW_IT_WORKS.title}</h2>
          {HOW_IT_WORKS.sections.map((s) => (
            <div key={s.heading} className="mt-8">
              <h3 className="text-xl font-semibold text-ink">{s.heading}</h3>
              <p className="mt-2 text-base leading-relaxed text-ink-secondary">{s.body}</p>
            </div>
          ))}
        </div>
      </section>
      <CtaBand />
    </main>
  );
}
