"use client"

import * as React from "react"
import { cn } from "../lib/cn"
import { Tooltip as TooltipPrimitive } from "radix-ui"

/** One provider per group of tooltips (e.g. a pill row). */
const TooltipProvider = TooltipPrimitive.Provider

/** Wraps a trigger with a small ink tooltip; opens on hover and keyboard focus. */
function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactElement; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            data-slot="tooltip-content"
            side={side}
            sideOffset={6}
            className={cn("z-50 max-w-64 rounded-md bg-ink px-2.5 py-1.5 text-xs text-white shadow-md")}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-ink" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export { Tooltip, TooltipProvider }
