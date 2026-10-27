import * as React from "react"
import { cn } from "../lib/cn"

/** Floating bar for an action on the selected rows (design system catalogue, Table "Bulk bar"). */
function BulkBar({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      data-slot="bulk-bar"
      className={cn(
        "sticky bottom-4 z-30 mx-auto flex min-h-11 w-fit max-w-full flex-wrap items-center gap-3 rounded-md bg-ink px-4 py-2 text-13 font-medium text-white shadow-overlay",
        className
      )}
    >
      {children}
    </div>
  )
}

/** Inverse action button for use inside a BulkBar. */
const bulkBarActionClass =
  "bg-surface text-ink hover:bg-canvas disabled:bg-line-control disabled:text-ink disabled:opacity-100"

export { BulkBar, bulkBarActionClass }
