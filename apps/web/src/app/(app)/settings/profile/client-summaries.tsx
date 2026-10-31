import { hasFeature, type AccessContext } from '@cs/core';
import type { ClientProfile, SpendCredits } from '@cs/tools';
import { Section, StatusChip } from '@cs/ui';
import Link from 'next/link';
import { SpendBadge } from '@/components/spend-badge';
import { clientPlanStatus, type MyBilling } from '@/lib/client-plan-status';
import { formatCreditsOf, formatDate, formatMoney } from '@/lib/format';
import { CLIENT_PLAN_STATUS, labelFor } from '@/lib/labels';
import { tryCallTool } from '@/server/tools';
import { viewerTimeZone } from '@/server/viewer-tz';

interface Props {
  ctx: AccessContext;
  clientId: string;
  /** `showsClientBilling(ctx.role, clientBillingNoticeOf(ctx))`, computed as the app shell does. */
  billingEnabled: boolean;
}

function Row({ heading, href, linkText, children }: { heading: string; href: string; linkText: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
      <h3 className="w-40 shrink-0 text-13 font-semibold text-ink">{heading}</h3>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 text-13">{children}</div>
      <Link href={href} className="text-13 font-semibold text-primary-soft-text">{linkText}</Link>
    </div>
  );
}

/**
 * User-profile spec decision 5: read-only summaries of the client's own business, each linking to its full page. Same
 * limits the tools enforce: owner sees Business (with `dashboard`), Usage and Billing (while billing is on), viewer only
 * Business. A read that refuses drops its panel only; with none left, no section.
 */
export async function ClientSummaries({ ctx, clientId, billingEnabled }: Props) {
  const owner = ctx.role === 'client_owner';
  if (!owner && ctx.role !== 'client_viewer') return null;
  const base = `/c/${clientId}/settings`;
  const [profile, usage, billing, tz] = await Promise.all([
    hasFeature(ctx, 'dashboard') ? tryCallTool<ClientProfile>(ctx, 'get_client_profile', { clientId }) : null,
    owner ? tryCallTool<{ credits: SpendCredits }>(ctx, 'get_my_usage', { clientId }) : null,
    owner && billingEnabled ? tryCallTool<MyBilling>(ctx, 'get_my_billing', { clientId }) : null,
    viewerTimeZone(),
  ]);
  if (!profile && !usage && !billing) return null;

  const plan = billing ? clientPlanStatus(billing) : null;
  const chip = plan ? labelFor(CLIENT_PLAN_STATUS, plan.status) : null;
  const services = profile?.services.length ?? 0;

  return (
    <Section title="Your business" className="max-w-[640px]">
      <div className="flex flex-col divide-y divide-line">
        {profile && (
          <Row heading="Business profile" href={`${base}/profile`} linkText="View business profile">
            <span className="font-semibold text-ink">{profile.name}</span>
            {services > 0 && <span className="text-muted-ink">{services === 1 ? '1 service' : `${services} services`}</span>}
          </Row>
        )}
        {usage && (
          <Row heading="Usage" href={`${base}/usage`} linkText="View usage">
            <span className="font-semibold text-ink">{formatCreditsOf(usage.credits.used, usage.credits.limit)}</span>
            <SpendBadge credits={usage.credits} />
          </Row>
        )}
        {billing && plan && chip && (
          <Row heading="Billing" href={`${base}/billing`} linkText="View billing">
            <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
            {!billing.paused && billing.nextChargeDate ? (
              <span className="text-ink">
                Next charge {billing.nextChargeAmountCents !== null ? `${formatMoney(billing.nextChargeAmountCents, { unit: 'cents' })} on ` : 'on '}
                {formatDate(billing.nextChargeDate, { tz })}
              </span>
            ) : plan.detail ? (
              <span className="text-muted-ink">{plan.detail}</span>
            ) : null}
          </Row>
        )}
      </div>
    </Section>
  );
}
