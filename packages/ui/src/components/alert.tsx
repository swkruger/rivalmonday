import * as React from "react"
import { CircleAlert, Info, TriangleAlert, type LucideIcon } from "lucide-react"
import { cn } from "../lib/cn"

export type AlertTone = "info" | "warning" | "danger" | "neutral"

// Literal class strings so Tailwind's scanner sees them (09 § 4.6).
const toneClass: Record<AlertTone, string> = {
  info: "bg-primary-soft",
  warning: "bg-warning-surface shadow-[inset_3px_0_0_var(--warning)]",
  danger: "bg-chip-danger-bg",
  neutral: "bg-muted-surface",
}

const iconClass: Record<AlertTone, string> = {
  info: "text-chip-info-text",
  warning: "text-warning",
  danger: "text-danger-text",
  neutral: "text-muted-ink",
}

/** Default glyph per tone (colour is never the only signal); neutral has none. `icon={null}` suppresses. */
const defaultIcon: Record<AlertTone, LucideIcon | null> = {
  info: Info,
  warning: TriangleAlert,
  danger: CircleAlert,
  neutral: null,
}

/** Inline message block (spec § 4.3, 09 § 4.6). Danger announces assertively (`role="alert"`), the rest politely. */
function Alert({
  tone,
  icon,
  title,
  children,
  className,
}: {
  tone: AlertTone
  /** Lucide glyph; defaults per tone, `null` = none. */
  icon?: LucideIcon | null
  title?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  const Icon = icon === undefined ? defaultIcon[tone] : icon
  return (
    <div
      data-slot="alert"
      data-tone={tone}
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex gap-2.5 rounded-sm px-4 py-3 text-13 text-ink", toneClass[tone], className)}
    >
      {Icon ? <Icon aria-hidden className={cn("mt-px size-4 shrink-0", iconClass[tone])} /> : null}
      <div className="flex min-w-0 flex-col gap-0.5">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div>{children}</div>
      </div>
    </div>
  )
}

export { Alert }
