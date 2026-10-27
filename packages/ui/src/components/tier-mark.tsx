import { TIER_LABELS } from "@cs/core"
import { cn } from "../lib/cn"

export type TierKey = keyof typeof TIER_LABELS

// Literal strings so Tailwind sees them. The square is a state glyph: full / half / empty.
const markClass: Record<TierKey, string> = {
  top: "bg-secondary",
  watch: "bg-[linear-gradient(90deg,var(--secondary)_50%,var(--line-control)_50%)]",
  minor: "bg-line-control",
}

function TierMark({ tier, className }: { tier: TierKey; className?: string }) {
  return (
    <span data-slot="tier-mark" data-tier={tier} className={cn("inline-flex items-center gap-1.5 text-xs whitespace-nowrap", className)}>
      <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-[2px]", markClass[tier])} />
      <span className={tier === "minor" ? "font-medium text-muted-ink" : "font-semibold text-ink"}>{TIER_LABELS[tier]}</span>
    </span>
  )
}

export { TierMark }
