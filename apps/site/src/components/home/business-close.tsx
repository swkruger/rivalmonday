'use client';

import { ArrowRight } from 'lucide-react';
import { BUSINESS } from '../../../content/business';
import { JoinButton } from '../join/join-button';
import { JOIN_INK_CLASS } from '../join/join-classes';
import { usePilot } from '../shell/pilot-context';
import { InkBand } from './cta-band';

/** `/business`'s closing band (`#join`): one ask, the waitlist. */
export function BusinessClose() {
  const { pilotMode } = usePilot();
  const { close } = BUSINESS;
  return (
    <InkBand id="join" labelledBy="close-heading">
      <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
        <h2 id="close-heading" className="text-section font-semibold text-surface">{close.heading}</h2>
        <p className="mt-4 max-w-xl text-lg text-muted-surface">{pilotMode ? close.body : close.bodyTrial}</p>
        <div className="mt-7">
          <JoinButton start="business" className={JOIN_INK_CLASS}>
            {close.button}
            <ArrowRight aria-hidden="true" className="size-4.5" />
          </JoinButton>
        </div>
      </div>
    </InkBand>
  );
}
