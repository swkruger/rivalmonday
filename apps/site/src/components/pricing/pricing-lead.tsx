'use client';

import { PRICING_PAGE } from '../../../content/pricing-page';
import { usePilot } from '../shell/pilot-context';

/** The intro's lead line; it follows pilot mode (pilot on is the server render). Same look as `PageIntro`'s lead. */
export function PricingLead({ side }: { side: 'agency' | 'business' }) {
  const { pilotMode } = usePilot();
  const copy = PRICING_PAGE[side];
  return <p className="mt-4 text-lg leading-relaxed text-ink-secondary">{pilotMode ? copy.lead : copy.leadTrial}</p>;
}
