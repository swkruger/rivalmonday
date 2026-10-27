'use client';
import { Button, Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Label } from '@cs/ui';
import { useActionState, useState } from 'react';
import type { FormResult } from '@/server/forms';
import { startSupportSessionAction } from './actions';
import { ErrorNote } from '@/components/form-error';

/** Matches the tool's lower bound (code points, after trimming); the server re-checks 5..300. */
export const REASON_MIN = 5;
const REASON_MAX = 300;
const reasonLength = (s: string) => [...s.trim()].length;

/** Phase 8b spec § UI: "View as agency" → reason → a 60-minute read-only session (owner/staff only; the page hides it otherwise). */
export function SupportDialog({ agencyId }: { agencyId: string }) {
  const [state, formAction, pending] = useActionState(startSupportSessionAction, { ok: true } as FormResult);
  const [reason, setReason] = useState('');
  const tooShort = reasonLength(reason) < REASON_MIN;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>View as agency</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>View as agency</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="agencyId" value={agencyId} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="support-reason">Why are you opening this agency? (shown to the agency)</Label>
            <textarea
              id="support-reason"
              name="reason"
              required
              minLength={REASON_MIN}
              maxLength={REASON_MAX}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-sm border border-input bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-danger aria-invalid:ring-1 aria-invalid:ring-inset aria-invalid:ring-danger disabled:border-line-control disabled:bg-canvas disabled:text-muted-ink"
            />
          </div>
          {!state.ok && state.error && (
            <ErrorNote focusKey={state}>
              {state.error}
            </ErrorNote>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || tooShort}>
              Start read-only session
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
