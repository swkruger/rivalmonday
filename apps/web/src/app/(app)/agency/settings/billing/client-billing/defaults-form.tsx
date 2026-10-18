'use client';
import { Button, Input, Label } from '@cs/ui';
import { useActionState } from 'react';
import { useReadOnly } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { saveDefaultsAction } from './actions';
import { centsToField } from './money';
import { ErrorNote } from '@/components/form-error';

export function DefaultsForm({ priceCents, setupFeeCents, autoPauseAfterDays }: { priceCents: number | null; setupFeeCents: number | null; autoPauseAfterDays: number | null }) {
  const [state, formAction, pending] = useActionState(saveDefaultsAction, { ok: true } as FormResult);
  if (useReadOnly()) return null;
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid max-w-xl gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cb-price">Monthly price ($)</Label>
          <Input id="cb-price" name="price" required inputMode="decimal" defaultValue={centsToField(priceCents)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cb-setup">Setup fee ($)</Label>
          <Input id="cb-setup" name="setupFee" inputMode="decimal" defaultValue={centsToField(setupFeeCents)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cb-pause">Pause unpaid clients after (days)</Label>
          <Input id="cb-pause" name="autoPauseAfterDays" type="number" min={1} max={90} defaultValue={autoPauseAfterDays ?? ''} />
        </div>
      </div>
      <p className="text-sm text-muted-ink">Leave the setup fee blank to keep the current one (enter 0 for none). Leave the last box blank to never pause automatically. A new price applies to new sign-ups; existing subscriptions are unchanged.</p>
      <Button type="submit" disabled={pending} className="self-start">Save defaults</Button>
      {!state.ok && <ErrorNote compact focusKey={state}>{state.error}</ErrorNote>}
      {state.ok && state.message && <p role="status" className="text-sm text-ink">{state.message}</p>}
    </form>
  );
}
