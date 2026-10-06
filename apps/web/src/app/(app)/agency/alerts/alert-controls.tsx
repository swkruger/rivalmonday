'use client';
import type { AlertQueueRow } from '@cs/tools';
import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Label } from '@cs/ui';
import { useActionState } from 'react';
import type { FormResult } from '@/server/forms';
import { approveAlertAction, dismissAlertAction } from './actions';

const textareaClass = 'min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

function Message({ state }: { state: FormResult }) {
  if (!state.ok && state.error) {
    return (
      <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">
        {state.error}
      </p>
    );
  }
  if (state.ok && state.message) {
    return <p className="rounded-lg bg-muted-surface p-3 text-ink">{state.message}</p>;
  }
  return null;
}

function ApproveButton({ alertId }: { alertId: string }) {
  const [state, formAction, pending] = useActionState(approveAlertAction, { ok: true } as FormResult);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="alertId" value={alertId} />
      <Button type="submit" disabled={pending}>
        Approve &amp; send
      </Button>
      <Message state={state} />
    </form>
  );
}

function DismissDialog({ alertId }: { alertId: string }) {
  const [state, formAction, pending] = useActionState(dismissAlertAction, { ok: true } as FormResult);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Dismiss</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dismiss this alert?</DialogTitle>
          <DialogDescription>Nothing is sent to the client. A reason is required.</DialogDescription>
        </DialogHeader>
        <Message state={state} />
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="alertId" value={alertId} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`reason-${alertId}`}>Reason</Label>
            <textarea id={`reason-${alertId}`} name="reason" required minLength={1} maxLength={500} className={textareaClass} />
          </div>
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={pending}>
              Dismiss
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One alert waiting for review, or held for the 17:00 digest (read-only aside from Dismiss, since it was already approved). */
export function AlertCard({ alert }: { alert: AlertQueueRow }) {
  const pending = alert.status === 'pending_review';
  return (
    <article className="rounded-[14px] bg-surface p-6 shadow-card">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-semibold">{alert.clientName}</span>
        <span className="text-muted-foreground">·</span>
        <span>{alert.competitorName}</span>
        <span className="ml-auto rounded-md bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-soft-text">Score {Math.round(alert.score)}</span>
        {alert.heldForDigest && <Badge variant="outline">Held for the 17:00 digest</Badge>}
      </div>
      <h3 className="mt-2 mb-1 text-[15px] font-bold">{alert.headline}</h3>
      <p className="my-1">{alert.body}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-muted-surface-2 px-2 py-0.5 text-xs">{alert.evidenceCount} evidence items</span>
      </div>
      {alert.written === 'template' && <p className="mt-2 text-muted-foreground">Friday couldn’t verify its own wording, so this uses the evidence summary.</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {pending && <ApproveButton alertId={alert.id} />}
        <DismissDialog alertId={alert.id} />
      </div>
    </article>
  );
}
