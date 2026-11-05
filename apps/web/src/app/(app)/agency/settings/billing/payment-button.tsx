'use client';
import { Button, ConfirmDialog } from '@cs/ui';
import { useActionState, useState } from 'react';
import { useReadOnly } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { ErrorNote } from '@/components/form-error';

/** Runs a checkout/portal action; on success the action redirects to Stripe, on refusal the message shows here. */
export function PaymentButton({ action, label, variant = 'default' }: { action: () => Promise<FormResult>; label: string; variant?: 'default' | 'ink' }) {
  const [state, formAction, pending] = useActionState<FormResult>(() => action(), { ok: true });
  if (useReadOnly()) return null;
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Button type="submit" variant={variant} disabled={pending} className="self-start">{label}</Button>
      {!state.ok && <ErrorNote compact focusKey={state}>{state.error}</ErrorNote>}
    </form>
  );
}

/** Checkout with a Monthly / Yearly choice (only rendered when the plan has a yearly base). */
export function CheckoutForm({ action, label, monthlyLabel, yearlyLabel }: { action: (interval: 'month' | 'year') => Promise<FormResult>; label: string; monthlyLabel: string; yearlyLabel: string }) {
  const [choice, setChoice] = useState<'month' | 'year'>('month');
  const [state, formAction, pending] = useActionState<FormResult>(() => action(choice), { ok: true });
  if (useReadOnly()) return null;
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="sr-only">Billing interval</legend>
        {([['month', monthlyLabel], ['year', yearlyLabel]] as const).map(([v, text]) => (
          <label key={v} className="flex items-center gap-2 text-sm">
            <input type="radio" name="interval" value={v} checked={choice === v} onChange={() => setChoice(v)} className="h-4 w-4" /> {text}
          </label>
        ))}
      </fieldset>
      <Button type="submit" disabled={pending} className="self-start">{label}</Button>
      {!state.ok && <ErrorNote compact focusKey={state}>{state.error}</ErrorNote>}
    </form>
  );
}

/** "Switch to yearly" behind a confirm. A refusal shows in the dialog; success refreshes the page via the action's revalidate. */
export function SwitchToYearly({ action, yearBase }: { action: () => Promise<FormResult>; yearBase: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (useReadOnly()) return null;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setError(null);
      }}
      trigger={<Button type="button" variant="outline" className="self-start">Switch to yearly</Button>}
      title="Switch to yearly billing?"
      body={`You'll pay ${yearBase} for the year, less what's left of this month, today. Extra clients are billed yearly too.`}
      confirmLabel="Switch to yearly"
      error={error}
      action={async () => {
        const r = await action();
        if (r.ok) setOpen(false);
        else setError(r.error);
      }}
    />
  );
}
