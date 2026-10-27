import * as React from "react"
import { cn } from "../lib/cn"

export type DotTone = "success" | "warning" | "danger" | "info" | "neutral" | "off"

const dotClass: Record<DotTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-secondary",
  neutral: "bg-muted-ink",
  off: "border-[1.5px] border-line-strong",
}

/** Lifecycle state: a dot plus a text label (never colour alone). */
function DotStatus({ tone, children, className }: { tone: DotTone; children: React.ReactNode; className?: string }) {
  return (
    <span data-slot="dot-status" data-tone={tone} className={cn("inline-flex items-center gap-1.5 text-13 text-ink-secondary", className)}>
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", dotClass[tone])} />
      {children}
    </span>
  )
}

export { DotStatus }
