'use client';

import { CTA_BAND, CTA_BAND_TRIAL, HERO } from '../../../content/home';
import { JoinButton } from '../join/join-button';
import { SAMPLE_MAP_SRC } from '../sample/rank-map';
import { usePilot } from '../shell/pilot-context';

/** An ink band (the page's one dark surface) over a faint wash of the sample town's map. */
export function InkBand({ id, labelledBy, children }: { id?: string; labelledBy?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className="relative scroll-mt-20 overflow-hidden bg-ink py-24 lg:py-32">
      <img src={SAMPLE_MAP_SRC} alt="" width={960} height={960} loading="lazy" decoding="async" className="night-map pointer-events-none absolute inset-0 size-full" />
      <div aria-hidden="true" className="night-veil-even absolute inset-0" />
      <div className="site-container relative text-center">{children}</div>
    </section>
  );
}

/** The closing call to action on sub-pages; the home page closes with `PricingTeaser` instead. */
export function CtaBand() {
  const { pilotMode } = usePilot();
  const copy = pilotMode ? CTA_BAND : CTA_BAND_TRIAL;
  return (
    <InkBand>
      <h2 className="text-section font-semibold text-surface">{copy.heading}</h2>
      <p className="mx-auto mt-4 max-w-xl text-lg text-muted-surface">{copy.body}</p>
      <div className="mt-7 flex justify-center">
        <JoinButton>{CTA_BAND.button}</JoinButton>
      </div>
      <p className="mt-4 text-13 text-surface">{pilotMode ? HERO.finePrint : HERO.finePrintTrial}</p>
    </InkBand>
  );
}
