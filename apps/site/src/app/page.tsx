import { SECTIONS } from '../../content/home';
import { ClientView } from '../components/client-view/client-view';
import { ChecksHub } from '../components/home/checks-hub';
import { FounderNote } from '../components/home/founder-note';
import { FridayRow } from '../components/home/friday-row';
import { Hero } from '../components/home/hero';
import { LiveCounters } from '../components/home/live-counters';
import { MobileCta } from '../components/home/mobile-cta';
import { PricingTeaser } from '../components/home/pricing-teaser';
import { RealSample } from '../components/home/real-sample';
import { HomeSectionShell, SectionHeading } from '../components/home/section-heading';
import { Steps } from '../components/home/steps';
import { Testimonials } from '../components/home/testimonials';
import { IntegrationsStrip } from '../components/integrations/integrations-strip';
import { Reveal } from '../components/motion/in-view';
import { JsonLd } from '../components/seo/json-ld';
import { SampleBrief } from '../components/sample/sample-brief';
import { SampleRecommendations } from '../components/sample/sample-recommendations';
import { softwareApplicationLd } from '../lib/json-ld';
import { sourceLinks } from '../lib/source-links';
import { pageMetadata } from '../lib/metadata';

export const metadata = pageMetadata('/');

/**
 * Order: hero → what your clients see → sample → recommendations → live → how it works → checks → Friday → integrations → real sample
 * → (quotes, once there are any) → founder → pricing + closing CTA (one band). Phones also get a sticky join bar after the hero.
 */
export default function HomePage() {
  return (
    <main>
      <JsonLd data={softwareApplicationLd()} />
      <Hero />
      <ClientView />
      <HomeSectionShell id="sample" labelledBy="sample-heading">
        <SectionHeading section={SECTIONS.sample} />
        <Reveal className="mt-8">
          <SampleBrief sourceLinks={sourceLinks()} />
        </Reveal>
        <a href="/sample-brief" className="mt-6 inline-flex text-sm font-medium text-link hover:underline">
          Open the sample brief on its own page →
        </a>
      </HomeSectionShell>
      <HomeSectionShell id="recommendations" labelledBy="recommendations-heading" className="border-t border-line bg-canvas py-20 lg:py-28">
        <SectionHeading section={SECTIONS.recommendations} />
        <div className="mt-10">
          <SampleRecommendations />
        </div>
      </HomeSectionShell>
      <LiveCounters />
      <Steps />
      <ChecksHub />
      <FridayRow />
      <IntegrationsStrip />
      <RealSample />
      <Testimonials />
      <FounderNote />
      <PricingTeaser />
      <MobileCta />
    </main>
  );
}
