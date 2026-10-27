import * as React from "react"
import { ArrowDown, ArrowUp } from "lucide-react"
import { cn } from "../lib/cn"

export type KpiDelta = {
  value: number
  unit?: string
  goodWhen: "up" | "down" | "neutral"
  comparison: string
}

function KpiStrip({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="kpi-strip"
      className={cn(
        "grid grid-cols-2 rounded-md border border-line md:auto-cols-fr md:grid-flow-col md:grid-cols-none",
        className
      )}
      {...props}
    />
  )
}

function deltaTone(d: KpiDelta): "good" | "bad" | "neutral" {
  if (d.value === 0 || d.goodWhen === "neutral") return "neutral"
  const dir = d.value > 0 ? "up" : "down"
  return dir === d.goodWhen ? "good" : "bad"
}

function KpiDeltaPill({ delta }: { delta: KpiDelta }) {
  const tone = deltaTone(delta)
  const abs = Math.abs(delta.value)
  const word = delta.value === 0 ? "No change" : delta.value > 0 ? "Up" : "Down"
  const label =
    delta.value === 0
      ? `No change ${delta.comparison}`
      : `${word} ${abs}${delta.unit ?? ""} ${delta.comparison}`
  const Arrow = delta.value > 0 ? ArrowUp : delta.value < 0 ? ArrowDown : null
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <span
        role="img"
        aria-label={label}
        data-slot="kpi-delta"
        data-tone={tone}
        className={cn(
          "inline-flex h-5 items-center gap-0.5 rounded-xs px-1.5 text-xs font-semibold tabular-nums",
          tone === "good" && "bg-chip-success-bg text-success-text",
          tone === "bad" && "bg-chip-danger-bg text-danger-text",
          tone === "neutral" && "bg-muted-surface text-muted-ink"
        )}
      >
        {Arrow ? <Arrow aria-hidden className="size-3" /> : null}
        <span aria-hidden>
          {delta.value > 0 ? "+" : delta.value < 0 ? "-" : ""}
          {abs}
          {delta.unit ?? ""}
        </span>
      </span>
      <span aria-hidden className="text-xs text-muted-ink">
        {delta.comparison}
      </span>
    </div>
  )
}

export interface KpiProps {
  label: React.ReactNode
  value: React.ReactNode
  delta?: KpiDelta
  href?: string
}

function Kpi({ label, value, delta, href }: KpiProps) {
  const body = (
    <>
      <div className="text-13 text-muted-ink">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-[-0.01em] text-ink tabular-nums">
        {value}
      </div>
      {delta ? <KpiDeltaPill delta={delta} /> : null}
    </>
  )
  const cell =
    "block min-w-0 px-5 py-4 border-line [&+&]:border-l"
  if (href) {
    return (
      <a
        href={href}
        data-slot="kpi"
        className={cn(
          cell,
          "transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        )}
      >
        {body}
      </a>
    )
  }
  return (
    <div data-slot="kpi" className={cell}>
      {body}
    </div>
  )
}

export { KpiStrip, Kpi }
