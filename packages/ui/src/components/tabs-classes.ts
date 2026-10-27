/**
 * The Tabs look, shared by the Radix `Tabs` (client state) and `TabsLink` (URL-driven views, server-safe). Plain
 * strings in a module without "use client" so server components can import them. Each active state is spelled out
 * in full (`data-[state=active]:` for triggers, `aria-[current=page]:` for links) so Tailwind's scanner sees it.
 * Underline tabs (design system 4.3); range/view switches of the same data use `Segmented`.
 */
export const tabsListClass = "inline-flex h-10 w-full items-end gap-6 border-b border-line text-muted-ink"

export const tabsTriggerClass =
  "relative inline-flex h-10 items-center gap-1.5 text-13 font-medium whitespace-nowrap text-muted-ink transition-colors outline-none hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"

export const tabsTriggerActiveClass =
  "data-[state=active]:font-semibold data-[state=active]:text-ink data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-0.5 data-[state=active]:after:rounded-t-sm data-[state=active]:after:bg-ink"

export const tabsLinkActiveClass =
  "aria-[current=page]:font-semibold aria-[current=page]:text-ink aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-0 aria-[current=page]:after:-bottom-px aria-[current=page]:after:h-0.5 aria-[current=page]:after:rounded-t-sm aria-[current=page]:after:bg-ink"

/** Count badge inside a tab label. */
export const tabsCountClass =
  "inline-grid h-[18px] min-w-[18px] place-items-center rounded-xs bg-muted-surface px-1 text-11 font-semibold tabular-nums text-ink-secondary"
