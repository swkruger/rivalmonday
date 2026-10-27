import * as React from "react"
import { cn } from "../lib/cn"

/** Category label (not a state): neutral, square-ish. */
function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span data-slot="tag" className={cn("inline-flex h-5 items-center rounded-xs bg-muted-surface px-1.5 text-xs text-ink-secondary", className)}>
      {children}
    </span>
  )
}

export { Tag }
