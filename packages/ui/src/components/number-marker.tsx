import { cn } from "../lib/cn"

/** Orange numbered circle (D-33). Decorative: the surrounding `<ol>` carries the order. */
function NumberMarker({ n, size = "md", className }: { n: number; size?: "sm" | "md"; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-slot="number-marker"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-amber font-semibold tabular-nums text-amber-text",
        size === "md" ? "size-7 text-13" : "size-6 text-xs",
        className,
      )}
    >
      {n}
    </span>
  )
}

export { NumberMarker }
