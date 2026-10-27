import * as React from "react"
import { FileText, type LucideIcon } from "lucide-react"
import { cn } from "../lib/cn"

/** The pill's class string; exported so Article/Data chips in the Ask answer can share the look. */
export const citationPillClass =
  "inline-flex h-5 max-w-full items-center gap-1 rounded-xs bg-muted-surface px-1.5 align-[1px] text-xs font-medium text-ink-secondary hover:bg-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

type CitationPillProps = { href?: string; asChild?: boolean; children?: React.ReactElement; icon?: LucideIcon; className?: string } & (
  | { source: string; date?: string; n?: number }
  | { source?: undefined; date?: undefined; n: number }
)

/**
 * Inline evidence citation. Shows the source (or "Evidence n" without one). Name: "Evidence[ n][: {source}][, {date}]".
 */
function CitationPill({ href, asChild, children, source, date, n, icon: Icon = FileText, className }: CitationPillProps) {
  const label = (n === undefined ? "Evidence" : `Evidence ${n}`) + (source ? `: ${source}` : "") + (date ? `, ${date}` : "")
  const props = { "data-slot": "citation-pill", "aria-label": label, className: cn(citationPillClass, className) }
  const content = (
    <>
      <Icon aria-hidden="true" className="size-[11px] shrink-0" />
      <span aria-hidden="true" className="truncate">
        {source ?? `Evidence ${n}`}
      </span>
    </>
  )
  // asChild: the single child element (e.g. next/link) becomes the anchor and receives the pill's props and content.
  if (asChild && children) return React.cloneElement(children, props, content)
  return (
    <a href={href} {...props}>
      {content}
    </a>
  )
}

export { CitationPill }
export type { CitationPillProps }
