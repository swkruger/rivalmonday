'use client';
import { Button, ConfirmDialog, Input, Label, StatusChip, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import { type ReactNode, useActionState, useOptimistic, useState, useTransition } from 'react';
import { ErrorNote } from '@/components/form-error';
import { useReadOnly } from '@/components/read-only';
import { AGENCY_NOTICE_KIND, labelFor, WEBHOOK_KIND } from '@/lib/labels';
import type { FormResult } from '@/server/forms';
import { addWebhookAction, deleteWebhookAction, testWebhookAction, toggleWebhookAction, type WebhookTestOutcome } from './actions';

const selectClass = 'h-9 w-full max-w-40 rounded-sm border border-input bg-surface px-3 text-sm text-ink placeholder:text-muted-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-danger aria-invalid:ring-1 aria-invalid:ring-inset aria-invalid:ring-danger disabled:border-line-control disabled:bg-canvas disabled:text-muted-ink';

/** The agency notices a webhook can carry, in `AGENCY_KINDS` order, worded by the label map (no raw slugs). */
const AGENCY_KIND_OPTIONS = Object.entries(AGENCY_NOTICE_KIND).map(([value, { label }]) => ({ value, label }));

type Kind = 'slack' | 'teams';
/** Short product names for the result and confirm copy (the chip uses `WEBHOOK_KIND`). */
const KIND_NAME: Record<Kind, string> = { slack: 'Slack', teams: 'Teams' };

export interface WebhookRow { id: string; kind: Kind; host: string; kinds: string[] | null; active: boolean }

/** The inline line under a webhook after "Send test" (copy for the owner's sign-off). */
export function testResultLine(kind: Kind, r: WebhookTestOutcome): { ok: boolean; text: string } {
  const name = KIND_NAME[kind];
  if (r.ok) return { ok: true, text: `Test sent — ${name} answered ${r.status}.` };
  switch (r.error) {
    case 'timeout': return { ok: false, text: `Test failed — ${name} didn't answer within 5 seconds.` };
    case 'blocked': return { ok: false, text: "Test failed — this address isn't a Slack or Teams webhook." };
    case 'http': return { ok: false, text: `Test failed — ${name} answered ${r.status}.` };
    default: return { ok: false, text: `Test failed — couldn't reach ${name}.` };
  }
}

const noticesLabel = (kinds: string[] | null) => (kinds && kinds.length ? kinds.map((k) => labelFor(AGENCY_NOTICE_KIND, k).label).join(', ') : 'All agency notices');

export function AddWebhookForm() {
  const [state, formAction, pending] = useActionState(addWebhookAction, { ok: true } as FormResult);
  if (useReadOnly()) return null;
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {!state.ok && state.error && (
        <ErrorNote focusKey={state}>
          {state.error}
        </ErrorNote>
      )}
      {state.ok && state.message && <p role="status" className="rounded-md bg-muted-surface p-3 text-ink">{state.message}</p>}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="webhook-kind">Kind</Label>
          <select id="webhook-kind" name="kind" className={selectClass} defaultValue="slack">
            <option value="slack">Slack</option>
            <option value="teams">Teams</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="webhook-url">Webhook URL</Label>
          <Input id="webhook-url" name="url" type="password" autoComplete="off" required className="w-80" placeholder="https://hooks.slack.com/services/…" />
        </div>
        <Button type="submit" disabled={pending}>
          Add webhook
        </Button>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Notify for (none ticked = all agency notices)</legend>
        <div className="flex flex-wrap gap-4">
          {AGENCY_KIND_OPTIONS.map((k) => (
            <label key={k.value} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="kinds" value={k.value} className="h-4 w-4 rounded border-input" />
              {k.label}
            </label>
          ))}
        </div>
      </fieldset>
    </form>
  );
}

export function WebhookToggle({ id, active, label }: { id: string; active: boolean; label: string }) {
  const readOnly = useReadOnly();
  const [checked, setChecked] = useOptimistic(active);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const chip = <StatusChip tone={checked ? 'success' : 'neutral'}>{checked ? 'On' : 'Off'}</StatusChip>;
  // The switch is a write control: in a support session only the On/Off chip shows (the action would refuse).
  if (readOnly) return chip;
  return (
    <span className="inline-flex items-center gap-2">
      {chip}
      <Switch
        checked={checked}
        aria-label={label}
        onCheckedChange={(next: boolean) => {
          startTransition(async () => {
            setChecked(next);
            const r = await toggleWebhookAction({ id, active: next });
            setError(r.ok ? null : r.error);
          });
        }}
      />
      {error && (
        <ErrorNote compact>
          {error}
        </ErrorNote>
      )}
    </span>
  );
}

type RowResult = { ok: boolean; text: string };

function ResultLine({ result }: { result: RowResult | undefined }) {
  if (!result) return null;
  if (!result.ok) return <ErrorNote compact focusKey={result} className="mt-1">{result.text}</ErrorNote>;
  return <p role="status" className="mt-1 text-sm text-ink">{result.text}</p>;
}

function RowActions({ row, onResult }: { row: WebhookRow; onResult: (id: string, r: RowResult | undefined) => void }) {
  const [pending, startTransition] = useTransition();
  const sendTest = () =>
    startTransition(async () => {
      onResult(row.id, undefined);
      const r = await testWebhookAction({ id: row.id });
      onResult(row.id, r.ok ? testResultLine(row.kind, r.result) : { ok: false, text: r.error });
    });
  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={sendTest}>Send test</Button>
      <ConfirmDialog
        trigger={<Button type="button" variant="outline" size="sm">Delete</Button>}
        title="Delete this webhook?"
        body={`Briefs and alerts stop going to this ${KIND_NAME[row.kind]} channel. You can add it again later.`}
        confirmLabel="Delete"
        tone="danger"
        fields={{ webhookId: row.id }}
        action={async (fd) => {
          const r = await deleteWebhookAction({ ok: true }, fd);
          onResult(row.id, r.ok ? undefined : { ok: false, text: r.error });
        }}
      />
    </span>
  );
}

/**
 * The webhook list. Result lines (test outcome, a refused delete) live here, keyed by webhook, because this component stays
 * mounted across `revalidatePath` (apps/web/CLAUDE.md, UI patterns); each row shows its own line under the host.
 */
export function WebhookTable({ webhooks, activeHeader }: { webhooks: WebhookRow[]; activeHeader?: ReactNode }) {
  const readOnly = useReadOnly();
  const [results, setResults] = useState<Record<string, RowResult | undefined>>({});
  const onResult = (id: string, r: RowResult | undefined) => setResults((prev) => ({ ...prev, [id]: r }));
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Kind</TableHead>
          <TableHead>Host</TableHead>
          <TableHead>Notices</TableHead>
          <TableHead>{activeHeader ?? 'Active'}</TableHead>
          {!readOnly && <TableHead><span className="sr-only">Actions</span></TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {webhooks.map((w) => {
          const kind = labelFor(WEBHOOK_KIND, w.kind);
          return (
            <TableRow key={w.id}>
              <TableCell><StatusChip tone={kind.tone}>{kind.label}</StatusChip></TableCell>
              <TableCell>
                {w.host}
                <ResultLine result={results[w.id]} />
              </TableCell>
              <TableCell className="whitespace-normal">{noticesLabel(w.kinds)}</TableCell>
              <TableCell>
                <WebhookToggle id={w.id} active={w.active} label={`${kind.label} webhook active`} />
              </TableCell>
              {!readOnly && (
                <TableCell className="text-right">
                  <RowActions row={w} onResult={onResult} />
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
