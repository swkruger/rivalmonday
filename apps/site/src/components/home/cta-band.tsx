'use client';

import { CTA_BAND, CTA_BAND_TRIAL, HERO } from '../../../content/home';
import { JoinButton } from '../join/join-button';
import { SAMPLE_MAP_SRC } from '../sample/rank-map';
import { usePilot } from '../shell/pilot-context';

/**
 * The closing call to action: an ink band (the page's one dark surface) over a faint wash of the sample town's map.
 * The home page passes `id="join"`; sub-pages omit it.
 */
export function CtaBand({ id }: { id?: string }) {
  const { pilotMode } = usePilot();
  const copy = pilotMode ? CTA_BAND : CTA_BAND_TRIAL;
  return (
    <section id={id} className="relative scroll-mt-20 overflow-hidden bg-ink py-20 lg:py-24">
      <img src={SAMPLE_MAP_SRC} alt="" width={960} height={960} loading="lazy" decoding="async" className="pointer-events-none absolute inset-0 size-full object-cover opacity-10" />
      <div aria-hidden="true" className="hero-wash pointer-events-none absolute inset-x-0 top-0 h-full opacity-60" />
      <div className="site-container relative text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-surface md:text-4xl">{copy.heading}</h2>
        <p className="mx-auto mt-3 max-w-xl text-base text-muted-surface">{copy.body}</p>
        <div className="mt-7 flex justify-center">
          <JoinButton>{CTA_BAND.button}</JoinButton>
        </div>
        <p className="mt-4 text-13 text-muted-surface-2">{pilotMode ? HERO.finePrint : HERO.finePrintTrial}</p>
      </div>
    </section>
  );
}
