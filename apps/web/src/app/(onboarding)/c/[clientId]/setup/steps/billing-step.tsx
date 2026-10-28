'use client';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Field, Input } from '@cs/ui';
import Link from 'next/link';
import { useState } from 'react';
import { ErrorNote } from '@/components/form-error';
import { INPUT_CLASS } from '@/components/onboarding/input-class';
import { OnboardingShell } from '@/components/onboarding/onboarding-shell';
import { PreviewWindow } from '@/components/onboarding/preview-window';
import { PaymentSummary } from '@/components/onboarding/previews/payment-summary';
import { StepFooter } from '@/components/onboarding/step-footer';
import { useReadOnly } from '@/components/read-only';
import { type StepFrame, stepOf } from './frame';

/** What the page read for the form (spec §7). `ready` = Connect is charging; `null` fields mean no default is set. */
export interface BillingPrefill {
  ready: boolean;
  priceCents: number | null;
  setupFeeCents: number | null;
}

const toField = (cents: number | null) => (cents == null ? '' : cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));
/** Typed dollars to whole cents for the preview; anything that is not an amount reads as none. */
const toCents = (v: string): number | null => (/^\d+(\.\d{1,2})?$/.test(v.trim()) ? Math.round(Number(v.trim()) * 100) : null);

/** Confirm body: "… for $249/month plus $99 setup." (the fee part only when a fee is typed). */
const confirmBody = (price: string, fee: string) =>
  `The owner gets an email with a payment link for $${price.trim()}/month${fee.trim() && toCents(fee) !== 0 ? ` plus $${fee.trim()} setup` : ''}.`;

/**
 * Step 6 (spec 16 §6, agency admins on active clients): the monthly price and an optional setup fee. Turning billing on
 * emails the owner a payment link, so it asks first. A plan that cannot bill yet, or no connected Stripe account, shows a
 * note instead of the form and "Continue" moves on as a skip.
 */
export function BillingStep({ frame, agencyName, clientName, ownerFirstName, prefill, skipped, backHref, pending, error, onEnable, onSkip }: {
  frame: StepFrame; agencyName: string; clientName: string; ownerFirstName: string | null; prefill: BillingPrefill | null; skipped: boolean;
  backHref: string; pending: boolean; error: string | null; onEnable: (price: string, setupFee: string) => void; onSkip: () => void;
}) {
  const readOnly = useReadOnly();
  const [price, setPrice] = useState(() => toField(prefill?.priceCents ?? null));
  const [fee, setFee] = useState(() => toField(prefill?.setupFeeCents ?? null));
  const [confirming, setConfirming] = useState(false);
  const form = !skipped && Boolean(prefill?.ready);
  const who = ownerFirstName ?? 'The owner';

  return (
    <OnboardingShell
      brand={frame.brand}
      exitSlot={frame.exitSlot}
      step={stepOf(frame, 'billing')}
      title="Set up billing"
      subtitle={`${clientName} pays ${agencyName} directly through your Stripe account.`}
      helpKey="page:client.setup"
      guide={frame.guide}
      preview={<PreviewWindow chrome="Payment page"><PaymentSummary agency={agencyName} client={clientName} priceCents={toCents(price)} setupFeeCents={toCents(fee) ?? 0} /></PreviewWindow>}
      caption={<><b className="font-semibold">Preview.</b> The payment page {ownerFirstName ?? 'the owner'} opens from the email.</>}
      footer={
        form ? (
          <StepFooter back={backHref} skip={{ label: 'Skip for now', onSkip, disabled: readOnly || pending }} primary={{ label: 'Turn on billing', pending, disabled: readOnly || !price.trim(), form: 'billing-form' }} />
        ) : (
          <StepFooter back={backHref} primary={{ label: 'Continue', pending, disabled: readOnly, form: 'billing-form' }} />
        )
      }
    >
      {error && <ErrorNote focusKey={error}>{error}</ErrorNote>}
      <form
        id="billing-form" onReset={(e) => e.preventDefault()}
        onSubmit={(e) => { e.preventDefault(); if (form) setConfirming(true); else onSkip(); }}
        className="flex flex-col gap-4"
      >
        {skipped ? (
          <p className="text-sm text-muted-ink">Billing for clients starts once your plan is active.</p>
        ) : !prefill?.ready ? (
          <p className="text-sm text-muted-ink"><Link href="/agency/settings/billing" className="font-semibold text-secondary">Connect Stripe in Settings → Billing</Link> to bill this client.</p>
        ) : (
          <fieldset disabled={readOnly} className="contents">
            <Field htmlFor="billing-price" label="Monthly price" required>
              <div className="relative max-w-[200px]">
                <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-ink">$</span>
                <Input id="billing-price" inputMode="decimal" required aria-required value={price} onChange={(e) => setPrice(e.target.value)} className={`${INPUT_CLASS} pl-7`} />
              </div>
            </Field>
            <Field htmlFor="billing-fee" label="Setup fee" optional>
              <div className="relative max-w-[200px]">
                <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-ink">$</span>
                <Input id="billing-fee" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} className={`${INPUT_CLASS} pl-7`} />
              </div>
            </Field>
            {toCents(price) !== null && (
              <p className="text-sm text-muted-ink">{who} gets an email with a payment link for ${price.trim()}/month. You can change the price later in the client&apos;s Settings.</p>
            )}
          </fieldset>
        )}
      </form>
      {/* Sends the owner an email, so it asks first. */}
      <Dialog open={confirming} onOpenChange={(o) => { if (!pending) setConfirming(o); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Turn on billing?</DialogTitle>
            <DialogDescription>{confirmBody(price, fee)}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirming(false)}>Cancel</Button>
            <Button type="button" disabled={pending} onClick={() => { setConfirming(false); onEnable(price, fee); }}>Turn on billing</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OnboardingShell>
  );
}
