'use client';
import { Input, Label, SaveBar } from '@cs/ui';
import { useActionState, useRef, useState } from 'react';
import { FormError } from '@/components/form-error';
import type { FormResult } from '@/server/forms';
import { updateContactAction } from './actions';

export function ContactForm({
  contactId,
  timezone,
  quietHours,
  timezoneOptions,
}: {
  contactId: string;
  timezone: string | null;
  quietHours: { start: string; end: string } | null;
  /** Built server-side (`timezoneOptions()` in `@/server/timezones`) and passed down so the server-rendered and
   * hydrated `<select>` list the exact same options — never built again here from `Intl.supportedValuesOf`
   * (Important I2, final review: that caused a hydration mismatch, omitted `'UTC'`, and silently cleared a
   * stored zone missing from the browser's list on save). */
  timezoneOptions: string[];
}) {
  const [dirty, setDirty] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: FormResult, fd: FormData) => {
    const r = await updateContactAction(prev, fd);
    if (r.ok) setDirty(false);
    return r;
  }, { ok: true } as FormResult);
  // Several cards share the page, so every id carries the contact id.
  const tzId = `${contactId}-timezone`;
  const startId = `${contactId}-quiet-start`;
  const endId = `${contactId}-quiet-end`;
  const noteId = `${contactId}-quiet-note`;

  return (
    <form ref={formRef} action={formAction} onChange={() => setDirty(true)} className="flex flex-col gap-4 border-t border-line pt-5">
      <input type="hidden" name="contactId" value={contactId} />
      <FormError state={state} />
      <div className="flex flex-col gap-2">
        <Label htmlFor={tzId}>Time zone</Label>
        <select
          id={tzId}
          name="timezone"
          defaultValue={timezone ?? ''}
          className="h-9 w-full max-w-sm rounded-sm border border-input bg-surface px-3 text-sm text-ink placeholder:text-muted-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-danger aria-invalid:ring-1 aria-invalid:ring-inset aria-invalid:ring-danger disabled:border-line-control disabled:bg-canvas disabled:text-muted-ink"
        >
          <option value="">Business time zone</option>
          {timezoneOptions.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={startId}>Quiet hours start</Label>
          <Input id={startId} name="quietStart" type="time" aria-describedby={noteId} defaultValue={quietHours?.start ?? ''} className="w-36" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={endId}>Quiet hours end</Label>
          <Input id={endId} name="quietEnd" type="time" aria-describedby={noteId} defaultValue={quietHours?.end ?? ''} className="w-36" />
        </div>
      </div>
      <p id={noteId} className="text-sm text-muted-foreground">Emails in this window are held and sent when it ends (in-app notices still arrive at once).</p>
      {state.ok && !dirty && state.message && <p role="status" className="text-sm text-ink">{state.message}</p>}
      <SaveBar
        dirty={dirty}
        pending={pending}
        saveLabel="Save"
        onReset={() => {
          formRef.current?.reset();
          setDirty(false);
        }}
      />
    </form>
  );
}
