'use client';
import { Button, ConfirmDialog, Input, Label } from '@cs/ui';
import Link from 'next/link';
import { useState } from 'react';
import { WriteGuard } from '@/components/read-only';

/** What the page read for the form (spec §7). `ready` = Connect is charging; `null` fields mean no default is set. */
export interface BillingPrefill {
  ready: boolean;
  priceCents: number | null;
  setupFeeCents: number | null;
}

const toField = (cents: number | null) => (cents == null ? '' : cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

/** Confirm body: "… for $249/month plus $99 setup." (the fee part only when a fee is typed). */
const confirmBody = (price: string, fee: string) =>
  `The owner gets an email with a payment link for $${price.trim()}/month${fee.trim() ? ` plus $${fee.trim()} setup` : ''}.`;

/** Step 5 (clients only). Agency admins turn billing on; everyone else is told who can. */
export function BillingStep({
  isAdmin, prefill, skipped, pending, onEnable, onSkip,
}: { isAdmin: boolean; prefill: BillingPrefill | null; skipped: boolean; pending: boolean; onEnable: (price: string, setupFee: string) => void; onSkip: () => void }) {
  const [price, setPrice] = useState(() => toField(prefill?.priceCents ?? null));
  const [fee, setFee] = useState(() => toField(prefill?.setupFeeCents ?? null));
  let body: React.ReactNode;
  if (!isAdmin) body = <p className="text-muted-foreground">An agency admin turns on billing.</p>;
  else if (skipped) body = <p className="text-muted-foreground">Billing for clients starts once your plan is active.</p>;
  else if (!prefill?.ready) body = <p className="text-muted-foreground"><Link href="/agency/settings/billing" className="font-semibold text-primary-soft-text">Connect Stripe in Settings → Billing</Link> to bill this client.</p>;
  else {
    body = (
      <div className="flex flex-col gap-3">
        <div className="flex max-w-xs flex-col gap-2">
          <Label htmlFor="billing-price">Monthly price ($)</Label>
          <Input id="billing-price" inputMode="decimal" required value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="flex max-w-xs flex-col gap-2">
          <Label htmlFor="billing-fee">Setup fee ($)</Label>
          <Input id="billing-fee" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
        </div>
        <WriteGuard>
          <div>
            {/* Sends the client an email, so it asks first. */}
            <ConfirmDialog
              trigger={<Button type="button" disabled={pending || !price.trim()}>Turn on billing and email the payment link</Button>}
              title="Turn on billing?"
              body={confirmBody(price, fee)}
              confirmLabel="Turn on billing"
              action={() => onEnable(price, fee)}
            />
          </div>
        </WriteGuard>
      </div>
    );
  }
  return (
    <section className="flex flex-col gap-4 rounded-[14px] bg-surface p-6 shadow-card">
      <h2 className="font-semibold">Billing</h2>
      {body}
      <WriteGuard>
        <div><Button type="button" variant="outline" disabled={pending} onClick={onSkip}>Skip for now</Button></div>
      </WriteGuard>
    </section>
  );
}
