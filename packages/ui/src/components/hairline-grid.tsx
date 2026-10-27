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
        cols === 3
          ? "lg:grid-cols-3 lg:[&>*:nth-child(3n+2)]:border-l lg:[&>*:nth-child(3n+2)]:pl-6 lg:[&>*:nth-child(3n+3)]:border-l lg:[&>*:nth-child(3n+3)]:pl-6 lg:[&>*:nth-child(3n+1)]:pr-6 lg:[&>*:nth-child(3n+2)]:pr-6"
          : "lg:grid-cols-2 lg:[&>*:nth-child(2n)]:border-l lg:[&>*:nth-child(2n)]:pl-6 lg:[&>*:nth-child(2n+1)]:pr-6",
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
        "min-w-0 border-b border-line py-5",
        className
      )}
      {...props}
    />
  )
}

export { HairlineGrid, HairlineCell }
