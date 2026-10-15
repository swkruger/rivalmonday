import type { BillingState } from '@cs/db';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@cs/ui';
import { notFound } from 'next/navigation';
import { formatLongDate, formatUsd } from '@/components/billing/format';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { checkoutAction, portalAction } from './actions';
import { PaymentButton } from './payment-button';
import { ClientBillingSection, type ConnectStatus } from './client-billing/section';
import type { Revenue } from './client-billing/revenue-card';
import { RedeemForm } from './redeem-form';

export const dynamic = 'force-dynamic';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

interface Summary {
  state: BillingState;
  plan: { name: string; version: number; basePriceCents: number; includedSeats: number; seatPriceCents: number } | null;
  dates: { trialEndsAt: string | null; pilotEndsAt: string | null; pastDueSince: string | null; pausesOn: string | null; cancelAt: string | null };
  seats: { used: number; included: number; extra: number };
  nextInvoice: { amountDueCents: number; periodEnd: string; discountCents: number } | null;
  discount: { code?: string; couponId: string } | null;
  recentInvoices: { id: string; number: string | null; amountPaidCents: number; status: string | null; hostedInvoiceUrl: string | null; created: string }[];
}

const STATE_LABEL: Record<BillingState, string> = {
  pilot: 'Pilot', trialing: 'Trial', active: 'Active', past_due: 'Payment overdue', read_only: 'Paused', suspended: 'Suspended', cancelled: 'Cancelled',
};
const STATE_TONE: Record<BillingState, 'default' | 'secondary' | 'destructive'> = {
  pilot: 'secondary', trialing: 'secondary', active: 'default', past_due: 'destructive', read_only: 'destructive', suspended: 'destructive', cancelled: 'secondary',
};

function keyDate(s: Summary): string | null {
  const d = s.dates;
  if (s.state === 'trialing' && d.trialEndsAt) return `Trial ends ${formatLongDate(d.trialEndsAt)}`;
  if (s.state === 'pilot' && d.pilotEndsAt) return `Pilot ends ${formatLongDate(d.pilotEndsAt)}`;
  if (s.state === 'past_due' && d.pausesOn) return `Service pauses ${formatLongDate(d.pausesOn)}`;
  if (s.state === 'cancelled' && d.cancelAt) return `Access ends ${formatLongDate(d.cancelAt)}`;
  return null;
}

/** Once the agency has been through payment there is a subscription, so Checkout gives way to the customer portal. */
const HAS_SUBSCRIPTION: BillingState[] = ['active', 'past_due', 'read_only', 'suspended', 'cancelled'];

/**
 * Phase 9a spec, Web: the agency's plan, state, seats, invoices and payment actions. Agency admins only; every other
 * role (and a support viewer) gets a 404. The buttons run server actions, which redirect to Stripe.
 */
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ done?: string | string[]; connect?: string | string[] }> }) {
  const { viewer, ctx } = await requireContext();
  if (viewer.kind !== 'user' || ctx.role !== 'agency_admin') notFound();
  const sp = await searchParams;
  const done = one(sp.done) === '1';
  const connect = one(sp.connect);
  const s = await callTool<Summary>(ctx, 'get_billing_summary', {});
  const connectStatus = await callTool<ConnectStatus>(ctx, 'get_connect_status', {});
  const revenue = connectStatus.status === 'connected' ? await callTool<Revenue>(ctx, 'get_client_revenue', {}) : null;
  const date = keyDate(s);
  const subscribed = HAS_SUBSCRIPTION.includes(s.state);
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Billing</h1>
      {done && (
        <p role="status" className="rounded-lg bg-muted-surface p-3 text-ink">
          Thanks — your billing details are being updated. This page refreshes as soon as Stripe confirms.
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-3">
            <span>{s.plan?.name ?? 'No plan'}</span>
            <Badge variant={STATE_TONE[s.state]}>{STATE_LABEL[s.state]}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {s.plan && (
            <p>
              {formatUsd(s.plan.basePriceCents)} per month, includes {s.plan.includedSeats} {s.plan.includedSeats === 1 ? 'client' : 'clients'}; each extra client {formatUsd(s.plan.seatPriceCents)} per month.
            </p>
          )}
          {date && <p className="font-semibold">{date}</p>}
          <p>
            Seats: {s.seats.used} of {s.seats.included} included{s.seats.extra > 0 ? `, ${s.seats.extra} extra` : ''}.{' '}
            <a href="/agency/settings/billing/seats.csv" className="font-semibold text-primary-soft-text underline">
              Download seat report (CSV)
            </a>
          </p>
          {s.nextInvoice && (
            <p>
              Next invoice: <strong>{formatUsd(s.nextInvoice.amountDueCents)}</strong> on {formatLongDate(s.nextInvoice.periodEnd)}
              {s.nextInvoice.discountCents > 0 ? ` (includes ${formatUsd(s.nextInvoice.discountCents)} discount)` : ''}.
            </p>
          )}
          {s.discount && <p>Discount: {s.discount.code ?? 'applied'}</p>}
          <div className="mt-2">
            <PaymentButton action={subscribed ? portalAction : checkoutAction} label={subscribed ? 'Manage billing' : 'Add payment method'} />
          </div>
        </CardContent>
      </Card>
      <ClientBillingSection status={connectStatus} revenue={revenue} connect={connect} />
      <Card>
        <CardHeader>
          <CardTitle>Discount code</CardTitle>
        </CardHeader>
        <CardContent>
          <RedeemForm />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recent invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {s.recentInvoices.length === 0 ? (
            <p className="text-muted-foreground">No invoices yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {s.recentInvoices.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3">
                  <span>{formatLongDate(i.created)}</span>
                  <span>{formatUsd(i.amountPaidCents)}</span>
                  <span className="capitalize text-muted-foreground">{i.status ?? ''}</span>
                  {i.hostedInvoiceUrl && (
                    <a href={i.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-soft-text underline">
                      Invoice {i.number ?? i.id}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
