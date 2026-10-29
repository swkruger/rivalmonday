'use client';

import { CTA_BAND, CTA_BAND_TRIAL } from '../../../content/home';
import { JoinButton } from '../join/join-button';
import { usePilot } from '../shell/pilot-context';

/** Centred closing line over faint fragment echoes (decorative). The home page passes `id="join"`; sub-pages omit it. */
export function CtaBand({ id }: { id?: string }) {
  const { pilotMode } = usePilot();
  const copy = pilotMode ? CTA_BAND : CTA_BAND_TRIAL;
  return (
    <section id={id} className="relative scroll-mt-20 overflow-hidden border-t border-line bg-canvas py-20">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-50">
        <div className="absolute -left-8 top-8 hidden h-28 w-64 -rotate-3 rounded-lg border border-line bg-surface lg:block" />
        <div className="absolute -right-6 bottom-6 hidden h-32 w-72 rotate-2 rounded-lg border border-line bg-surface lg:block" />
        <div className="absolute right-24 top-6 hidden h-16 w-48 rounded-lg border border-line bg-surface xl:block" />
      </div>
      <div className="site-container relative text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-ink">{copy.heading}</h2>
        <p className="mx-auto mt-3 max-w-xl text-base text-ink-secondary">{copy.body}</p>
        <div className="mt-6 flex justify-center">
          <JoinButton>{CTA_BAND.button}</JoinButton>
        </div>
      </div>
    </section>
  );
}
