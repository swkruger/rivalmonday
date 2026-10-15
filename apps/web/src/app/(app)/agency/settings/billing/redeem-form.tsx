'use client';
import { Button, Input, Label } from '@cs/ui';
import { useActionState } from 'react';
import { useReadOnly } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { redeemCodeAction } from './actions';

export function RedeemForm() {
  const [state, formAction, pending] = useActionState(redeemCodeAction, { ok: true } as FormResult);
  if (useReadOnly()) return null;
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Label htmlFor="code">Discount code</Label>
      <div className="flex max-w-sm gap-2">
        <Input id="code" name="code" required maxLength={64} autoComplete="off" />
        <Button type="submit" variant="outline" disabled={pending}>Redeem code</Button>
      </div>
      {!state.ok && <p role="alert" className="text-sm text-ink">{state.error}</p>}
      {state.ok && state.message && <p role="status" className="text-sm text-ink">{state.message}</p>}
    </form>
  );
}
