import { Card, CardContent, CardHeader, CardTitle } from '@cs/ui';
import type { ReactNode } from 'react';
import { PaymentButton } from '../payment-button';
import { connectAction } from './actions';
import { DefaultsForm } from './defaults-form';
import { DisconnectDialog } from './disconnect-dialog';
import { type Revenue, RevenueCard } from './revenue-card';

export interface ConnectStatus {
  status: 'not_connected' | 'pending' | 'connected' | 'restricted' | 'disconnected';
  defaultPriceCents: number | null;
  defaultSetupFeeCents: number | null;
  autoPauseAfterDays: number | null;
  billingConfigured: boolean;
}

/** Phase 9b: the "Client billing" section of the agency billing page (agency admin only; the page gates the role). */
export function ClientBillingSection({ status, revenue, connect, help }: { status: ConnectStatus; revenue: Revenue | null; connect: string | undefined; help?: ReactNode }) {
  const s = status.status;
  const connected = s === 'connected';
  // Returning from Stripe (done) before the account is chargeable reads the same as a refresh (retry).
  const notice = connect === 'done' || connect === 'retry' ? (connected ? (connect === 'done' ? 'Stripe connected.' : null) : "Stripe setup isn't finished yet.") : null;
  return (
    <Card>
      <CardHeader>
        <div className="inline-flex items-center gap-1.5">
          <CardTitle>Client billing</CardTitle>
          {help}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!status.billingConfigured ? (
          <p className="text-muted-foreground">Client billing isn&apos;t available on this installation yet.</p>
        ) : (
          <>
            {notice && (
              <p role="status" className="rounded-lg bg-muted-surface p-3 text-ink">
                {notice}
              </p>
            )}
            {connected ? (
              <>
                <p>Stripe is connected. Your clients pay you directly.</p>
                <DefaultsForm priceCents={status.defaultPriceCents} setupFeeCents={status.defaultSetupFeeCents} autoPauseAfterDays={status.autoPauseAfterDays} />
                {revenue && <RevenueCard revenue={revenue} />}
                <DisconnectDialog />
              </>
            ) : s === 'pending' || s === 'restricted' ? (
              <>
                <p>{s === 'restricted' ? 'Stripe needs more information before you can take payments.' : 'Finish setting up Stripe so your clients can pay you.'}</p>
                <PaymentButton action={connectAction} label="Finish Stripe setup" />
              </>
            ) : (
              <>
                <p>Connect your Stripe account to bill your clients for monitoring. Payments go straight to you.</p>
                <PaymentButton action={connectAction} label="Connect Stripe" />
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
