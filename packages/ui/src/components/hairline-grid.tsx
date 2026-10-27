import * as React from "react"
import { cn } from "../lib/cn"

/** Dashboard group without cards (09 § 6.1 B): top hairline, cells divided by hairlines. */
function HairlineGrid({
  className,
  cols = 2,
  ...props
}: React.ComponentProps<"div"> & { cols?: 2 | 3 }) {
  return (
    <div
      data-slot="hairline-grid"
      data-cols={cols}
      className={cn(
        "grid border-t border-line",
        cols === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2",
        className
      )}
      {...props}
    />
  )
}

function HairlineCell({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="hairline-cell"
      className={cn(
        "min-w-0 border-b border-line py-5 lg:pr-6 lg:[&+&]:border-l lg:[&+&]:pl-6",
        className
      )}
      {...props}
    />
  )
}

export { HairlineGrid, HairlineCell }
