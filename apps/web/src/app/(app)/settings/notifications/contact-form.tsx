'use client';
import { Button, Input, Label } from '@cs/ui';
import { useActionState } from 'react';
import { updateContactAction } from './actions';

const TIMEZONES: string[] = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];

export function ContactForm({ contactId, timezone, quietHours }: { contactId: string; timezone: string | null; quietHours: { start: string; end: string } | null }) {
  const [state, formAction, pending] = useActionState(updateContactAction, { error: null });

  return (
    <form action={formAction} className="flex flex-col gap-4 border-t border-line pt-5">
      <input type="hidden" name="contactId" value={contactId} />
      {state.error && (
        <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">
          {state.error}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="timezone">Time zone</Label>
        <select
          id="timezone"
          name="timezone"
          defaultValue={timezone ?? ''}
          className="h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="">Business time zone</option>
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="quietStart">Quiet hours start</Label>
          <Input id="quietStart" name="quietStart" type="time" defaultValue={quietHours?.start ?? ''} className="w-36" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="quietEnd">Quiet hours end</Label>
          <Input id="quietEnd" name="quietEnd" type="time" defaultValue={quietHours?.end ?? ''} className="w-36" />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">No notifications by email in this window (in-app still arrive).</p>
      <Button type="submit" disabled={pending} className="self-start">
        Save
      </Button>
    </form>
  );
}
