'use client';
import { ConfirmDialog } from '@cs/ui';
import { type ReactNode, useEffect, useState } from 'react';
import { ErrorNote } from '@/components/form-error';
import type { FormResult } from '@/server/forms';

export type ManageAction = (prev: FormResult, fd: FormData) => Promise<FormResult>;

/**
 * The agency page's confirm dialog: a thin wrapper over a controlled `ConfirmDialog` (chrome, Cancel first, closing
 * blocked while pending, `requireText`). It opens from a menu item, which unmounts with its menu, and a refusal stays inline (spec §4.5, mockup
 * page 4): a confirm-only dialog then offers just Close; one with fields keeps its buttons so the value can be fixed.
 * `refusal` replaces the form with a danger banner and Close (archive while billing is live). Success closes the dialog
 * and hands the message to `onDone`, which the caller keeps in an always-mounted result line.
 */
export function ActionDialog({ open, onOpenChange, title, body, confirmLabel, tone = 'default', requireText, fields, children, canSubmit = true, refusal, action, onDone }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  tone?: 'default' | 'danger';
  requireText?: string;
  fields: Record<string, string>;
  /** Visible inputs; their values are posted with `fields`. */
  children?: ReactNode;
  canSubmit?: boolean;
  refusal?: ReactNode;
  action: ManageAction;
  onDone?: (message: string | undefined) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) setError(null);
  }, [open]);
  const hasInputs = Boolean(children) || requireText !== undefined;
  const closeOnly = refusal !== undefined || (error !== null && !hasInputs);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      body={refusal ? undefined : body}
      confirmLabel={confirmLabel}
      tone={tone}
      requireText={refusal ? undefined : requireText}
      fields={refusal ? undefined : fields}
      disabled={!canSubmit}
      confirmHidden={closeOnly}
      initialFocus={hasInputs && !refusal ? 'first' : 'cancel'}
      error={refusal ? <div role="alert" className="rounded-md border border-danger/30 bg-danger/[0.06] p-3 text-sm text-ink">{refusal}</div> : error !== null ? <ErrorNote compact focusKey={error}>{error}</ErrorNote> : undefined}
      action={async (fd) => {
        if (closeOnly) return;
        fd.delete('confirm-text');
        const r = await action({ ok: true }, fd);
        if (r.ok) {
          onDone?.(r.message);
          onOpenChange(false);
        } else setError(r.error);
      }}
    >
      {refusal ? undefined : children}
    </ConfirmDialog>
  );
}

/** The always-mounted result line next to a set of dialogs (survives the dialog closing and `revalidatePath`). */
export function ResultLine({ message, className }: { message: string | null; className?: string }) {
  return message ? <p role="status" className={className ?? 'text-sm text-ink'}>{message}</p> : null;
}
