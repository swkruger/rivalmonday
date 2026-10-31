import { HERO } from '../../../content/home';
import { PARTNER_COPY } from '../../../content/partners';
import { CtaBand } from '../../components/home/cta-band';
import { JoinButton } from '../../components/join/join-button';
import { MarginExample } from '../../components/partners/margin-example';
import { SAMPLE_MAP_SRC } from '../../components/sample/rank-map';
import { PageIntro } from '../../components/seo/page-intro';
import { pageMetadata } from '../../lib/metadata';

export const metadata = pageMetadata('/partners');

/** Opens on the night map with the calculator floating beside the headline: an agency's first question is what it would earn. */
export default function PartnersPage() {
  return (
    <main>
      <section className="relative overflow-hidden bg-ink">
        <img src={SAMPLE_MAP_SRC} alt="" width={960} height={960} decoding="async" className="night-map pointer-events-none absolute inset-0 size-full" />
        <div aria-hidden="true" className="night-veil absolute inset-0" />
        <div className="site-container relative grid items-start gap-10 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:items-center lg:gap-16 lg:py-20">
          <div>
            <PageIntro path="/partners" eyebrow={PARTNER_COPY.eyebrow} h1={PARTNER_COPY.h1} lead={PARTNER_COPY.lead} tone="night" />
            <div className="mt-7">
              <JoinButton>{HERO.primaryCta}</JoinButton>
            </div>
          </div>
          <MarginExample />
        </div>
      </section>
      <section className="site-container py-16 lg:py-24">
        <div className="max-w-[1100px] divide-y divide-line">
          {PARTNER_COPY.sections.map((s) => (
            <div key={s.id} className="grid gap-3 py-8 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-10 lg:py-12">
              <h2 id={`${s.id}-heading`} className="text-section font-semibold text-ink">{s.heading}</h2>
              <div className="md:pt-2">
                <p className="text-lg leading-relaxed text-ink-secondary">{s.body}</p>
                {s.id === 'upsells' ? (
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {PARTNER_COPY.upsellServices.map((service) => (
                      <li key={service} className="rounded-full border border-line-control px-3 py-1 text-sm text-ink">{service}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>
      <CtaBand />
    </main>
  );
}
