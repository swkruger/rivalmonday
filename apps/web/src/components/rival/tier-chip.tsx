import type { Tier } from '@cs/tools';

/** Small soft pills (competitor-ui-v2 mockup): Top rival slate, Worth watching soft primary, Minor pale grey. */
const TIER: Record<Tier, { label: string; className: string }> = {
  top: { label: 'Top rival', className: 'bg-[#E2E8F0] text-ink' },
  watch: { label: 'Worth watching', className: 'bg-primary-soft text-primary-soft-text' },
  minor: { label: 'Minor', className: 'bg-[#F1F5F9] text-[#4A5D73]' },
};

export const TIER_LABEL: Record<Tier, string> = { top: TIER.top.label, watch: TIER.watch.label, minor: TIER.minor.label };

export function TierChip({ tier }: { tier: Tier }) {
  const t = TIER[tier];
  return <span className={`inline-flex w-fit items-center rounded-full px-2 py-px text-[11px] font-bold whitespace-nowrap ${t.className}`}>{t.label}</span>;
}
