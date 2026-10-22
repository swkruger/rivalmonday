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
      className="sticky bottom-0 z-30 flex items-center justify-end gap-2 border-t bg-surface px-4 py-3 shadow-lg"
    >
      {onReset ? (
        <Button type="button" variant="outline" onClick={onReset} disabled={pending}>
          Discard
        </Button>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : (saveLabel ?? "Save changes")}
      </Button>
    </div>
  )
}

export { SaveBar }
