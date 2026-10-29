import { SECTIONS } from '../../content/home';
import { ChecksHub } from '../components/home/checks-hub';
import { CtaBand } from '../components/home/cta-band';
import { FounderNote } from '../components/home/founder-note';
import { FridayRow } from '../components/home/friday-row';
import { Hero } from '../components/home/hero';
import { LiveCounters } from '../components/home/live-counters';
import { PricingTeaser } from '../components/home/pricing-teaser';
import { RealSample } from '../components/home/real-sample';
import { HomeSectionShell, SectionHeading } from '../components/home/section-heading';
import { Steps } from '../components/home/steps';
import { SampleBrief } from '../components/sample/sample-brief';
import { pageMetadata } from '../lib/metadata';

export const metadata = pageMetadata('/');

/** Order: hero → sample → live → how it works → checks → Friday → real sample → founder → pricing → closing CTA. */
export default function HomePage() {
  return (
    <main>
      <Hero />
      <HomeSectionShell id="sample" labelledBy="sample-heading">
        <SectionHeading section={SECTIONS.sample} />
        <div className="mt-8">
          <SampleBrief />
        </div>
      </HomeSectionShell>
      <LiveCounters />
      <Steps />
      <ChecksHub />
      <FridayRow />
      <RealSample />
      <FounderNote />
      <PricingTeaser />
      <CtaBand id="join" />
    </main>
  );
}
