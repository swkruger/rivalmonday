import * as React from "react"
import { cn } from "../lib/cn"

export interface FrameProps extends React.ComponentProps<"div"> {
  /** Drop the padding (lists whose rows pad themselves). */
  flush?: boolean
}

/** A neutral bordered frame (design system: independent object). */
function Frame({ flush, className, ...props }: FrameProps) {
  return (
    <div
      data-slot="frame"
      data-flush={flush ? "true" : undefined}
      className={cn("rounded-md border border-line bg-surface", flush ? undefined : "p-4", className)}
      {...props}
    />
  )
}

export { Frame }
