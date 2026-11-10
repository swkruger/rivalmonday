import { PRICING_FAQ, PRICING_PAGE } from '../../../../content/pricing-page';
import { CtaBand } from '../../../components/home/cta-band';
import { AgencyPlanCard } from '../../../components/pricing/agency-plan-card';
import { Faq } from '../../../components/pricing/faq';
import { FeatureList } from '../../../components/pricing/feature-list';
import { PricingLead } from '../../../components/pricing/pricing-lead';
import { JsonLd } from '../../../components/seo/json-ld';
import { PageIntro } from '../../../components/seo/page-intro';
import { faqPageLd, softwareApplicationLd } from '../../../lib/json-ld';
import { pageMetadata } from '../../../lib/metadata';

export const metadata = pageMetadata('/agencies/pricing');

export default function AgencyPricingPage() {
  const copy = PRICING_PAGE.agency;
  return (
    <main>
      <section className="site-container py-16 lg:py-20">
        <div className="max-w-[720px]">
          <PageIntro path="/agencies/pricing" eyebrow={copy.eyebrow} h1={copy.h1} />
          <PricingLead side="agency" />
        </div>
        <div className="mt-10 max-w-xl">
          <AgencyPlanCard />
        </div>
      </section>
      <section className="site-container border-t border-line py-16" aria-labelledby="features-heading">
        <div className="max-w-[720px]">
          <h2 id="features-heading" className="text-2xl font-semibold tracking-tight text-ink">{copy.featuresHeading}</h2>
          <div className="mt-6">
            <FeatureList side="agency" />
          </div>
        </div>
      </section>
      <Faq items={PRICING_FAQ} heading={copy.faqHeading} />
      <CtaBand />
      <JsonLd data={[faqPageLd(PRICING_FAQ), softwareApplicationLd()]} />
    </main>
  );
}
