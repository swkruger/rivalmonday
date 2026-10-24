'use client';
import { Button, ConfirmDialog, Input, Label, SaveBar, Switch } from '@cs/ui';
import { useActionState, useState } from 'react';
import { HelpTip } from '@/components/help/help-tip';
import { labelFor, MEMBERSHIP_ROLE } from '@/lib/labels';
import { WriteGuard, useReadOnly } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { addRecipientAction, deactivateRecipientAction, saveDeliveryAction } from './actions';
import { ErrorNote } from '@/components/form-error';

const selectClass = 'h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

const MODES: { value: 'direct' | 'after_am_check' | 'digest_only'; label: string; help: string }[] = [
  { value: 'direct', label: 'Direct', help: 'Alerts go to the client at once.' },
  { value: 'after_am_check', label: 'I review alerts first (default)', help: 'You approve each alert first.' },
  { value: 'digest_only', label: 'Digest only', help: 'Alerts wait for the 17:00 digest (business time zone).' },
];

export function DeliveryForm({
  clientId,
  alertMode,
  briefAutoSend,
  timezone,
  timezoneOptions,
}: {
  clientId: string;
  alertMode: string;
  briefAutoSend: boolean;
  timezone: string;
  /** Built server-side (`timezoneOptions()` in `@/server/timezones`) and passed down so the server-rendered
   * and hydrated `<select>` list the exact same options — never built again here (Review Focus / fix round 1). */
  timezoneOptions: string[];
}) {
  const [dirty, setDirty] = useState(false);
  // React 19 resets a form after every action, errors included; every field is controlled (and onReset is blocked), so a refused save keeps what was chosen.
  const [mode, setMode] = useState(alertMode);
  const [autoSend, setAutoSend] = useState(briefAutoSend);
  const [zone, setZone] = useState(timezone);
  const [state, formAction, pending] = useActionState(async (prev: FormResult, fd: FormData) => {
    const r = await saveDeliveryAction(prev, fd);
    if (r.ok) setDirty(false);
    return r;
  }, { ok: true } as FormResult);
  const readOnly = useReadOnly();

  return (
    <form
      action={formAction}
      onReset={(e) => e.preventDefault()}
      onChange={() => setDirty(true)}
      className="flex flex-col gap-5 rounded-[14px] bg-surface p-6 shadow-card"
    >
      <input type="hidden" name="clientId" value={clientId} />
      {!state.ok && state.error && (
        <ErrorNote focusKey={state}>
          {state.error}
        </ErrorNote>
      )}
      {state.ok && !dirty && state.message && <p role="status" className="rounded-lg bg-muted-surface p-3 text-ink">{state.message}</p>}

      <fieldset disabled={readOnly} className="contents">
      <fieldset className="flex flex-col gap-3">
        <legend className="inline-flex items-center gap-1.5 font-semibold">
          Alert mode
          <HelpTip tip="client.settings.delivery.alertMode" />
        </legend>
        {MODES.map((m) => (
          <label key={m.value} className="flex items-start gap-3 rounded-lg border border-line p-3">
            <input
              type="radio" name="alertMode" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)}
              aria-describedby={`alert-mode-${m.value}-help`} className="mt-1 h-4 w-4"
            />
            <span>
              <span className="block font-medium">{m.label}</span>
              <span id={`alert-mode-${m.value}-help`} className="block text-sm text-muted-foreground">{m.help}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex items-center gap-3">
        <Switch
          id="brief-auto-send" checked={autoSend}
          onCheckedChange={(v) => { setAutoSend(v); setDirty(true); }}
        />
        <input type="hidden" name="briefAutoSend" value={autoSend ? 'on' : ''} />
        <Label htmlFor="brief-auto-send">Send untouched briefs automatically on Monday 07:00</Label>
        <HelpTip tip="client.settings.delivery.autoSend" />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="timezone">Business time zone</Label>
          <HelpTip tip="client.settings.delivery.timezone" />
        </div>
        <select id="timezone" name="timezone" value={zone} onChange={(e) => setZone(e.target.value)} className={selectClass}>
          {timezoneOptions.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>

      </fieldset>

      <WriteGuard>
        <SaveBar
          dirty={dirty}
          pending={pending}
          saveLabel="Save"
          onReset={() => {
            setMode(alertMode);
            setAutoSend(briefAutoSend);
            setZone(timezone);
            setDirty(false);
          }}
        />
      </WriteGuard>
    </form>
  );
}

export function AddRecipientForm({ clientId }: { clientId: string }) {
  const [state, formAction, pending] = useActionState(addRecipientAction, { ok: true } as FormResult);
  if (useReadOnly()) return null;
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="clientId" value={clientId} />
      {!state.ok && state.error && (
        <ErrorNote focusKey={state}>
          {state.error}
        </ErrorNote>
      )}
      {state.ok && state.message && <p className="rounded-lg bg-muted-surface p-3 text-ink">{state.message}</p>}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="recipient-email">Email</Label>
          <Input id="recipient-email" name="email" type="email" required className="w-64" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="recipient-name">Name</Label>
          <Input id="recipient-name" name="name" className="w-48" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="recipient-role">Role</Label>
          <select id="recipient-role" name="role" className={selectClass} defaultValue="client_viewer">
            <option value="client_owner">{labelFor(MEMBERSHIP_ROLE, 'client_owner').label}</option>
            <option value="client_viewer">{labelFor(MEMBERSHIP_ROLE, 'client_viewer').label}</option>
          </select>
        </div>
        <Button type="submit" disabled={pending}>
          Add recipient
        </Button>
      </div>
    </form>
  );
}

export function DeactivateRecipientButton({ clientId, contactId, email }: { clientId: string; contactId: string; email: string }) {
  const [result, setResult] = useState<FormResult>({ ok: true });
  const readOnly = useReadOnly();
  if (readOnly) return null;
  return (
    <div className="flex flex-col items-start gap-2">
      <ConfirmDialog
        trigger={<Button type="button" variant="outline" size="sm" onClick={() => setResult({ ok: true })}>Deactivate</Button>}
        title={`Deactivate ${email}?`}
        body="Links already sent to this person stop working."
        confirmLabel="Deactivate"
        tone="danger"
        fields={{ clientId, contactId }}
        action={async (fd) => { setResult(await deactivateRecipientAction(result, fd)); }}
      />
      {/* The refusal sits outside the dialog, under the row's button. */}
      {!result.ok && result.error && <ErrorNote focusKey={result} compact>{result.error}</ErrorNote>}
    </div>
  );
}
