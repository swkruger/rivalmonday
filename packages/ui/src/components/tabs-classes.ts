/**
 * The Tabs look, shared by the Radix `Tabs` (client state) and `TabsLink` (URL-driven views, server-safe). Plain
 * strings in a module without "use client" so server components can import them. Each active state is spelled out
 * in full (`data-[state=active]:` for triggers, `aria-[current=page]:` for links) so Tailwind's scanner sees it.
 */
export const tabsListClass = "inline-flex h-9 w-fit items-center justify-center rounded-lg bg-muted-surface p-[3px] text-muted-ink"

export const tabsTriggerClass =
  "inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-sm border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-muted-ink transition-[color,box-shadow] hover:text-ink focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"

export const tabsTriggerActiveClass =
  "data-[state=active]:border-border data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-sm"

export const tabsLinkActiveClass =
  "aria-[current=page]:border-border aria-[current=page]:bg-surface aria-[current=page]:text-ink aria-[current=page]:shadow-sm"
