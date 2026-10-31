"use client"

import * as React from "react"
import { cn } from "../lib/cn"

// A horizontally scrolling table must be keyboard-reachable (axe scrollable-region-focusable).
// Returns null while it fits, else the table's own name (aria-label, then caption; "" if none).
function useOverflowName(ref: React.RefObject<HTMLDivElement | null>) {
  const [name, setName] = React.useState<string | null>(null)
  React.useLayoutEffect(() => {
    const box = ref.current
    if (!box) return
    const check = () => {
      if (box.scrollWidth <= box.clientWidth) return setName(null)
      const table = box.querySelector("table")
      setName(table?.getAttribute("aria-label") ?? table?.querySelector("caption")?.textContent?.trim() ?? "")
    }
    check()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(check)
    observer.observe(box)
    return () => observer.disconnect()
  }, [ref])
  return name
}

function Table({
  className,
  density,
  ...props
}: React.ComponentProps<"table"> & { density?: "compact" }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const scrollName = useOverflowName(ref)
  return (
    <div
      ref={ref}
      data-slot="table-container"
      className="rm-scroll-x relative w-full overflow-x-auto focus-visible:outline-2 outline-offset-2 outline-ring"
      {...(scrollName !== null
        ? { tabIndex: 0, role: "region", "aria-label": scrollName || undefined }
        : {})}
    >
      <table
        data-slot="table"
        data-density={density}
        className={cn(
          "w-full caption-bottom text-13 leading-[18px] data-[density=compact]:[&_td]:h-8",
          className
        )}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b [&_tr]:border-line", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-line-subtle transition-colors hover:bg-canvas has-aria-expanded:bg-canvas data-[state=selected]:bg-primary-soft",
        className
      )}
      {...props}
    />
  )
}

function TableHead({
  className,
  numeric,
  ...props
}: React.ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-9 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-ink first:pl-0 last:pr-0 aria-[sort]:text-ink [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        numeric && "text-right tabular-nums",
        className
      )}
      {...props}
    />
  )
}

function TableCell({
  className,
  numeric,
  ...props
}: React.ComponentProps<"td"> & { numeric?: boolean }) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "h-10 px-3 align-middle whitespace-nowrap text-ink-secondary first:pl-0 last:pr-0 [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        numeric && "text-right tabular-nums",
        className
      )}
      {...props}
    />
  )
}

/**
 * A table inside a mixed page (09 § 4.7): bordered, rounded frame with a canvas header row. `overflow-clip` keeps
 * the header fill inside the radius; it clips descendants' focus outlines like any overflow does, so focusables
 * inside get inset outlines (`-outline-offset-2`, important to beat their own `outline-offset-2`).
 */
function TableFrame({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="table-frame"
      className={cn(
        "min-w-0 max-w-full overflow-clip rounded-md border border-line [&_:focus-visible]:-outline-offset-2! [&_thead_tr]:bg-canvas [&_th:first-child]:pl-4 [&_th:last-child]:pr-4 [&_td:first-child]:pl-4 [&_td:last-child]:pr-4",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  TableFrame,
}
