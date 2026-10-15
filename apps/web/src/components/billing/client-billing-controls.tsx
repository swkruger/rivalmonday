'use client';
import type { ClientBillingPill as PillData } from '@cs/billing';
import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, Input, Label } from '@cs/ui';
import { useActionState, useEffect, useRef, useState } from 'react';
import { clientBillingAction } from '@/app/(app)/agency/settings/billing/client-billing/actions';
import { centsToField } from '@/app/(app)/agency/settings/billing/client-billing/money';
import { WriteGuard } from '@/components/read-only';
import type { FormResult } from '@/server/forms';

type PillKey = PillData['key'];
const TONE: Record<PillKey, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  paused: 'outline', payment_needed: 'destructive', invited: 'secondary', paying: 'default', off: 'outline',
};

/** The billing pill: state only, never an amount, so every agency role may see it. */
export function ClientBillingPill({ pill }: { pill: PillData }) {
  return <Badge variant={TONE[pill.key]}>{pill.label}</Badge>;
}

export interface ClientBillingControlsProps {
  clientId: string;
  clientName: string;
  role: 'agency_admin' | 'account_manager';
  pill: PillData;
  billing: { state: string; enabled: boolean };
  /** Admin payload only: prefill for Change price. Account managers never receive amounts. */
  nextPriceCents?: number | null;
}

/** One row of `list_client_billing_status`: amount keys exist only in the agency admin's payload. */
export interface ClientBillingStatusRow {
  clientId: string;
  state: string;
  enabled: boolean;
  pill: PillData;
  nextPriceCents?: number | null;
}

const INITIAL: FormResult = { ok: true };

/**
 * Pill plus an actions dialog. Agency admins get the billing actions and Pause / Resume; account managers only
 * Pause / Resume. The result message lives outside the dialog because the revalidated page can unmount whatever
 * triggered the action (see apps/web/CLAUDE.md, UI patterns).
 */
export function ClientBillingControls({ clientId, clientName, role, pill, billing, nextPriceCents }: ClientBillingControlsProps) {
  const [state, formAction, pending] = useActionState(async (prev: FormResult, fd: FormData) => clientBillingAction(prev, fd), INITIAL);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'menu' | 'price' | 'off'>('menu');
  const first = useRef(state);
  useEffect(() => {
    if (state !== first.current) {
      setOpen(false);
      setMode('menu');
    }
  }, [state]);
  const admin = role === 'agency_admin';
  const paused = pill.key === 'paused';
  // R19: only a pending invite has a payment link to resend (a failed payment is fixed by the client in the portal).
  const invited = billing.enabled && billing.state === 'invited';
  const submit = (intent: string, label: string, variant: 'default' | 'outline' | 'destructive' = 'outline') => (
    <Button type="submit" name="intent" value={intent} variant={variant} disabled={pending} className="justify-start">
      {label}
    </Button>
  );
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <ClientBillingPill pill={pill} />
        <WriteGuard>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setMode('menu'); }}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="sm" aria-label="Billing actions">Actions</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{clientName}</DialogTitle>
                <DialogDescription>{admin ? 'Billing and pause actions for this client.' : 'Pause or resume this client.'}</DialogDescription>
              </DialogHeader>
              <form action={formAction} className="flex flex-col gap-2">
                <input type="hidden" name="clientId" value={clientId} />
                {mode === 'menu' && (
                  <>
                    {admin && !billing.enabled && submit('enable', 'Turn on billing')}
                    {admin && invited && submit('resend', 'Resend payment link')}
                    {admin && billing.enabled && (
                      <Button type="button" variant="outline" className="justify-start" onClick={() => setMode('price')}>Change price</Button>
                    )}
                    {admin && billing.enabled && (
                      <Button type="button" variant="outline" className="justify-start" onClick={() => setMode('off')}>Turn off billing</Button>
                    )}
                    {paused ? submit('resume', 'Resume') : submit('pause', 'Pause')}
                  </>
                )}
                {admin && mode === 'price' && (
                  <>
                    <Label htmlFor={`price-${clientId}`}>New monthly price ($)</Label>
                    <Input id={`price-${clientId}`} name="price" required inputMode="decimal" defaultValue={centsToField(nextPriceCents)} />
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <input id={`next-${clientId}`} type="radio" name="applyTo" value="next_bill" defaultChecked />
                        <Label htmlFor={`next-${clientId}`}>Next bill</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input id={`new-${clientId}`} type="radio" name="applyTo" value="new_only" />
                        <Label htmlFor={`new-${clientId}`}>New sign-ups only</Label>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {submit('set_price', 'Save price', 'default')}
                      <Button type="button" variant="outline" onClick={() => setMode('menu')}>Back</Button>
                    </div>
                  </>
                )}
                {admin && mode === 'off' && (
                  <>
                    <input type="hidden" name="confirm" value="yes" />
                    <p className="text-sm text-ink">A running subscription is cancelled at the end of the current period; an unpaid invite is withdrawn.</p>
                    <div className="flex gap-2">
                      {submit('disable', 'Yes, turn off billing', 'destructive')}
                      <Button type="button" variant="outline" onClick={() => setMode('menu')}>Back</Button>
                    </div>
                  </>
                )}
              </form>
            </DialogContent>
          </Dialog>
        </WriteGuard>
      </div>
      {!state.ok && <p role="alert" className="text-sm text-ink">{state.error}</p>}
      {state.ok && state.message && <p role="status" className="text-sm text-ink">{state.message}</p>}
    </div>
  );
}
