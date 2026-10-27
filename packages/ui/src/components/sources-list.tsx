import * as React from "react"
import { FileText, type LucideIcon } from "lucide-react"
import { cn } from "../lib/cn"

export type SourceItem = { href: string; title: string; date: string; icon?: LucideIcon }

/** Ruled list of the evidence behind a claim: icon, title, date. */
function SourcesList({ items, className }: { items: SourceItem[]; className?: string }) {
  return (
    <ul data-slot="sources-list" className={cn("m-0 flex list-none flex-col border-t border-line p-0 text-xs", className)}>
      {items.map((it) => {
        const Icon = it.icon ?? FileText
        return (
          <li key={it.href} className="border-b border-line-subtle last:border-b-0">
            <a href={it.href} className="flex items-center gap-2 py-2 text-ink-secondary hover:text-ink focus-visible:outline-2 focus-visible:outline-ring">
              <Icon aria-hidden="true" className="size-3 shrink-0" />
              <span className="min-w-0 truncate">{it.title}</span>
              <span className="ml-auto shrink-0 text-muted-ink">{it.date}</span>
            </a>
          </li>
        )
      })}
    </ul>
  )
}

export { SourcesList }
