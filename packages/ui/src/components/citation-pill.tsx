import * as React from "react"
import { FileText, type LucideIcon } from "lucide-react"
import { cn } from "../lib/cn"

/** Inline evidence citation. Name: "Evidence: {source}, {date}". Opens the evidence view (wiring: 16d). */
function CitationPill({
  href,
  source,
  date,
  icon: Icon = FileText,
  className,
}: {
  href: string
  source: string
  date: string
  icon?: LucideIcon
  className?: string
}) {
  return (
    <a
      data-slot="citation-pill"
      href={href}
      aria-label={`Evidence: ${source}, ${date}`}
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-xs bg-muted-surface px-1.5 align-[1px] text-xs font-medium text-ink-secondary hover:bg-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-[11px] shrink-0" />
      <span aria-hidden="true">{source}</span>
    </a>
  )
}

export { CitationPill }
