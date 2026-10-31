'use client';

import { CTA_BAND, HERO, PRICING_HEADING_TRIAL, PRICING_LINES, PRICING_LINES_TRIAL, SECTIONS } from '../../../content/home';
import { PRICING } from '../../../content/pricing';
import { JoinButton } from '../join/join-button';
import { usePilot } from '../shell/pilot-context';
import { InkBand } from './cta-band';

/**
 * The home page's close: pricing and the last call to action as one ink band, so the page never asks twice in a row.
 * Every figure comes from `PRICING` (directly or through `PRICING_LINES` / `PRICING_LINES_TRIAL`). During the pilot
 * the heading says it is free, and the fine print adds what the plans don't; after it, the plans already say it all.
 */
export function PricingTeaser() {
  const { pilotMode } = usePilot();
  const lines = pilotMode ? PRICING_LINES : PRICING_LINES_TRIAL;
  const plans = [
    { slot: 'pricing-agency', who: 'Agencies', price: PRICING.agency.monthlyUsd, line: lines.agency },
    { slot: 'pricing-business', who: 'Local businesses', price: PRICING.business.monthlyUsd, line: lines.business },
  ];
  return (
    <InkBand id="join" labelledBy="pricing-heading">
      <div id="pricing" className="scroll-mt-20">
        <h2 id="pricing-heading" className="text-section font-semibold text-surface">
          {pilotMode ? SECTIONS.pricing.heading : PRICING_HEADING_TRIAL}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-surface">{SECTIONS.pricing.body}</p>
        <div className="mx-auto mt-10 grid max-w-4xl gap-px overflow-hidden rounded-lg border border-line bg-line text-left md:grid-cols-2">
          {plans.map((p) => (
            <div key={p.slot} className="flex flex-col gap-3 bg-surface p-6 md:p-8">
              <p className="text-sm font-semibold text-ink">{p.who}</p>
              <p className="flex items-baseline gap-1 text-ink">
                <span className="text-4xl font-semibold tracking-tight tabular-nums">${p.price}</span>
                <span className="text-sm text-ink-secondary">/mo{pilotMode ? ' after the pilot' : ''}</span>
              </p>
              <p data-slot={p.slot} className="text-sm text-ink-secondary">{p.line}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex justify-center">
          <JoinButton>{CTA_BAND.button}</JoinButton>
        </div>
        {pilotMode && <p className="mt-4 text-13 text-surface">{HERO.finePrint}</p>}
      </div>
    </InkBand>
  );
}
