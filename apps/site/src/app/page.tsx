import { ClientView } from '../components/client-view/client-view';
import { AgencyCeiling } from '../components/home/agency-ceiling';
import { BeforeAfter } from '../components/home/before-after';
import { Cast } from '../components/home/cast';
import { ChecksHub } from '../components/home/checks-hub';
import { CloseBand } from '../components/home/close-band';
import { Commercial } from '../components/home/commercial';
import { FridayRow } from '../components/home/friday-row';
import { Hero } from '../components/home/hero';
import { LiveCounters } from '../components/home/live-counters';
import { MobileCta } from '../components/home/mobile-cta';
import { Opportunity } from '../components/home/opportunity';
import { RecommendationsSection } from '../components/home/recommendations-section';
import { RivalStory } from '../components/home/rival-story';
import { SampleSection } from '../components/home/sample-section';
import { Steps } from '../components/home/steps';
import { Testimonials } from '../components/home/testimonials';
import { JsonLd } from '../components/seo/json-ld';
import { HOW_STEPS_NOTE, SECTIONS } from '../../content/home';
import { softwareApplicationLd } from '../lib/json-ld';
import { pageMetadata } from '../lib/metadata';

export const metadata = pageMetadata('/');

/**
 * The story, in `HOME_ANCHORS` order: hero → a rival on the move → the agency's ceiling → the new service → the cast
 * → what clients see → recommendations → Friday → before/after → checks → sample → live (when there are counters)
 * → how it works → your business model → (quotes, once there are any) → closing band, which carries the founder note
 * (once there is one). Phones also get a sticky join bar after the hero.
 */
export default function HomePage() {
  return (
    <main>
      <JsonLd data={softwareApplicationLd()} />
      <Hero />
      <RivalStory />
      <AgencyCeiling />
      <Opportunity />
      <Cast />
      <ClientView />
      <RecommendationsSection roadmap={false} />
      <FridayRow />
      <BeforeAfter />
      <ChecksHub heading={SECTIONS.checks.homeHeading} divided />
      <SampleSection autoplayMap={false} />
      <LiveCounters />
      <Steps industries={false} afterSteps={HOW_STEPS_NOTE} />
      <Commercial />
      <Testimonials />
      <CloseBand />
      <MobileCta />
    </main>
  );
}
