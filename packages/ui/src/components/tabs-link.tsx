import * as React from "react"
import { Slot } from "radix-ui"
import { cn } from "../lib/cn"
import { tabsLinkActiveClass, tabsListClass, tabsTriggerClass } from "./tabs-classes"

/**
 * URL-driven views that look like `Tabs` (15a §2.8): a labelled `<nav>` of links, the current one marked
 * `aria-current="page"` — the right pattern when each view has its own URL (no tablist/tabpanel roles, no client
 * state). Server-safe; pass `asChild` to render the app's own link (e.g. `next/link`).
 */
function TabsLinkList({ className, ...props }: React.ComponentProps<"nav">) {
  return <nav data-slot="tabs-link-list" className={cn(tabsListClass, className)} {...props} />
}

function TabsLink({
  asChild,
  active,
  className,
  ...props
}: React.ComponentProps<"a"> & { asChild?: boolean; active?: boolean }) {
  const Comp = asChild ? Slot.Root : "a"
  return (
    <Comp
      data-slot="tabs-link"
      aria-current={active ? "page" : undefined}
      className={cn(tabsTriggerClass, tabsLinkActiveClass, className)}
      {...props}
    />
  )
}

export { TabsLink, TabsLinkList }
