'use client';
import { Button, Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label } from '@cs/ui';
import { type ReactNode, useEffect, useRef, useState, useTransition } from 'react';
import { ErrorNote } from '@/components/form-error';
import type { FormResult } from '@/server/forms';

export type ManageAction = (prev: FormResult, fd: FormData) => Promise<FormResult>;

/**
 * The agency page's confirm dialog. Like `ConfirmDialog` (Cancel first, closing blocked while pending, `requireText`), but
 * controlled — it opens from a menu item, which unmounts with its menu — and a refusal stays inline (spec §4.5, mockup
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
  const [typed, setTyped] = useState('');
  const [pending, startTransition] = useTransition();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) {
      setError(null);
      setTyped('');
    }
  }, [open]);
  const hasInputs = Boolean(children) || requireText !== undefined;
  const blocked = !canSubmit || (requireText !== undefined && typed.trim() !== requireText);
  const closeOnly = refusal !== undefined || (error !== null && !hasInputs);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={(e) => {
          if (hasInputs && !refusal) return;
          e.preventDefault();
          cancelRef.current?.focus();
        }}
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (blocked || closeOnly || pending) return;
            const fd = new FormData(e.currentTarget);
            fd.delete('confirm-text');
            startTransition(async () => {
              const r = await action({ ok: true }, fd);
              if (r.ok) {
                onDone?.(r.message);
                onOpenChange(false);
              } else setError(r.error);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {body !== undefined && !refusal && (
              <DialogDescription asChild>
                <div>{body}</div>
              </DialogDescription>
            )}
          </DialogHeader>
          {refusal ? (
            <div role="alert" className="rounded-md border border-danger/30 bg-danger/[0.06] p-3 text-sm text-ink">{refusal}</div>
          ) : (
            <>
              {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
              {children}
              {requireText !== undefined && (
                <div className="grid gap-1.5">
                  <Label htmlFor="action-dialog-text">{`Type ${requireText} to confirm`}</Label>
                  <Input id="action-dialog-text" name="confirm-text" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
                </div>
              )}
              {error !== null && <ErrorNote compact focusKey={error}>{error}</ErrorNote>}
            </>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button ref={cancelRef} type="button" variant="outline" disabled={pending}>{closeOnly ? 'Close' : 'Cancel'}</Button>
            </DialogClose>
            {!closeOnly && (
              <Button type="submit" disabled={pending || blocked} className={tone === 'danger' ? 'bg-danger text-white hover:bg-danger/90' : undefined}>
                {confirmLabel}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The always-mounted result line next to a set of dialogs (survives the dialog closing and `revalidatePath`). */
export function ResultLine({ message, className }: { message: string | null; className?: string }) {
  return message ? <p role="status" className={className ?? 'text-sm text-ink'}>{message}</p> : null;
}
