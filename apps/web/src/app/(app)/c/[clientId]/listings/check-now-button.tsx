'use client';
import { Button } from '@cs/ui';
import { useActionState, useId } from 'react';
import { ErrorNote } from '@/components/form-error';
import { WriteGuard } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { requestListingsCheck } from './actions';
import { CHECK_NOW, CHECK_RUNNING, type CheckInfo } from './check-copy';

const INITIAL: FormResult = { ok: true };

/**
 * 18c-2 "Check listings now" (agency roles only; the page renders it only when the audit carries `manual`). A weekly limit
 * puts its date on the disabled button; the daily-limit and spend-pause copy is long, so it sits beside a disabled button.
 * `not_ready` renders nothing. The result message lives in this always-mounted component, so it survives revalidation.
 */
export function CheckNowButton({ clientId, check }: { clientId: string; check: CheckInfo }) {
  const noteId = useId();
  const [state, action, pending] = useActionState(async (_p: FormResult) => requestListingsCheck(clientId), INITIAL);
  if (check.state === 'not_ready') return null;
  const queued = state.ok && Boolean(state.message);
  const running = queued || check.state === 'running';
  const label = running ? CHECK_RUNNING : check.state === 'weekly_limit' && check.label ? check.label : CHECK_NOW;
  const note = !running && (check.state === 'agency_daily_limit' || check.state === 'spend_paused') ? check.label : null;
  return (
    <WriteGuard>
      <div className="flex max-w-md flex-col items-end gap-1.5">
        <form action={action}>
          <Button type="submit" variant="outline" disabled={pending || running || check.state !== 'available'} aria-describedby={note ? noteId : undefined}>{label}</Button>
        </form>
        {note && <p id={noteId} className="text-right text-sm text-muted-ink">{note}</p>}
        {!state.ok && <ErrorNote compact focusKey={state} className="justify-end text-right">{state.error}</ErrorNote>}
        {state.ok && state.message && <p role="status" className="text-right text-sm text-ink">{state.message}</p>}
      </div>
    </WriteGuard>
  );
}
