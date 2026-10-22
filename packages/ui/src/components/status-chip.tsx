import * as React from "react"
import { cn } from "../lib/cn"

export type ChipTone = "neutral" | "info" | "success" | "warning" | "danger"

/** The P2 chip palette (bg/text hex). Single source for the contrast test; mirrors `--chip-<tone>-*` in styles.css. */
export const CHIP_COLOURS: Record<ChipTone, { bg: string; text: string }> = {
  neutral: { bg: "#EEF2F6", text: "#334155" },
  info: { bg: "#E3F2FC", text: "#1F5F8F" },
  success: { bg: "#E7F6EC", text: "#166534" },
  warning: { bg: "#FEF3C7", text: "#92400E" },
  danger: { bg: "#FDECEC", text: "#B91C1C" },
}

// Literal class strings so Tailwind's scanner sees them.
const toneClass: Record<ChipTone, string> = {
  neutral: "bg-chip-neutral-bg text-chip-neutral-text",
  info: "bg-chip-info-bg text-chip-info-text",
  success: "bg-chip-success-bg text-chip-success-text",
  warning: "bg-chip-warning-bg text-chip-warning-text",
  danger: "bg-chip-danger-bg text-chip-danger-text",
}

function StatusChip({
  tone,
  children,
  title,
  className,
}: {
  tone: ChipTone
  children: React.ReactNode
  title?: string
  className?: string
}) {
  return (
    <span
      data-slot="status-chip"
      data-tone={tone}
      title={title}
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export { StatusChip }
