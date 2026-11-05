import * as React from "react"
import { Slot } from "radix-ui"
import { cn } from "../lib/cn"
import { tabsLinkActiveClass, tabsListClass, tabsSegmentedItemClass, tabsSegmentedListClass, tabsTriggerClass, type TabsVariant } from "./tabs-classes"

/**
 * URL-driven views that look like `Tabs` (15a §2.8): a labelled `<nav>` of links, the current one marked
 * `aria-current="page"` — the right pattern when each view has its own URL (no tablist/tabpanel roles, no client
 * state). Server-safe; pass `asChild` to render the app's own link (e.g. `next/link`).
 */
function TabsLinkList({ className, variant = "underline", ...props }: React.ComponentProps<"nav"> & { variant?: TabsVariant }) {
  return (
    <nav
      data-slot="tabs-link-list"
      data-variant={variant}
      className={cn(variant === "segmented" ? tabsSegmentedListClass : tabsListClass, className)}
      {...props}
    />
  )
}

function TabsLink({
  asChild,
  active,
  className,
  variant = "underline",
  ...props
}: React.ComponentProps<"a"> & { asChild?: boolean; active?: boolean; variant?: TabsVariant }) {
  const Comp = asChild ? Slot.Root : "a"
  return (
    <Comp
      data-slot="tabs-link"
      data-variant={variant}
      aria-current={active ? "page" : undefined}
      className={cn(variant === "segmented" ? tabsSegmentedItemClass : cn(tabsTriggerClass, tabsLinkActiveClass), className)}
      {...props}
    />
  )
}

export { TabsLink, TabsLinkList }
