'use client';
import type { AlertQueueClient, AlertQueueRow } from '@cs/tools';
import { Button, Card, CardContent, ConfirmDialog, Label, StatusChip } from '@cs/ui';
import { useState } from 'react';
import { HelpEmpty } from '@/components/help/empty-state';
import { ErrorNote } from '@/components/form-error';
import { WriteGuard } from '@/components/read-only';
import { formatRelative } from '@/lib/format';
import { ALERT_STATUS, labelFor } from '@/lib/labels';
import type { FormResult } from '@/server/forms';
import { approveAlertAction, dismissAlertAction } from './actions';

const textareaClass = 'min-h-20 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';
const selectClass = 'h-9 w-full max-w-xs rounded-sm border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** Unreviewed alerts expire after this many days (packages/engine/src/alerts/create.ts:ALERT_REVIEW_EXPIRY_DAYS). */
const EXPIRY_DAYS = 7;

/** The queue's client filter: a plain GET form, so it works without script and the chosen client stays in the URL. */
export function AlertFilter({ clients, selected }: { clients: AlertQueueClient[]; selected: string | null }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="alert-client">Client</Label>
        <select id="alert-client" name="client" defaultValue={selected ?? ''} className={selectClass}>
          <option value="">All clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.count})</option>)}
        </select>
      </div>
      <Button type="submit" variant="outline">Show</Button>
    </form>
  );
}

/** Shown only when the queue was cut at the cap. */
export function CapNotice({ capped }: { capped: boolean }) {
  if (!capped) return null;
  return <p role="status" className="text-sm text-ink">Showing the oldest 200 — filter by client to see more</p>;
}

function Message({ state }: { state: FormResult }) {
  if (!state.ok && state.error) return <ErrorNote focusKey={state}>{state.error}</ErrorNote>;
  if (state.ok && state.message) return <p role="status" className="rounded-md bg-muted-surface p-3 text-ink">{state.message}</p>;
  return null;
}

type RunAction = (fd: FormData) => Promise<void>;

function ApproveButton({ alertId, run, pending }: { alertId: string; run: RunAction; pending: boolean }) {
  return (
    <form action={run}>
      <input type="hidden" name="intent" value="approve" />
      <input type="hidden" name="alertId" value={alertId} />
      <Button type="submit" disabled={pending}>
        Approve &amp; send
      </Button>
    </form>
  );
}

function DismissDialog({ alertId, run, onOpen }: { alertId: string; run: RunAction; onOpen: () => void }) {
  return (
    <ConfirmDialog
      trigger={<Button type="button" variant="outline" onClick={onOpen}>Dismiss</Button>}
      title="Dismiss this alert?"
      tone="danger"
      confirmLabel="Dismiss"
      fields={{ intent: 'dismiss', alertId }}
      action={run}
      body={
        <div className="flex flex-col gap-2">
          <p>Nothing is sent to the client.</p>
          <Label htmlFor={`reason-${alertId}`}>Reason</Label>
          <textarea id={`reason-${alertId}`} name="reason" required minLength={1} maxLength={500} className={textareaClass} />
        </div>
      }
    />
  );
}

/** "Waiting 3 days": how long it has sat in the queue. */
function waiting(createdAt: string, now: Date, tz: string): string {
  return `Waiting ${formatRelative(createdAt, now, { tz }).replace(/ ago$/, '')}`;
}

/** One alert waiting for review, or held for the 17:00 digest (read-only aside from Dismiss, since it was already approved). */
function AlertCard({ alert, run, pending, assistantName, now, tz, onOpenDismiss }: { alert: AlertQueueRow; run: RunAction; pending: boolean; assistantName: string; now: Date; tz: string; onOpenDismiss: () => void }) {
  const pendingReview = alert.status === 'pending_review';
  const status = labelFor(ALERT_STATUS, alert.status);
  return (
    <Card>
      <CardContent>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold">{alert.clientName}</span>
          <span className="text-muted-foreground">·</span>
          <span>{alert.competitorName}</span>
          <span className="ml-auto rounded-sm bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-soft-text">Score {Math.round(alert.score)}</span>
          <StatusChip tone={status.tone}>{status.label}</StatusChip>
          {alert.heldForDigest && <StatusChip tone="info">Held for the 17:00 digest</StatusChip>}
        </div>
        <h3 className="mt-2 mb-1 text-[15px] font-semibold">{alert.headline}</h3>
        <p className="my-1">{alert.body}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="rounded-sm bg-muted-surface-2 px-2 py-0.5 text-xs">{alert.evidenceCount} evidence items</span>
          <span className="text-xs text-muted-foreground">{waiting(alert.createdAt, now, tz)}</span>
          {pendingReview && <span className="text-xs text-muted-foreground">Expires if not reviewed within {EXPIRY_DAYS} days</span>}
        </div>
        {alert.written === 'template' && <p className="mt-2 text-muted-foreground">{assistantName} couldn’t verify its own wording, so this uses the evidence summary.</p>}
        <WriteGuard>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {pendingReview && <ApproveButton alertId={alert.id} run={run} pending={pending} />}
            <DismissDialog alertId={alert.id} run={run} onOpen={onOpenDismiss} />
          </div>
        </WriteGuard>
      </CardContent>
    </Card>
  );
}

/**
 * The alert queue plus a result line above it with the last approve/dismiss outcome. The state lives here, which stays
 * mounted: both actions revalidate the queue on success and remove the card, so state held in the card would vanish before
 * the outcome could paint. A refusal clears when the next dismiss dialog opens.
 */
export function AlertList({ items, assistantName, tz = 'UTC', nowMs }: { items: AlertQueueRow[]; assistantName: string; tz?: string; nowMs?: number }) {
  const [result, setResult] = useState<FormResult>({ ok: true });
  const [pending, setPending] = useState(false);
  const now = new Date(nowMs ?? Date.now());
  const run: RunAction = async (fd) => {
    setPending(true);
    try {
      setResult(fd.get('intent') === 'dismiss' ? await dismissAlertAction(result, fd) : await approveAlertAction(result, fd));
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <Message state={result} />
      {items.length === 0 ? (
        <HelpEmpty id="agency.alerts.noAlerts" guideAnchor="what-this-page-tells-you" />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <AlertCard key={item.id} alert={item} run={run} pending={pending} assistantName={assistantName} now={now} tz={tz} onOpenDismiss={() => setResult({ ok: true })} />
          ))}
        </div>
      )}
    </>
  );
}
