"use client"

import * as React from "react"
import { useFormStatus } from "react-dom"
import { Button } from "./button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog"
import { Input } from "./input"
import { Label } from "./label"

interface ConfirmDialogBaseProps {
  title: string
  /** Omit (undefined) to render no description. */
  body: React.ReactNode
  confirmLabel: string
  tone?: "default" | "danger"
  /** When set, the confirm button stays disabled until this exact text (case-sensitive, trimmed) is typed. */
  requireText?: string
  action: (fd: FormData) => void | Promise<void>
  /** Extra values submitted as hidden inputs. */
  fields?: Record<string, string>
  /** Visible inputs, rendered inside the form (their values are posted with the action). */
  children?: React.ReactNode
  /**
   * Shown in a region above the footer. A string renders in a `role="alert"` block; any other node is rendered as given
   * (the caller supplies its own alert semantics).
   */
  error?: React.ReactNode
  /** Extra block on the confirm button and on submit (e.g. a form that is not valid yet). */
  disabled?: boolean
  /** Hide the confirm button; Cancel then reads "Close" unless `cancelLabel` says otherwise. */
  confirmHidden?: boolean
  cancelLabel?: string
  /** Where focus goes on open. Default `cancel`; `first` leaves it to the browser (first field). */
  initialFocus?: "cancel" | "first"
}

/**
 * Uncontrolled (`trigger`, opens itself, closes after the action resolves) or controlled (`open` + `onOpenChange`, no
 * trigger required; the caller closes — typically from the action — so a refusal can keep the dialog open).
 */
export type ConfirmDialogProps = ConfirmDialogBaseProps &
  (
    | { trigger: React.ReactNode; open?: undefined; onOpenChange?: undefined }
    | { open: boolean; onOpenChange: (open: boolean) => void; trigger?: React.ReactNode }
  )

function ConfirmButton({
  label,
  tone,
  blocked,
}: {
  label: string
  tone: "default" | "danger"
  blocked: boolean
}) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      disabled={pending || blocked}
      variant={tone === "danger" ? "destructive" : "default"}
    >
      {label}
    </Button>
  )
}

/** Cancel is disabled while the confirm action is pending, like the confirm button. */
function CancelButton({ ref, label }: { ref: React.Ref<HTMLButtonElement>; label: string }) {
  const { pending } = useFormStatus()
  return (
    <DialogClose asChild>
      <Button ref={ref} type="button" variant="outline" disabled={pending}>
        {label}
      </Button>
    </DialogClose>
  )
}

/** Confirmation modal around a server/client action. Cancel is focused first; closes after the action resolves. */
function ConfirmDialog({
  trigger,
  open: openProp,
  onOpenChange,
  title,
  body,
  confirmLabel,
  tone = "default",
  requireText,
  action,
  fields,
  children,
  error,
  disabled = false,
  confirmHidden = false,
  cancelLabel,
  initialFocus = "cancel",
}: ConfirmDialogProps) {
  const [openState, setOpenState] = React.useState(false)
  const controlled = openProp !== undefined
  const open = controlled ? openProp : openState
  const setOpen = (next: boolean) => {
    if (controlled) onOpenChange?.(next)
    else setOpenState(next)
  }
  const [typed, setTyped] = React.useState("")
  const cancelRef = React.useRef<HTMLButtonElement>(null)
  // A ref, not state: Esc/overlay must be refused in the same tick the action starts.
  const pendingRef = React.useRef(false)
  const blocked = disabled || (requireText !== undefined && typed.trim() !== requireText)
  // Controlled callers close the dialog themselves, so reset the typed text whenever it is closed.
  React.useEffect(() => {
    if (!open) setTyped("")
  }, [open])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && pendingRef.current) return
        setOpen(next)
        if (!next) setTyped("")
      }}
    >
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={(e) => {
          if (initialFocus === "first") return
          e.preventDefault()
          cancelRef.current?.focus()
        }}
      >
        <form
          className="grid gap-4"
          action={async (fd) => {
            if (blocked) return
            pendingRef.current = true
            try {
              await action(fd)
            } finally {
              pendingRef.current = false
            }
            if (!controlled) setOpen(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {body !== undefined ? (
              <DialogDescription asChild>
                <div>{body}</div>
              </DialogDescription>
            ) : null}
          </DialogHeader>
          {fields
            ? Object.entries(fields).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))
            : null}
          {children ? <div className="grid gap-4 px-6">{children}</div> : null}
          {requireText !== undefined ? (
            <div className="grid gap-1.5 px-6">
              <Label htmlFor="confirm-dialog-text">{`Type ${requireText} to confirm`}</Label>
              <Input
                id="confirm-dialog-text"
                autoComplete="off"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && blocked) e.preventDefault()
                }}
              />
            </div>
          ) : null}
          {error ? (
            typeof error === "string" ? (
              <div role="alert" className="mx-6 rounded-md border border-danger/30 bg-danger/[0.06] p-3 text-sm text-ink">
                {error}
              </div>
            ) : (
              <div className="px-6">{error}</div>
            )
          ) : null}
          <DialogFooter>
            <CancelButton ref={cancelRef} label={cancelLabel ?? (confirmHidden ? "Close" : "Cancel")} />
            {confirmHidden ? null : <ConfirmButton label={confirmLabel} tone={tone} blocked={blocked} />}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export { ConfirmDialog }
