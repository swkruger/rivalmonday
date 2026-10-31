'use client';
import { Button, nativeInputClass } from '@cs/ui';
import { type ReactNode, useActionState } from 'react';
import type { FormResult } from '@/server/forms';
import { ErrorNote } from '@/components/form-error';

type Action = (prev: FormResult, fd: FormData) => Promise<FormResult>;

/** A small server-action form: children are the fields; the result shows inline (alert for refusals, status for success). */
export function MiniForm({ action, submit, variant = 'default', className, children }: {
  action: Action; submit: string; variant?: 'default' | 'outline'; className?: string; children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: true } as FormResult);
  return (
    <form action={formAction} className={className ?? 'flex flex-wrap items-end gap-2'}>
      {children}
      <Button type="submit" variant={variant} disabled={pending}>{submit}</Button>
      {!state.ok && <ErrorNote compact focusKey={state} className="basis-full">{state.error}</ErrorNote>}
      {state.ok && state.message && <p role="status" className="basis-full text-sm text-ink">{state.message}</p>}
    </form>
  );
}

/** Native input/select in a MiniForm: the shared 36 px control recipe. */
export const fieldCls = nativeInputClass;

/** Label + native control stacked; `children` is the control and must carry the matching `id`. */
export function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={htmlFor} className="font-medium">{label}</label>
      {children}
    </div>
  );
}
