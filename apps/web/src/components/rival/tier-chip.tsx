import { TIER_LABELS } from '@cs/core';
import type { Tier } from '@cs/tools';
import { TierMark } from '@cs/ui';

export const TIER_LABEL: Record<Tier, string> = { top: TIER_LABELS.top, watch: TIER_LABELS.watch, minor: TIER_LABELS.minor };

/** Thin web wrapper: the tier is shown as a `TierMark` (state glyph + label). */
export function TierChip({ tier }: { tier: Tier }) {
  return <TierMark tier={tier} />;
}
