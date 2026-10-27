"use client"

import * as React from "react"
import { ToggleGroup } from "radix-ui"
import { cn } from "../lib/cn"

/** Switches a range or view of the same data (not navigation): a single-select radiogroup (design system 4.3). */
function Segmented({
  value,
  onValueChange,
  items,
  className,
  "aria-label": ariaLabel,
}: {
  value: string
  onValueChange: (v: string) => void
  items: { value: string; label: React.ReactNode; disabled?: boolean }[]
  "aria-label": string
  className?: string
}) {
  return (
    <ToggleGroup.Root
      type="single"
      data-slot="segmented"
      aria-label={ariaLabel}
      value={value}
      onValueChange={(v) => {
        if (v) onValueChange(v)
      }}
      className={cn("inline-flex gap-0.5 rounded-sm bg-muted-surface p-0.5", className)}
    >
      {items.map((item) => (
        <ToggleGroup.Item
          key={item.value}
          value={item.value}
          disabled={item.disabled}
          data-slot="segmented-item"
          className="inline-flex h-6 items-center justify-center rounded-xs border border-transparent px-2.5 text-xs font-medium whitespace-nowrap text-ink-secondary transition-colors outline-none hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-45 data-[state=on]:border-line data-[state=on]:bg-surface data-[state=on]:font-semibold data-[state=on]:text-ink"
        >
          {item.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}

export { Segmented }
