import { HOW_IT_WORKS } from '../../../content/how-it-works';
import { ChecksHub } from '../../components/home/checks-hub';
import { CtaBand } from '../../components/home/cta-band';
import { BreadcrumbJsonLd } from '../../components/seo/page-intro';
import { pageMetadata } from '../../lib/metadata';

export const metadata = pageMetadata('/how-it-works');

export default function HowItWorksPage() {
  return (
    <main>
      <BreadcrumbJsonLd path="/how-it-works" />
      <section className="site-container py-16 lg:py-20">
        <div className="max-w-[720px]">
          <p className="text-13 font-medium text-secondary">How it works</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-ink">{HOW_IT_WORKS.title}</h1>
          {HOW_IT_WORKS.sections.map((s) => (
            <div key={s.heading} className="mt-8">
              <h2 className="text-xl font-semibold text-ink">{s.heading}</h2>
              <p className="mt-2 text-base leading-relaxed text-ink-secondary">{s.body}</p>
            </div>
          ))}
        </div>
      </section>
      <ChecksHub hideLink />
      <CtaBand />
    </main>
  );
}
