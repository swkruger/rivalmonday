import { hasFeature, isAgencyRole } from '@cs/core';
import type { ClientProfile } from '@cs/tools';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClientBillingControls, type ClientBillingStatusRow } from '@/components/billing/client-billing-controls';
import { ClientProfileForm } from '@/components/client-profile-form';
import { ServicesAreaSummary } from '@/components/services-area-summary';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { verticalOptions } from '@/server/verticals';
import { saveFeaturesAction, updateProfileAction } from './actions';
import { ClientFeaturesForm } from './client-features-form';

export const dynamic = 'force-dynamic';

export default async function ClientProfilePage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { ctx } = await requireContext();
  const agency = isAgencyRole(ctx.role);
  if (!agency && !hasFeature(ctx, 'dashboard')) notFound();
  const p = await callTool<ClientProfile>(ctx, 'get_client_profile', { clientId });
  if (!agency) {
    const names = Object.fromEntries((await verticalOptions()).flatMap((v) => v.services.map((s) => [s.id, s.name] as const)));
    return (
      <>
        <h1 className="text-[26px] font-extrabold tracking-tight">Business profile</h1>
        <ServicesAreaSummary profile={p} serviceNames={names} />
        <p className="text-muted-foreground">To change these, contact your account manager.</p>
      </>
    );
  }
  // Phase 8b: `get_ask_starters` is hidden in a support session and the session is read-only, so the Ask-review toggle (an agency-admin write control) is omitted there rather than shown with a guessed value.
  const showReviewToggle = ctx.role === 'agency_admin' && !ctx.support;
  const reviewAllowed = showReviewToggle ? (await callTool<{ reviewAllowed: boolean }>(ctx, 'get_ask_starters', { clientId })).reviewAllowed : true;
  const billing = p.status === 'active' ? (await callTool<{ clients: ClientBillingStatusRow[] }>(ctx, 'list_client_billing_status', {}))?.clients?.find((b) => b.clientId === clientId) : undefined;
  return (
    <>
      {p.status === 'prospect' && (
        <Link href={`/agency/prospects/${clientId}`} className="text-sm font-semibold text-primary-soft-text">
          ← Back to the prospect
        </Link>
      )}
      <h1 className="text-[26px] font-extrabold tracking-tight">Business profile</h1>
      {billing && (
        <section aria-label="Billing" className="flex items-center gap-3">
          <span className="font-semibold">Billing</span>
          <ClientBillingControls
            clientId={clientId} clientName={p.name} role={ctx.role === 'agency_admin' ? 'agency_admin' : 'account_manager'} pill={billing.pill}
            billing={{ state: billing.state, enabled: billing.enabled }} nextPriceCents={billing.nextPriceCents}
          />
        </section>
      )}
      <p className="text-muted-foreground">
        Time zone and delivery live under <Link href={`/c/${clientId}/settings/delivery`} className="font-semibold text-primary-soft-text">Delivery</Link>.
      </p>
      <ClientProfileForm
        mode="edit" action={updateProfileAction} verticals={await verticalOptions()} clientId={clientId}
        initial={{ name: p.name, verticalId: p.verticalId, services: p.services, keywords: p.keywords, placeId: p.placeId, serviceArea: p.serviceArea }}
      />
      <ClientFeaturesForm clientId={clientId} features={p.features} action={saveFeaturesAction} role={showReviewToggle ? ctx.role : undefined} reviewAllowed={reviewAllowed} />
    </>
  );
}
