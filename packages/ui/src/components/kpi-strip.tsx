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
  const named = props["aria-label"] !== undefined || props["aria-labelledby"] !== undefined
  return (
    <div
      data-slot="kpi-strip"
      role={named ? "group" : undefined}
      className={cn(
        "grid grid-cols-2 overflow-clip rounded-md border border-line md:auto-cols-fr md:grid-flow-col md:grid-cols-none *:data-[slot=kpi]:max-md:last:odd:col-span-2",
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

export type KpiTone = "brand" | "good" | "warn" | "bad"

/** Runs of known points, oldest first, in a 0-100 box; the trace fills the cell's lower part. NULL stays a gap, never a guess. */
export function kpiTraceRuns(points: readonly (number | null)[]): [number, number][][] {
  const known = points.filter((p): p is number => p !== null)
  if (known.length < 2 || known.every((v) => v === 0)) return []
  const min = Math.min(...known)
  const span = Math.max(...known) - min
  const x = (i: number) => (i * 100) / (points.length - 1)
  // A flat history draws a flat line part way up, not along the floor.
  const y = (v: number) => (span === 0 ? 50 : 92 - ((v - min) / span) * 84)
  const runs: [number, number][][] = []
  let run: [number, number][] = []
  points.forEach((p, i) => {
    if (p === null) {
      if (run.length) runs.push(run)
      run = []
    } else run.push([x(i), y(p)])
  })
  if (run.length) runs.push(run)
  return runs
}

function KpiTrace({ points }: { points: readonly (number | null)[] }) {
  const runs = kpiTraceRuns(points)
  if (runs.length === 0) return null
  const pts = (r: [number, number][]) => r.map(([a, b]) => `${a},${b}`).join(" ")
  return (
    <svg
      aria-hidden
      data-slot="kpi-trace"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-11 w-full"
    >
      {runs.map((r, i) => (
        <g key={i}>
          {r.length > 1 && <polygon className="rm-kpi-trace-area" points={`${r[0]![0]},100 ${pts(r)} ${r[r.length - 1]![0]},100`} />}
          {r.length > 1 && <polyline className="rm-kpi-trace-line" points={pts(r)} fill="none" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
        </g>
      ))}
    </svg>
  )
}

export interface KpiProps {
  linkAs?: React.ElementType
  label: React.ReactNode
  value: React.ReactNode
  delta?: KpiDelta
  href?: string
  badge?: React.ReactNode
  caption?: React.ReactNode
  /** Real history behind this figure, oldest first. Decoration only: the value and any delta still state the facts. */
  trace?: readonly (number | null)[]
  /** What the trace covers, shown on hover ("Last 8 weeks"). */
  traceLabel?: string
  /** Colour of the wash and trace. Status tones only for a figure that needs attention. */
  tone?: KpiTone
}

function Kpi({ label, value, delta, href, badge, caption, trace, traceLabel, tone = "brand", linkAs: LinkAs = "a" }: KpiProps) {
  const body = (
    <>
      {trace ? <KpiTrace points={trace} /> : null}
      <div className="text-13 text-muted-ink">{label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-[-0.01em] text-ink tabular-nums">
          {value}
        </span>
        {badge}
      </div>
      {delta ? <KpiDeltaPill delta={delta} /> : null}
      {caption ? <div className="mt-1 text-xs text-muted-ink">{caption}</div> : null}
    </>
  )
  // Room under the text, so the trace's line never reads as a strikethrough on the caption.
  const traced = trace !== undefined && kpiTraceRuns(trace).length > 0
  const cell =
    "rm-kpi relative isolate block min-w-0 border-line px-5 py-4 md:[&+&]:border-l max-md:even:border-l max-md:nth-[n+3]:border-t"
  if (href) {
    return (
      <LinkAs
        href={href}
        data-slot="kpi"
        data-kpi-tone={tone}
        title={traced ? traceLabel : undefined}
        className={cn(
          cell,
          traced && "pb-10",
          "transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        )}
      >
        {body}
      </LinkAs>
    )
  }
  return (
    <div data-slot="kpi" data-kpi-tone={tone} title={traced ? traceLabel : undefined} className={cn(cell, traced && "pb-10")}>
      {body}
    </div>
  )
}

export { KpiStrip, Kpi }
