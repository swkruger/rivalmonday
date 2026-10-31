'use client';
import { Input, Label, SaveBar } from '@cs/ui';
import { useActionState, useRef, useState } from 'react';
import { useReadOnly } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { saveDefaultsAction } from './actions';
import { centsToField } from './money';
import { ErrorNote } from '@/components/form-error';

export function DefaultsForm({ priceCents, setupFeeCents, autoPauseAfterDays }: { priceCents: number | null; setupFeeCents: number | null; autoPauseAfterDays: number | null }) {
  const [dirty, setDirty] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: FormResult, fd: FormData) => {
    const r = await saveDefaultsAction(prev, fd);
    if (r.ok) setDirty(false);
    return r;
  }, { ok: true } as FormResult);
  if (useReadOnly()) return null;
  return (
    <form ref={formRef} action={formAction} onChange={() => setDirty(true)} className="flex flex-col gap-3">
      <div className="grid max-w-3xl items-start gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cb-price">Monthly price ($)</Label>
          <Input id="cb-price" name="price" required aria-required="true" aria-describedby="cb-price-help" inputMode="decimal" defaultValue={centsToField(priceCents)} />
          <p id="cb-price-help" className="text-sm text-muted-ink">A new price applies to new sign-ups; existing subscriptions are unchanged.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cb-setup">Setup fee ($)</Label>
          <Input id="cb-setup" name="setupFee" aria-describedby="cb-setup-help" inputMode="decimal" defaultValue={centsToField(setupFeeCents)} />
          <p id="cb-setup-help" className="text-sm text-muted-ink">Leave blank to keep the current fee. Enter 0 for no setup fee.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cb-pause">Pause unpaid clients after (days)</Label>
          <Input id="cb-pause" name="autoPauseAfterDays" type="number" min={1} max={90} aria-describedby="cb-pause-help" defaultValue={autoPauseAfterDays ?? ''} />
          <p id="cb-pause-help" className="text-sm text-muted-ink">Leave blank to never pause automatically.</p>
        </div>
      </div>
      {!state.ok && <ErrorNote compact focusKey={state}>{state.error}</ErrorNote>}
      {state.ok && state.message && <p role="status" className="text-sm text-ink">{state.message}</p>}
      <SaveBar
        dirty={dirty}
        pending={pending}
        saveLabel="Save defaults"
        onReset={() => {
          formRef.current?.reset();
          setDirty(false);
        }}
      />
    </form>
  );
}
