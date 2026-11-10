import { BUSINESS_FAQ, PRICING_PAGE } from '../../../../content/pricing-page';
import { BusinessClose } from '../../../components/home/business-close';
import { BusinessPlanCard } from '../../../components/pricing/business-plan-card';
import { Faq } from '../../../components/pricing/faq';
import { FeatureList } from '../../../components/pricing/feature-list';
import { PricingLead } from '../../../components/pricing/pricing-lead';
import { JsonLd } from '../../../components/seo/json-ld';
import { PageIntro } from '../../../components/seo/page-intro';
import { faqPageLd } from '../../../lib/json-ld';
import { pageMetadata } from '../../../lib/metadata';

export const metadata = pageMetadata('/business/pricing');

/** No `SoftwareApplication` here: it carries the agency plan's offer, which this side never shows. */
export default function BusinessPricingPage() {
  const copy = PRICING_PAGE.business;
  return (
    <main>
      <section className="site-container py-16 lg:py-20">
        <div className="max-w-[720px]">
          <PageIntro path="/business/pricing" eyebrow={copy.eyebrow} h1={copy.h1} />
          <PricingLead side="business" />
        </div>
        <div className="mt-10 max-w-xl">
          <BusinessPlanCard />
        </div>
      </section>
      <section className="site-container border-t border-line py-16" aria-labelledby="features-heading">
        <div className="max-w-[720px]">
          <h2 id="features-heading" className="text-2xl font-semibold tracking-tight text-ink">{copy.featuresHeading}</h2>
          <div className="mt-6">
            <FeatureList side="business" />
          </div>
        </div>
      </section>
      <Faq items={BUSINESS_FAQ} heading={copy.faqHeading} />
      <BusinessClose />
      <JsonLd data={faqPageLd(BUSINESS_FAQ)} />
    </main>
  );
}
