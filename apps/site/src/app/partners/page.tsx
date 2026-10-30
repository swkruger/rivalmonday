import { HERO } from '../../../content/home';
import { PARTNER_COPY } from '../../../content/partners';
import { JoinButton } from '../../components/join/join-button';
import { MarginExample } from '../../components/partners/margin-example';
import { PageIntro } from '../../components/seo/page-intro';
import { pageMetadata } from '../../lib/metadata';

export const metadata = pageMetadata('/partners');

export default function PartnersPage() {
  return (
    <main>
      <section className="site-container py-16 lg:py-20">
        <div className="max-w-[720px]">
          <PageIntro path="/partners" eyebrow={PARTNER_COPY.eyebrow} h1={PARTNER_COPY.h1} lead={PARTNER_COPY.lead} />
          <div className="mt-6">
            <JoinButton>{HERO.primaryCta}</JoinButton>
          </div>
        </div>
      </section>
      {PARTNER_COPY.sections.map((s) => (
        <section key={s.id} className="site-container border-t border-line py-12" aria-labelledby={`${s.id}-heading`}>
          <div className="max-w-[720px]">
            <h2 id={`${s.id}-heading`} className="text-2xl font-semibold tracking-tight text-ink">{s.heading}</h2>
            <p className="mt-3 text-base leading-relaxed text-ink-secondary">{s.body}</p>
          </div>
        </section>
      ))}
      <section className="site-container border-t border-line py-12" aria-labelledby="example-heading">
        <h2 id="example-heading" className="text-2xl font-semibold tracking-tight text-ink">{PARTNER_COPY.exampleHeading}</h2>
        <div className="mt-4">
          <MarginExample />
        </div>
        <div className="mt-8">
          <JoinButton>{HERO.primaryCta}</JoinButton>
        </div>
      </section>
    </main>
  );
}
