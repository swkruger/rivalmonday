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

/** The last approve or dismiss result, tagged with what it was for so a dismiss refusal shows in its own dialog. */
type QueueResult = FormResult & { intent?: 'approve' | 'dismiss'; alertId?: string };
type QueueAction = (fd: FormData) => void;

/**
 * Final-review fix: one action state for every card's approve and dismiss, held by `AlertList`, which stays mounted.
 * Both actions revalidate the queue on success, which removes the card (or, for a digest-held approve, its button)
 * in the same update; state held in the card would vanish before the engine's outcome could paint (plan decision 13).
 */
async function queueAction(prev: QueueResult, fd: FormData): Promise<QueueResult> {
  const intent = fd.get('intent') === 'dismiss' ? 'dismiss' : 'approve';
  const alertId = String(fd.get('alertId') ?? '');
  const r = intent === 'dismiss' ? await dismissAlertAction(prev, fd) : await approveAlertAction(prev, fd);
  return { ...r, intent, alertId };
}

function ApproveButton({ alertId, action, pending }: { alertId: string; action: QueueAction; pending: boolean }) {
  return (
    <form action={action}>
      <input type="hidden" name="intent" value="approve" />
      <input type="hidden" name="alertId" value={alertId} />
      <Button type="submit" disabled={pending}>
        Approve &amp; send
      </Button>
    </form>
  );
}

function DismissDialog({ alertId, action, pending, result }: { alertId: string; action: QueueAction; pending: boolean; result: QueueResult }) {
  const ownError = !result.ok && result.intent === 'dismiss' && result.alertId === alertId;
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
        {ownError && <Message state={result} />}
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="intent" value="dismiss" />
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
function AlertCard({ alert, action, pending, result }: { alert: AlertQueueRow; action: QueueAction; pending: boolean; result: QueueResult }) {
  const pendingReview = alert.status === 'pending_review';
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
        {pendingReview && <ApproveButton alertId={alert.id} action={action} pending={pending} />}
        <DismissDialog alertId={alert.id} action={action} pending={pending} result={result} />
      </div>
    </article>
  );
}

/**
 * The alert queue plus a flash line above it with the last approve/dismiss outcome. A dismiss refusal is shown in
 * that alert's dialog instead (the dialog is still open, covering the page).
 */
export function AlertList({ items }: { items: AlertQueueRow[] }) {
  const [result, action, pending] = useActionState(queueAction, { ok: true } as QueueResult);
  const flash = result.ok || result.intent !== 'dismiss';
  return (
    <>
      {flash && <Message state={result} />}
      {items.length === 0 ? (
        <p className="text-muted-foreground">No alerts waiting — nice.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <AlertCard key={item.id} alert={item} action={action} pending={pending} result={result} />
          ))}
        </div>
      )}
    </>
  );
}
