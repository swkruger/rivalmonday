'use client';

import { HERO } from '../../../content/home';
import { usePilot } from '../shell/pilot-context';

/** The "Pilot" pill: the one orange highlight on the first screen besides Friday. Gone when the pilot is off. */
export function PilotPill() {
  const { pilotMode } = usePilot();
  if (!pilotMode) return null;
  return <span className="rounded-full bg-amber px-2 py-0.5 text-xs font-semibold text-amber-text">{HERO.eyebrowPill}</span>;
}
