import * as React from "react"
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react"
import { cn } from "../lib/cn"

export type ChipTone = "neutral" | "info" | "success" | "warning" | "danger"

/** The P2 chip palette (bg/text hex). Single source for the contrast test; mirrors `--chip-<tone>-*` in styles.css. */
export const CHIP_COLOURS: Record<ChipTone, { bg: string; text: string }> = {
  neutral: { bg: "#EEF2F6", text: "#334155" },
  info: { bg: "#E3F2FC", text: "#1F5F8F" },
  success: { bg: "#E7F6EC", text: "#166534" },
  warning: { bg: "#FFF7E6", text: "#92400E" },
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

/** Default glyph per tone (colour is never the only signal); neutral has none. `icon={null}` suppresses. */
const defaultIcon: Record<ChipTone, LucideIcon | null> = {
  neutral: null,
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
}

function StatusChip({
  tone,
  children,
  title,
  icon,
  className,
}: {
  tone: ChipTone
  children: React.ReactNode
  title?: string
  /** Lucide glyph; defaults per tone, `null` = none. */
  icon?: LucideIcon | null
  className?: string
}) {
  const Icon = icon === undefined ? defaultIcon[tone] : icon
  return (
    <span
      data-slot="status-chip"
      data-tone={tone}
      title={title}
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-xs px-1.5 text-xs font-medium whitespace-nowrap",
        toneClass[tone],
        tone === "warning" && "shadow-[inset_0_0_0_1px_rgb(217_119_6/0.25)]",
        className,
      )}
    >
      {Icon ? <Icon aria-hidden="true" className="size-3 shrink-0" /> : null}
      {children}
    </span>
  )
}

export { StatusChip }
