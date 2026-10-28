"use client"

import * as React from "react"
import { CircleAlert } from "lucide-react"
import { cn } from "../lib/cn"
import { Label } from "./label"

type ControlProps = { id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean | "true" | "false" }

/** label -> control -> help | error. Wires the control's id, aria-describedby and aria-invalid (design system 4.4). */
function Field({
  label,
  required,
  optional,
  help,
  error,
  htmlFor,
  children,
  className,
}: {
  label: React.ReactNode
  required?: boolean
  optional?: boolean
  help?: React.ReactNode
  error?: React.ReactNode
  /** The control's id when `children` is a wrapper (input group, prefix, chips) rather than the control itself: the label points there and nothing is injected into the wrapper. The caller then wires `aria-describedby={`${htmlFor}-help`}` (and `-error`) on the control itself. */
  htmlFor?: string
  children: React.ReactElement<ControlProps>
  className?: string
}) {
  const autoId = React.useId()
  const id = htmlFor ?? children.props.id ?? autoId
  const helpId = `${id}-help`
  const errorId = `${id}-error`
  const noteId = error ? errorId : help ? helpId : undefined
  const describedBy = Array.from(
    new Set([...(children.props["aria-describedby"]?.split(/\s+/) ?? []), noteId].filter(Boolean)),
  ).join(" ")

  return (
    <div data-slot="field" className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="gap-1">
        {label}
        {required && (
          <>
            <span aria-hidden className="text-danger-text">*</span>
            <span className="sr-only">(required)</span>
          </>
        )}
        {optional && <span className="font-normal text-muted-ink">(optional)</span>}
      </Label>
      {htmlFor
        ? children
        : React.cloneElement(children, {
            id,
            "aria-describedby": describedBy || undefined,
            ...(error ? { "aria-invalid": true } : {}),
          })}
      {error ? (
        <p id={errorId} className="flex items-start gap-1 text-xs text-danger-text">
          <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : help ? (
        <p id={helpId} className="text-xs text-muted-ink">{help}</p>
      ) : null}
    </div>
  )
}

export { Field }
