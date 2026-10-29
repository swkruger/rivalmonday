import { PRICING_FAQ, PRICING_PAGE } from '../../../content/pricing-page';
import { CtaBand } from '../../components/home/cta-band';
import { Faq } from '../../components/pricing/faq';
import { FeatureTable } from '../../components/pricing/feature-table';
import { PlanCards } from '../../components/pricing/plan-cards';
import { JsonLd } from '../../components/seo/json-ld';
import { PageIntro } from '../../components/seo/page-intro';
import { faqPageLd, softwareApplicationLd } from '../../lib/json-ld';
import { pageMetadata } from '../../lib/metadata';

export const metadata = pageMetadata('/pricing');

export default function PricingPage() {
  return (
    <main>
      <section className="site-container py-16 lg:py-20">
        <div className="max-w-[720px]">
          <PageIntro path="/pricing" eyebrow={PRICING_PAGE.eyebrow} h1={PRICING_PAGE.h1} lead={PRICING_PAGE.lead} />
        </div>
        <div className="mt-10">
          <PlanCards />
        </div>
      </section>
      <section className="site-container border-t border-line py-16" aria-labelledby="features-heading">
        <h2 id="features-heading" className="text-2xl font-semibold tracking-tight text-ink">{PRICING_PAGE.featuresHeading}</h2>
        <div className="mt-6">
          <FeatureTable />
        </div>
      </section>
      <section className="site-container border-t border-line py-16" aria-labelledby="faq-heading">
        <div className="max-w-[720px]">
          <h2 id="faq-heading" className="text-2xl font-semibold tracking-tight text-ink">{PRICING_PAGE.faqHeading}</h2>
          <div className="mt-6">
            <Faq />
          </div>
        </div>
      </section>
      <CtaBand />
      <JsonLd data={[faqPageLd(PRICING_FAQ), softwareApplicationLd()]} />
    </main>
  );
}
