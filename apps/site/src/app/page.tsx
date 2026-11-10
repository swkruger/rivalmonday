import { ChecksHub } from '../components/home/checks-hub';
import { DoorsBand } from '../components/home/doors-band';
import { HomeHero } from '../components/home/home-hero';
import { LiveCounters } from '../components/home/live-counters';
import { JsonLd } from '../components/seo/json-ld';
import { softwareApplicationLd } from '../lib/json-ld';
import { pageMetadata } from '../lib/metadata';

export const metadata = pageMetadata('/');

/** The chooser: the headline and two doors, what the checks are, live counters, then the doors again. No price, no join button. */
export default function HomePage() {
  return (
    <main>
      <JsonLd data={softwareApplicationLd()} />
      <HomeHero />
      <ChecksHub />
      <LiveCounters />
      <DoorsBand />
    </main>
  );
}
