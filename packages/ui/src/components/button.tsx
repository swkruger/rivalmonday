import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../lib/cn"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sm text-13 font-medium whitespace-nowrap transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-45 aria-busy:pointer-events-none aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary font-semibold text-primary-foreground hover:bg-primary-hover active:bg-primary-active",
        destructive: "bg-destructive font-semibold text-white hover:bg-danger-hover",
        "destructive-outline":
          "border border-line-control bg-surface text-danger-text hover:bg-chip-danger-bg",
        outline:
          "border border-line-control bg-surface text-ink hover:bg-canvas [&_svg:not([class*='text-'])]:text-muted-ink",
        ghost: "text-ink-secondary hover:bg-muted-surface hover:text-ink",
        link: "h-auto px-0 text-link underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3 has-[>svg]:px-2.5",
        sm: "h-7 gap-1 px-2.5 text-xs has-[>svg]:px-2",
        lg: "h-11 px-4 text-sm has-[>svg]:px-3.5",
        icon: "size-9",
        "icon-sm": "size-7",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
