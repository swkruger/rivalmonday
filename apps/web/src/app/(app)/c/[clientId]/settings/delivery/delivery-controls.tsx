'use client';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Input, Label, Switch } from '@cs/ui';
import { useActionState, useState } from 'react';
import type { FormResult } from '@/server/forms';
import { addRecipientAction, deactivateRecipientAction, saveDeliveryAction } from './actions';

const selectClass = 'h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

const MODES: { value: 'direct' | 'after_am_check' | 'digest_only'; label: string; help: string }[] = [
  { value: 'direct', label: 'Direct', help: 'Alerts go to the client at once.' },
  { value: 'after_am_check', label: 'After AM check (default)', help: 'You approve each alert first.' },
  { value: 'digest_only', label: 'Digest only', help: 'Alerts wait for the 17:00 digest.' },
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
  const [state, formAction, pending] = useActionState(saveDeliveryAction, { ok: true } as FormResult);
  const [autoSend, setAutoSend] = useState(briefAutoSend);

  return (
    <form action={formAction} className="flex flex-col gap-5 rounded-[14px] bg-surface p-6 shadow-card">
      <input type="hidden" name="clientId" value={clientId} />
      {!state.ok && state.error && (
        <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">
          {state.error}
        </p>
      )}
      {state.ok && state.message && <p className="rounded-lg bg-muted-surface p-3 text-ink">{state.message}</p>}

      <fieldset className="flex flex-col gap-3">
        <legend className="font-semibold">Alert mode</legend>
        {MODES.map((m) => (
          <label key={m.value} className="flex items-start gap-3 rounded-lg border border-line p-3">
            <input type="radio" name="alertMode" value={m.value} defaultChecked={m.value === alertMode} className="mt-1 h-4 w-4" />
            <span>
              <span className="block font-medium">{m.label}</span>
              <span className="block text-sm text-muted-foreground">{m.help}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex items-center gap-3">
        <Switch checked={autoSend} onCheckedChange={setAutoSend} aria-label="Send untouched briefs automatically on Monday 07:00" />
        <input type="hidden" name="briefAutoSend" value={autoSend ? 'on' : ''} />
        <Label>Send untouched briefs automatically on Monday 07:00</Label>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="timezone">Business time zone</Label>
        <select id="timezone" name="timezone" defaultValue={timezone} className={selectClass}>
          {timezoneOptions.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" disabled={pending} className="self-start">
        Save
      </Button>
    </form>
  );
}

export function AddRecipientForm({ clientId }: { clientId: string }) {
  const [state, formAction, pending] = useActionState(addRecipientAction, { ok: true } as FormResult);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="clientId" value={clientId} />
      {!state.ok && state.error && (
        <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">
          {state.error}
        </p>
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
            <option value="client_owner">Owner</option>
            <option value="client_viewer">Viewer</option>
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
  const [state, formAction, pending] = useActionState(deactivateRecipientAction, { ok: true } as FormResult);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Deactivate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deactivate {email}?</DialogTitle>
          <DialogDescription>Links already sent to this person stop working.</DialogDescription>
        </DialogHeader>
        {!state.ok && state.error && (
          <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">
            {state.error}
          </p>
        )}
        <form action={formAction}>
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="contactId" value={contactId} />
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={pending}>
              Deactivate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
