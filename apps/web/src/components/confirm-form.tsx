'use client';
import { Button, ConfirmDialog } from '@cs/ui';
import { type ReactNode, useRef, useState } from 'react';
import { ErrorNote } from '@/components/form-error';
import { WriteGuard } from '@/components/read-only';
import type { FormResult } from '@/server/forms';

type Action = (prev: FormResult, fd: FormData) => Promise<FormResult>;

/**
 * A MiniForm whose submit asks first: the visible fields live in the form, the trigger opens a `ConfirmDialog`, and the confirm
 * posts the form's values (plus `fields`) to the server action. The result line stays mounted here, so it survives the dialog
 * closing and a `revalidatePath`. Hidden in a read-only support session.
 */
export function ConfirmForm({ action, submit, variant = 'default', title, body, confirmLabel, tone = 'default', fields, className, children }: {
  action: Action;
  submit: string;
  variant?: 'default' | 'outline';
  title: string;
  body: ReactNode;
  confirmLabel: string;
  tone?: 'default' | 'danger';
  fields?: Record<string, string>;
  className?: string;
  children?: ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<FormResult>({ ok: true });
  return (
    <WriteGuard>
      <form ref={formRef} onSubmit={(e) => {
          // Enter in a field must not post unconfirmed; the dialog's own submit bubbles here through the portal and must not be stopped.
          if (e.target === e.currentTarget) e.preventDefault();
        }} className={className ?? 'flex flex-wrap items-end gap-2'}>
        {children}
        <ConfirmDialog
          // An invalid form (a required field left empty) shows the browser's message and never opens the dialog: preventing the
          // click's default stops the dialog trigger from toggling.
          trigger={<Button type="button" variant={variant} onClick={(e) => { if (formRef.current && !formRef.current.reportValidity()) e.preventDefault(); }}>{submit}</Button>}
          title={title}
          body={body}
          confirmLabel={confirmLabel}
          tone={tone}
          {...(fields ? { fields } : {})}
          action={async (confirmed) => {
            const merged = formRef.current ? new FormData(formRef.current) : new FormData();
            confirmed.forEach((v, k) => merged.set(k, v));
            setState(await action(state, merged));
          }}
        />
        {!state.ok && <ErrorNote compact focusKey={state} className="basis-full">{state.error}</ErrorNote>}
        {state.ok && state.message && <p role="status" className="basis-full text-sm text-ink">{state.message}</p>}
      </form>
    </WriteGuard>
  );
}
