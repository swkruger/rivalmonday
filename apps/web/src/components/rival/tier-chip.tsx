import type { Tier } from '@cs/tools';

const TIER: Record<Tier, { label: string; className: string }> = {
  top: { label: 'Top rival', className: 'bg-ink text-white' },
  watch: { label: 'Worth watching', className: 'bg-primary text-white' },
  minor: { label: 'Minor', className: 'bg-muted-surface text-[#4A5D73]' },
};

export const TIER_LABEL: Record<Tier, string> = { top: TIER.top.label, watch: TIER.watch.label, minor: TIER.minor.label };

export function TierChip({ tier }: { tier: Tier }) {
  const t = TIER[tier];
  return <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${t.className}`}>{t.label}</span>;
}
