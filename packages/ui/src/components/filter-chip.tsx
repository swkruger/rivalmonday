import * as React from "react"
import { X } from "lucide-react"
import { cn } from "../lib/cn"

type FilterChipProps = React.ComponentProps<"button"> & {
  applied?: boolean
  dashed?: boolean
  pressed?: boolean
  field?: string
  /** With `applied`, renders the remove (x) button. */
  onRemove?: () => void
}

const base =
  "inline-flex h-7 items-center gap-1 rounded-full border border-line-control bg-surface px-2.5 text-xs font-medium text-ink-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

function FilterChip({ applied, dashed, pressed, field, onRemove, className, children, ...props }: FilterChipProps) {
  const state = cn(
    applied && "border-transparent bg-primary-soft text-primary-soft-text",
    dashed && "border-dashed text-muted-ink",
    pressed && "border-transparent bg-ink text-white",
  )
  if (applied && onRemove) {
    return (
      <span data-slot="filter-chip" data-applied="true" className={cn(base, state, "gap-1.5", className)}>
        <span>{children}</span>
        <button
          type="button"
          aria-label={`Remove filter ${field ?? ""}`.trim()}
          onClick={onRemove}
          className="inline-grid size-4 place-items-center rounded-full hover:bg-primary-soft-text/15 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <X aria-hidden="true" className="size-3" />
        </button>
      </span>
    )
  }
  return (
    <button
      type="button"
      data-slot="filter-chip"
      data-applied={applied ? "true" : undefined}
      aria-pressed={pressed === undefined ? undefined : pressed}
      className={cn(base, state, className)}
      {...props}
    >
      {children}
    </button>
  )
}

export { FilterChip }
