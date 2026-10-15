'use client';
import { Button } from '@cs/ui';
import { useActionState } from 'react';
import { useReadOnly } from '@/components/read-only';
import type { FormResult } from '@/server/forms';

/** Runs a checkout/portal action; on success the action redirects to Stripe, on refusal the message shows here. */
export function PaymentButton({ action, label }: { action: () => Promise<FormResult>; label: string }) {
  const [state, formAction, pending] = useActionState<FormResult>(() => action(), { ok: true });
  if (useReadOnly()) return null;
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Button type="submit" disabled={pending} className="self-start">{label}</Button>
      {!state.ok && <p role="alert" className="text-sm text-ink">{state.error}</p>}
    </form>
  );
}
