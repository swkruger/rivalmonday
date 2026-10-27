import * as React from "react"
import { cn } from "../lib/cn"

export interface SectionProps {
  title?: React.ReactNode
  /** Rendered beside the heading, outside it (e.g. a help tip), so the heading's accessible name stays the title. */
  titleAside?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  as?: "h2" | "h3"
  ruled?: boolean
  /** Opt in: makes the section a named region (aria-labelledby the heading). Needs a `title`. */
  labelled?: boolean
  className?: string
  children?: React.ReactNode
}

function Section({
  title,
  titleAside,
  description,
  actions,
  as: Heading = "h2",
  ruled,
  labelled,
  className,
  children,
}: SectionProps) {
  const headingId = React.useId()
  const labelId = labelled && title ? headingId : undefined
  return (
    <section
      data-slot="section"
      aria-labelledby={labelId}
      className={cn(
        "flex flex-col gap-4",
        ruled && "border-t border-line pt-6",
        className
      )}
    >
      {title || description || actions ? (
        <div data-slot="section-head" className="flex flex-wrap items-end gap-3">
          <div>
            {title && titleAside ? (
              <div className="flex items-center gap-1.5">
                <Heading id={labelId} className="text-base font-semibold text-ink">{title}</Heading>
                {titleAside}
              </div>
            ) : title ? (
              <Heading id={labelId} className="text-base font-semibold text-ink">{title}</Heading>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-13 text-muted-ink">{description}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="ml-auto flex items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export { Section }
