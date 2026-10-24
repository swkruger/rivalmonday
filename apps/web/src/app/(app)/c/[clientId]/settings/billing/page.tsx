import { formatMoney, formatDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle, StatusChip } from '@cs/ui';
import type { ClientProfile } from '@cs/tools';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PaymentButton } from '@/app/(app)/agency/settings/billing/payment-button';
import { RefreshUntilChanged } from '@/components/billing/refresh-until-changed';
import { clientSettingsCrumbs } from '@/components/client-crumbs';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { CLIENT_PLAN_STATUS, labelFor } from '@/lib/labels';
import { PAGE_COPY } from '@/help/copy';
import { hasClientSettings } from '@/server/client-settings-nav';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { managePaymentAction } from './actions';

export const dynamic = 'force-dynamic';
/** R18: the (app) title template appends the agency's name: "Billing · {agency}". */
export const metadata: Metadata = { title: 'Billing' };

const HELP_KEY = 'page:client.settings.billing';
const COPY = PAGE_COPY['client.settings.billing'];

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

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type PlanStatus = keyof typeof CLIENT_PLAN_STATUS;

function statusOf(b: MyBilling): { status: PlanStatus; detail: string | null } {
  if (b.paused) return { status: 'paused', detail: `Monitoring is paused. Please contact ${b.agencyName}.` };
  if (!b.enabled) return { status: 'not_set_up', detail: `Billing is not set up for this workspace. Please contact ${b.agencyName} with any questions.` };
  switch (b.state) {
    case 'active': return { status: 'active', detail: null };
    case 'payment_needed': return { status: 'payment_needed', detail: 'Your last payment did not go through. Please update your payment method.' };
    case 'invited': return { status: 'invited', detail: `Check your email for the payment link from ${b.agencyName}.` };
    case 'cancelled': return { status: 'cancelled', detail: null };
    default: return { status: 'unavailable', detail: `Please contact ${b.agencyName} about your billing.` };
  }
}

/**
 * Phase 9b spec § UI: the client owner's billing page, agency-branded (the shell carries the agency's theme). Any other
 * role, a guest, or another client's owner gets a 404 from the tool. "Manage payment" hides itself in a support session.
 */
export default async function ClientBillingPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ checkout?: string | string[] }> }) {
  const { clientId } = await params;
  const { checkout } = await searchParams;
  const { ctx } = await requireContext();
  if (ctx.role !== 'client_owner') notFound();
  const [b, profile, settingsLinked, guides] = await Promise.all([
    callTool<MyBilling>(ctx, 'get_my_billing', { clientId }),
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    hasClientSettings(clientId),
    helpGuides(ctx, 'client', clientId),
  ]);
  const status = statusOf(b);
  const chip = labelFor(CLIENT_PLAN_STATUS, status.status);
  const flash = one(checkout) === 'done' ? CHECKOUT_DONE_COPY : one(checkout) === 'cancelled' ? CHECKOUT_CANCELLED_COPY : null;

  return (
    <>
      <PageHeader
        title="Billing"
        breadcrumb={clientSettingsCrumbs({ id: clientId, name: profile.name }, 'Billing', settingsLinked)}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <TipRow
        items={[
          { label: 'Status', tip: 'client.settings.billing.status' },
          { label: 'Next charge', tip: 'client.settings.billing.nextCharge' },
          { label: 'Manage payment details', tip: 'client.settings.billing.managePayment' },
        ]}
      />
      {one(checkout) === 'done' && <RefreshUntilChanged watch={b.state} />}
      {flash && <p role="status" className="rounded-md bg-muted-surface px-4 py-2 text-sm font-semibold text-ink">{flash}</p>}
      <Card>
        <CardHeader>
          <CardTitle>Your plan with {b.agencyName}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Status</span>
            <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
          </div>
          {status.detail && <p className="text-sm">{status.detail}</p>}
          {!b.paused && b.nextChargeDate && (
            <p className="text-sm">
              <span className="text-muted-foreground">Next charge </span>
              <span className="font-semibold">{b.nextChargeAmountCents !== null ? `${formatMoney(b.nextChargeAmountCents, { unit: 'cents' })} on ` : 'on '}{formatDate(b.nextChargeDate, { tz: 'UTC' })}</span>
            </p>
          )}
          {!b.nextChargeDate && b.nextChargeAmountCents !== null && !b.endsOn && <p className="text-sm"><span className="text-muted-foreground">Monthly amount </span><span className="font-semibold">{formatMoney(b.nextChargeAmountCents, { unit: 'cents' })}</span></p>}
          {b.endsOn && <p className="text-sm">Your plan ends on {formatDate(b.endsOn, { tz: 'UTC' })}. There will be no further charges.</p>}
          {b.canManagePayment && <PaymentButton action={managePaymentAction.bind(null, clientId)} label="Manage payment" />}
        </CardContent>
      </Card>
    </>
  );
}
