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

export interface ConfirmDialogProps {
  trigger: React.ReactNode
  title: string
  body: React.ReactNode
  confirmLabel: string
  tone?: "default" | "danger"
  /** When set, the confirm button stays disabled until this exact text (case-sensitive, trimmed) is typed. */
  requireText?: string
  action: (fd: FormData) => void | Promise<void>
  /** Extra values submitted as hidden inputs. */
  fields?: Record<string, string>
}

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
      className={tone === "danger" ? "bg-danger text-white hover:bg-danger/90" : undefined}
    >
      {label}
    </Button>
  )
}

/** Confirmation modal around a server/client action. Cancel is focused first; closes after the action resolves. */
function ConfirmDialog({
  trigger,
  title,
  body,
  confirmLabel,
  tone = "default",
  requireText,
  action,
  fields,
}: ConfirmDialogProps) {
  const [open, setOpen] = React.useState(false)
  const [typed, setTyped] = React.useState("")
  const cancelRef = React.useRef<HTMLButtonElement>(null)
  const blocked = requireText !== undefined && typed.trim() !== requireText

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setTyped("")
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          cancelRef.current?.focus()
        }}
      >
        <form
          className="grid gap-4"
          action={async (fd) => {
            if (blocked) return
            await action(fd)
            setOpen(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription asChild>
              <div>{body}</div>
            </DialogDescription>
          </DialogHeader>
          {fields
            ? Object.entries(fields).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))
            : null}
          {requireText !== undefined ? (
            <div className="grid gap-1.5">
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
          <DialogFooter>
            <DialogClose asChild>
              <Button ref={cancelRef} type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <ConfirmButton label={confirmLabel} tone={tone} blocked={blocked} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export { ConfirmDialog }
