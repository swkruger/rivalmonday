import * as React from "react"
import { cn } from "../lib/cn"

export interface BandProps extends React.ComponentProps<"div"> {
  tone?: "canvas" | "muted"
}

function Band({ tone = "canvas", className, ...props }: BandProps) {
  return (
    <div
      data-slot="band"
      data-tone={tone}
      className={cn(
        "rounded-md",
        tone === "muted" ? "bg-muted-surface p-4" : "bg-canvas px-5 py-4",
        className
      )}
      {...props}
    />
  )
}

export { Band }
