'use client';
import { Button, Input, Label, Switch } from '@cs/ui';
import { useActionState, useOptimistic, useTransition } from 'react';
import type { FormResult } from '@/server/forms';
import { addWebhookAction, toggleWebhookAction } from './actions';

const selectClass = 'h-9 w-full max-w-[160px] rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** Mirrors `AGENCY_KINDS` (`@cs/db`) — kept local so this client bundle never imports the db package (it pulls in a Postgres driver). */
const AGENCY_KIND_OPTIONS: { value: string; label: string }[] = [
  { value: 'am_alert', label: 'Client alerts (agency)' },
  { value: 'brief_ready', label: 'Brief ready for review' },
  { value: 'brief_failed', label: 'Brief failed' },
  { value: 'brief_overdue', label: 'Brief overdue' },
  { value: 'trend_report', label: 'Quarterly report' },
];

export function AddWebhookForm() {
  const [state, formAction, pending] = useActionState(addWebhookAction, { ok: true } as FormResult);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {!state.ok && state.error && (
        <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">
          {state.error}
        </p>
      )}
      {state.ok && state.message && <p className="rounded-lg bg-muted-surface p-3 text-ink">{state.message}</p>}
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
  const [checked, setChecked] = useOptimistic(active);
  const [, startTransition] = useTransition();
  return (
    <Switch
      checked={checked}
      aria-label={label}
      onCheckedChange={(next: boolean) => {
        startTransition(async () => {
          setChecked(next);
          await toggleWebhookAction({ id, active: next });
        });
      }}
    />
  );
}
