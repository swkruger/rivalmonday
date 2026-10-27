'use client';
import { useEffect, useState } from 'react';
import type { FormResult } from '@/server/forms';
import { ErrorNote } from '@/components/form-error';

export const selectClass = 'h-9 w-full rounded-sm border border-input bg-surface px-3 text-sm text-ink placeholder:text-muted-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-danger aria-invalid:ring-1 aria-invalid:ring-inset aria-invalid:ring-danger disabled:border-line-control disabled:bg-canvas disabled:text-muted-ink';

export function FormMessage({ state }: { state: FormResult }) {
  if (!state.ok) return <ErrorNote focusKey={state}>{state.error}</ErrorNote>;
  return state.message ? <p role="status" className="rounded-md bg-muted-surface p-3 text-ink">{state.message}</p> : null;
}

/**
 * Controlled dialog open state for a form action: a successful save (`ok` with a message) closes the dialog and bumps
 * `formKey` (put it on the form) so the fields reset, so a second click cannot save a duplicate. `shown` is the state to
 * render in `FormMessage`: the handled success message is not shown again when the dialog is reopened.
 */
export function useCloseOnSave(state: FormResult, onReset?: () => void) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [handled, setHandled] = useState<FormResult | null>(null);
  useEffect(() => {
    if (state.ok && state.message && state !== handled) {
      setHandled(state);
      setOpen(false);
      setFormKey((k) => k + 1);
      onReset?.();
    }
  }, [state, handled, onReset]);
  const shown: FormResult = state === handled ? { ok: true } : state;
  return { open, setOpen, formKey, shown };
}
