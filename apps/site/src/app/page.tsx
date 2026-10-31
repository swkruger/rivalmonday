import { ClientView } from '../components/client-view/client-view';
import { GuideArticles } from '../components/guides/guide-articles';
import { ChecksHub } from '../components/home/checks-hub';
import { FounderNote } from '../components/home/founder-note';
import { FridayRow } from '../components/home/friday-row';
import { Hero } from '../components/home/hero';
import { LiveCounters } from '../components/home/live-counters';
import { MobileCta } from '../components/home/mobile-cta';
import { PricingTeaser } from '../components/home/pricing-teaser';
import { RealSample } from '../components/home/real-sample';
import { RecommendationsSection } from '../components/home/recommendations-section';
import { SampleSection } from '../components/home/sample-section';
import { Steps } from '../components/home/steps';
import { Testimonials } from '../components/home/testimonials';
import { JsonLd } from '../components/seo/json-ld';
import { softwareApplicationLd } from '../lib/json-ld';
import { pageMetadata } from '../lib/metadata';

export const metadata = pageMetadata('/');

/**
 * Order: hero → what your clients see → sample → recommendations → live → how it works → checks → Friday → real sample
 * → (quotes, once there are any) → founder → guides → pricing + closing CTA (one band). Phones also get a sticky join bar after the hero.
 */
export default function HomePage() {
  return (
    <main>
      <JsonLd data={softwareApplicationLd()} />
      <Hero />
      <ClientView />
      <SampleSection />
      <RecommendationsSection />
      <LiveCounters />
      <Steps />
      <ChecksHub />
      <FridayRow />
      <RealSample />
      <Testimonials />
      <FounderNote />
      <GuideArticles slugs={['local-competitor-analysis', 'map-rank-grid', 'competitor-monitoring-checklist']} />
      <PricingTeaser />
      <MobileCta />
    </main>
  );
}
