import { Badge, Card, CardContent, CardHeader, CardTitle } from '@cs/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { PaymentButton } from '@/app/(app)/agency/settings/billing/payment-button';
import { formatLongDate, formatUsd } from '@/components/billing/format';
import { RefreshUntilChanged } from '@/components/billing/refresh-until-changed';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { managePaymentAction } from './actions';

export const dynamic = 'force-dynamic';

export interface MyBilling {
  agencyName: string;
  state: 'off' | 'invited' | 'active' | 'payment_needed' | 'cancelled' | 'disconnected';
  paused: boolean;
  enabled: boolean;
  nextChargeDate: string | null;
  nextChargeAmountCents: number | null;
  endsOn: string | null;
  canManagePayment: boolean;
}

export const CHECKOUT_DONE_COPY = 'Thanks — your payment details are saved.';
export const CHECKOUT_CANCELLED_COPY = 'Payment setup was cancelled.';

/** One tool call per request, shared by `generateMetadata` and the page. */
const loadBilling = cache(async (clientId: string) => {
  const { ctx } = await requireContext();
  if (ctx.role !== 'client_owner') notFound();
  return callTool<MyBilling>(ctx, 'get_my_billing', { clientId });
});

/** R18: the browser tab names the agency, never the platform. A refused viewer gets a neutral title (the page itself is a 404). */
export async function generateMetadata({ params }: { params: Promise<{ clientId: string }> }): Promise<Metadata> {
  const { clientId } = await params;
  try {
    return { title: `Billing · ${(await loadBilling(clientId)).agencyName}` };
  } catch {
    return { title: 'Billing' };
  }
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function statusOf(b: MyBilling): { label: string; tone: 'default' | 'secondary' | 'destructive'; detail: string | null } {
  if (b.paused) return { label: 'Paused', tone: 'destructive', detail: `Monitoring is paused. Please contact ${b.agencyName}.` };
  if (!b.enabled) return { label: 'Not set up', tone: 'secondary', detail: `Billing is not set up for this workspace. Please contact ${b.agencyName} with any questions.` };
  switch (b.state) {
    case 'active': return { label: 'Active', tone: 'default', detail: null };
    case 'payment_needed': return { label: 'Payment needed', tone: 'destructive', detail: 'Your last payment did not go through. Please update your payment method.' };
    case 'invited': return { label: 'Awaiting payment setup', tone: 'secondary', detail: `Check your email for the payment link from ${b.agencyName}.` };
    case 'cancelled': return { label: 'Cancelled', tone: 'secondary', detail: null };
    default: return { label: 'Not available', tone: 'secondary', detail: `Please contact ${b.agencyName} about your billing.` };
  }
}

/**
 * Phase 9b spec § UI: the client owner's billing page, agency-branded (the shell carries the agency's theme). Any other
 * role, a guest, or another client's owner gets a 404 from the tool. "Manage payment" hides itself in a support session.
 */
export default async function ClientBillingPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ checkout?: string | string[] }> }) {
  const { clientId } = await params;
  const { checkout } = await searchParams;
  const b = await loadBilling(clientId);
  const status = statusOf(b);
  const flash = one(checkout) === 'done' ? CHECKOUT_DONE_COPY : one(checkout) === 'cancelled' ? CHECKOUT_CANCELLED_COPY : null;

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Billing</h1>
      {one(checkout) === 'done' && <RefreshUntilChanged watch={b.state} />}
      {flash && <p role="status" className="rounded-md bg-muted-surface px-4 py-2 text-sm font-semibold text-ink">{flash}</p>}
      <Card>
        <CardHeader>
          <CardTitle>Your plan with {b.agencyName}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge variant={status.tone}>{status.label}</Badge>
          </div>
          {status.detail && <p className="text-sm">{status.detail}</p>}
          {!b.paused && b.nextChargeDate && (
            <p className="text-sm">
              <span className="text-muted-foreground">Next charge </span>
              <span className="font-semibold">{b.nextChargeAmountCents !== null ? `${formatUsd(b.nextChargeAmountCents)} on ` : 'on '}{formatLongDate(b.nextChargeDate)}</span>
            </p>
          )}
          {!b.nextChargeDate && b.nextChargeAmountCents !== null && !b.endsOn && <p className="text-sm"><span className="text-muted-foreground">Monthly amount </span><span className="font-semibold">{formatUsd(b.nextChargeAmountCents)}</span></p>}
          {b.endsOn && <p className="text-sm">Your plan ends on {formatLongDate(b.endsOn)}. There will be no further charges.</p>}
          {b.canManagePayment && <PaymentButton action={managePaymentAction.bind(null, clientId)} label="Manage payment" />}
        </CardContent>
      </Card>
    </>
  );
}
