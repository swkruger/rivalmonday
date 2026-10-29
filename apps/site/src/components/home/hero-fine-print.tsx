'use client';

import { HERO } from '../../../content/home';
import { usePilot } from '../shell/pilot-context';

/** The line under the hero CTAs: pilot terms during the pilot, the trial terms (from `PRICING`) once it is off. */
export function HeroFinePrint() {
  const { pilotMode } = usePilot();
  return <p className="mt-3.5 text-13 text-ink-secondary">{pilotMode ? HERO.finePrint : HERO.finePrintTrial}</p>;
}
