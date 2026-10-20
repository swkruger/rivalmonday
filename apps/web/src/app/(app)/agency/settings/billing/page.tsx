import type { BillingState } from '@cs/db';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@cs/ui';
import { notFound } from 'next/navigation';
import { formatLongDate, formatUsd } from '@/components/billing/format';
import { RefreshUntilChanged } from '@/components/billing/refresh-until-changed';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import type { FormResult } from '@/server/forms';
import { callTool } from '@/server/tools';
import { checkoutAction, portalAction } from './actions';
import { PaymentButton } from './payment-button';
import { ClientBillingSection, type ConnectStatus } from './client-billing/section';
import type { Revenue } from './client-billing/revenue-card';
import { RedeemForm } from './redeem-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Billing' };

const HELP_KEY = 'page:agency.settings.billing';
const COPY = PAGE_COPY['agency.settings.billing'];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

interface Summary {
  state: BillingState;
  plan: { name: string; version: number; basePriceCents: number; includedSeats: number; seatPriceCents: number } | null;
  dates: { trialEndsAt: string | null; pilotEndsAt: string | null; pastDueSince: string | null; pausesOn: string | null; cancelAt: string | null };
  seats: { used: number; included: number; extra: number };
  nextInvoice: { amountDueCents: number; periodEnd: string; discountCents: number } | null;
  discount: { code?: string; couponId: string } | null;
  recentInvoices: { id: string; number: string | null; amountPaidCents: number; status: string | null; hostedInvoiceUrl: string | null; created: string }[];
  hasSubscription: boolean;
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

/**
 * The portal manages a stored subscription; without one (never subscribed, or it ended and was forgotten, R26) only
 * Checkout can start a new one. Before the first payment the button reads "Add payment method", afterwards "Subscribe".
 */
function paymentAction(s: Summary): { action: () => Promise<FormResult>; label: string } {
  if (s.hasSubscription) return { action: portalAction, label: 'Manage billing' };
  return { action: checkoutAction, label: s.state === 'pilot' || s.state === 'trialing' ? 'Add payment method' : 'Subscribe' };
}

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
  // 7a1 D7: the platform plan, the Connect account and the page guides are independent reads (one stage).
  const [s, connectStatus, guides] = await Promise.all([
    callTool<Summary>(ctx, 'get_billing_summary', {}),
    callTool<ConnectStatus>(ctx, 'get_connect_status', {}),
    helpGuides(ctx, 'agency'),
  ]);
  const revenue = connectStatus.status === 'connected' ? await callTool<Revenue>(ctx, 'get_client_revenue', {}) : null;
  const date = keyDate(s);
  const pay = paymentAction(s);
  return (
    <>
      <PageHeader
        title="Billing"
        breadcrumb={[{ label: 'Agency settings', href: '/agency/settings' }, { label: 'Billing' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      {done && <RefreshUntilChanged watch={`${s.state}:${s.hasSubscription}`} />}
      {done && (
        <p role="status" className="rounded-lg bg-muted-surface p-3 text-ink">
          Thanks — your billing details are being updated. This page refreshes as soon as Stripe confirms.
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              {s.plan?.name ?? 'No plan'}
              <HelpTip tip="agency.settings.billing.plan" />
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Badge variant={STATE_TONE[s.state]}>{STATE_LABEL[s.state]}</Badge>
              <HelpTip tip="agency.settings.billing.status" />
            </span>
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
            <PaymentButton action={pay.action} label={pay.label} />
          </div>
        </CardContent>
      </Card>
      <ClientBillingSection status={connectStatus} revenue={revenue} connect={connect} help={<HelpTip tip="agency.settings.billing.clientBilling" />} />
      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-1.5">
            Discount code
            <HelpTip tip="agency.settings.billing.discount" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RedeemForm />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-1.5">
            Recent invoices
            <HelpTip tip="agency.settings.billing.invoice" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {s.recentInvoices.length === 0 ? (
            <EmptyState {...COPY.empty.noInvoices} guideAnchor="what-this-page-tells-you" />
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
