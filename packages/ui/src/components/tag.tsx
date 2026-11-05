import * as React from "react"
import { cn } from "../lib/cn"
import { chipToneClass, type ChipTone } from "./status-chip"

/** Category label (not a state): neutral, square-ish; `tone` borrows the chip palette, `emphasis="strong"` is 6 px / 600. */
function Tag({
  children,
  className,
  tone = "neutral",
  emphasis = "default",
}: {
  children: React.ReactNode
  className?: string
  tone?: ChipTone
  emphasis?: "default" | "strong"
}) {
  return (
    <span
      data-slot="tag"
      data-tone={tone}
      className={cn(
        tone === "neutral"
          ? "inline-flex h-5 items-center rounded-xs bg-muted-surface px-1.5 text-xs text-ink-secondary"
          : cn("inline-flex h-5 items-center rounded-xs px-1.5 text-xs", chipToneClass[tone]),
        emphasis === "strong" && "rounded-sm px-2 font-semibold",
        className,
      )}
    >
      {children}
    </span>
  )
}

export { Tag }
