import { cn } from "../lib/cn"

/** Loading placeholder block. Decorative: hidden from assistive tech; pulses only when motion is allowed. */
function Skeleton({ className }: { className?: string }) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("rounded-md bg-muted-surface motion-safe:animate-pulse", className)}
    />
  )
}

export { Skeleton }
