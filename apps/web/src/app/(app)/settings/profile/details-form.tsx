'use client';
import { Input, Label, SaveBar } from '@cs/ui';
import { useActionState, useState } from 'react';
import { FormError } from '@/components/form-error';
import type { FormResult } from '@/server/forms';
import { updateNameAction } from './actions';

/** Name (editable) and email (read-only: it is the sign-in address). The page is a 404 in a support session. */
export function DetailsForm({ name: initial, email }: { name: string; email: string }) {
  const [name, setName] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [state, formAction, pending] = useActionState(async (prev: FormResult, fd: FormData) => {
    const r = await updateNameAction(prev, fd);
    if (r.ok) setSaved(String(fd.get('name') ?? '').trim());
    return r;
  }, { ok: true } as FormResult);
  const dirty = name !== saved;
  return (
    // React 19 resets a form after every action, errors included; the field is controlled and onReset is blocked, so a refused save keeps the typed name.
    <form action={formAction} onReset={(e) => e.preventDefault()} className="flex flex-col gap-4">
      <FormError state={state} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="profile-name">Name</Label>
        <Input id="profile-name" name="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="profile-email">Email</Label>
        <Input id="profile-email" value={email} readOnly aria-describedby="profile-email-hint" />
        <p id="profile-email-hint" className="text-sm text-muted-ink">This is the address you sign in with.</p>
      </div>
      {state.ok && !dirty && state.message && <p role="status" className="text-sm text-ink">{state.message}</p>}
      <SaveBar dirty={dirty} pending={pending} saveLabel="Save" onReset={() => setName(saved)} />
    </form>
  );
}
