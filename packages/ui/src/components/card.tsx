import * as React from "react"
import { cn } from "../lib/cn"

function Card({
  className,
  variant = "default",
  selected,
  ...props
}: React.ComponentProps<"div"> & {
  variant?: "default" | "interactive"
  selected?: boolean
}) {
  return (
    <div
      data-slot="card"
      data-variant={variant}
      data-selected={selected ? "true" : undefined}
      className={cn(
        "flex flex-col rounded-md border border-line bg-card text-card-foreground",
        variant === "interactive" &&
          "transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
        variant === "interactive" &&
          !selected &&
          "hover:border-line-control hover:bg-canvas",
        selected && "border-secondary bg-primary-soft ring-1 ring-inset ring-secondary",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 border-b border-line px-4 py-3 has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("text-sm leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("p-4", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center gap-3 border-t border-line bg-canvas px-4 py-3 text-13 text-muted-ink", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
