import { ClientView } from '../../components/client-view/client-view';
import { BusinessClose } from '../../components/home/business-close';
import { BusinessHero } from '../../components/home/business-hero';
import { MobileCta } from '../../components/home/mobile-cta';
import { RivalStory } from '../../components/home/rival-story';
import { SampleSection } from '../../components/home/sample-section';
import { pageMetadata } from '../../lib/metadata';

export const metadata = pageMetadata('/business');

/** The local-business page, in `BUSINESS_ANCHORS` order: hero → a rival on the move → what you get → the sample brief → closing band. */
export default function BusinessPage() {
  return (
    <main>
      <BusinessHero />
      <RivalStory audience="business" />
      <ClientView audience="business" />
      <SampleSection />
      <BusinessClose />
      <MobileCta />
    </main>
  );
}
