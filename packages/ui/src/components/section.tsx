import * as React from "react"
import { cn } from "../lib/cn"

export interface SectionProps {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  as?: "h2" | "h3"
  ruled?: boolean
  className?: string
  children?: React.ReactNode
}

function Section({
  title,
  description,
  actions,
  as: Heading = "h2",
  ruled,
  className,
  children,
}: SectionProps) {
  return (
    <section
      data-slot="section"
      className={cn(
        "flex flex-col gap-4",
        ruled && "border-t border-line pt-6",
        className
      )}
    >
      {title || description || actions ? (
        <div data-slot="section-head" className="flex items-end gap-3">
          <div>
            {title ? (
              <Heading className="text-base font-semibold text-ink">{title}</Heading>
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
