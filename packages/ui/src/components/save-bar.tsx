"use client"

import { Button } from "./button"

/** Sticky "unsaved changes" bar. Renders its submit button inside the parent `<form>`; hidden while clean. */
function SaveBar({
  dirty,
  pending,
  onReset,
  saveLabel,
}: {
  dirty: boolean
  pending: boolean
  onReset?: () => void
  saveLabel?: string
}) {
  if (!dirty && !pending) return null
  return (
    <div
      role="region"
      aria-label="Unsaved changes"
      data-slot="save-bar"
      className="sticky bottom-4 z-30 mx-auto flex w-full max-w-[640px] items-center gap-2 rounded-md border border-line bg-surface px-4 py-3 text-13 font-medium text-ink shadow-overlay"
    >
      <span className="mr-auto">Unsaved changes</span>
      {onReset ? (
        <Button type="button" variant="ghost" size="sm" onClick={onReset} disabled={pending}>
          Discard
        </Button>
      ) : null}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : (saveLabel ?? "Save changes")}
      </Button>
    </div>
  )
}

export { SaveBar }
