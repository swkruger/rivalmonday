'use client';
import type { AlertQueueClient, AlertQueueRow } from '@cs/tools';
import { Band, Button, Card, CardContent, ConfirmDialog, Label, StatusChip, nativeSelectClass, textareaClass } from '@cs/ui';
import { useState } from 'react';
import { HelpEmpty } from '@/components/help/empty-state';
import { ErrorNote } from '@/components/form-error';
import { WriteGuard } from '@/components/read-only';
import { ALERT_STATUS, labelFor } from '@/lib/labels';
import type { FormResult } from '@/server/forms';
import { approveAlertAction, dismissAlertAction } from './actions';

/** Unreviewed alerts expire after this many days (packages/engine/src/alerts/create.ts:ALERT_REVIEW_EXPIRY_DAYS). */
const EXPIRY_DAYS = 7;

/**
 * The queue's client filter: a plain GET form, so it works without script and the chosen client stays in the URL. A chosen
 * client with nothing in the queue is not in `clients`; it still shows as the selected option (named when the page knows the
 * name, else "This client") so the select never claims "All clients" while the list is filtered.
 */
export function AlertFilter({ clients, selected, selectedName }: { clients: AlertQueueClient[]; selected: string | null; selectedName?: string | null }) {
  const missing = selected !== null && !clients.some((c) => c.id === selected);
  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="alert-client">Client</Label>
        <select id="alert-client" name="client" defaultValue={selected ?? ''} className={`${nativeSelectClass} w-full max-w-xs`}>
          <option value="">All clients</option>
          {missing && <option value={selected}>{selectedName || 'This client'}</option>}
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.count})</option>)}
        </select>
      </div>
      <Button type="submit" variant="outline">Show</Button>
    </form>
  );
}

/** Shown only when the queue was cut at the cap; with a client filter on, filtering further is not an option. */
export function CapNotice({ capped, filtered = false }: { capped: boolean; filtered?: boolean }) {
  if (!capped) return null;
  return <p role="status" className="text-sm text-ink">{filtered ? 'Showing the oldest 200 for this client.' : 'Showing the oldest 200 — filter by client to see more'}</p>;
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

const HOUR_MS = 3_600_000;
/** "Waiting 3 hours" / "Waiting 2 days": how long it has sat in the queue, from elapsed hours (not a calendar date). */
export function waiting(createdAt: string, now: Date): string {
  const hours = Math.floor((now.getTime() - Date.parse(createdAt)) / HOUR_MS);
  if (hours < 1) return 'Waiting under an hour';
  if (hours < 24) return `Waiting ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.floor(hours / 24);
  return `Waiting ${days} ${days === 1 ? 'day' : 'days'}`;
}

/** One alert waiting for review, or held for the 17:00 digest (read-only aside from Dismiss, since it was already approved). */
function AlertCard({ alert, run, pending, assistantName, now, onOpenDismiss }: { alert: AlertQueueRow; run: RunAction; pending: boolean; assistantName: string; now: Date; onOpenDismiss: () => void }) {
  const pendingReview = alert.status === 'pending_review';
  const status = labelFor(ALERT_STATUS, alert.status);
  return (
    <Card>
      <CardContent>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold">{alert.clientName}</span>
          <span className="text-muted-ink">·</span>
          <span>{alert.competitorName}</span>
          <span className="ml-auto rounded-sm bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-soft-text">Score {Math.round(alert.score)}</span>
          <StatusChip tone={status.tone}>{status.label}</StatusChip>
          {alert.heldForDigest && <StatusChip tone="info">Held for the 17:00 digest</StatusChip>}
        </div>
        <Band className="mt-3 flex flex-col gap-1.5">
          <h3 className="text-base font-semibold text-ink">{alert.headline}</h3>
          <p>{alert.body}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-sm bg-muted-surface-2 px-2 py-0.5 text-xs">{alert.evidenceCount} evidence items</span>
            {pendingReview && <span className="text-xs text-muted-ink">{waiting(alert.createdAt, now)}</span>}
            {pendingReview && <span className="text-xs text-muted-ink">Expires if not reviewed within {EXPIRY_DAYS} days</span>}
          </div>
          {alert.written === 'template' && <p className="mt-1 text-muted-ink">{assistantName} couldn’t verify its own wording, so this uses the evidence summary.</p>}
        </Band>
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
export function AlertList({ items, assistantName, nowMs }: { items: AlertQueueRow[]; assistantName: string; nowMs?: number }) {
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
            <AlertCard key={item.id} alert={item} run={run} pending={pending} assistantName={assistantName} now={now} onOpenDismiss={() => setResult({ ok: true })} />
          ))}
        </div>
      )}
    </>
  );
}
