import { hasFeature, isAgencyRole } from '@cs/core';
import type { ClientProfile } from '@cs/tools';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClientBillingControls, type ClientBillingStatusRow } from '@/components/billing/client-billing-controls';
import { clientSettingsCrumbs } from '@/components/client-crumbs';
import { ClientDetailsForm, type ClientDetailsInitial } from '@/components/client-details-form';
import { ClientProfileForm } from '@/components/client-profile-form';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { ServicesAreaSummary } from '@/components/services-area-summary';
import { PAGE_COPY } from '@/help/copy';
import { hasClientSettings } from '@/server/client-settings-nav';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { verticalOptions } from '@/server/verticals';
import { saveFeaturesAction, updateDetailsAction, updateProfileAction } from './actions';
import { ClientFeaturesForm } from './client-features-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Business profile' };

const HELP_KEY = 'page:client.settings.profile';
const COPY = PAGE_COPY['client.settings.profile'];
const TIPS = [
  { label: 'Services and keywords', tip: 'client.settings.profile.servicesKeywords' },
  { label: 'Service area', tip: 'client.settings.profile.area' },
  { label: 'Google Business Profile', tip: 'client.settings.profile.googleProfile' },
  { label: 'Client features', tip: 'client.settings.profile.features' },
  { label: 'Changing these details', tip: 'client.settings.profile.change' },
] as const;

export default async function ClientProfilePage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { ctx } = await requireContext();
  const agency = isAgencyRole(ctx.role);
  if (!agency && !hasFeature(ctx, 'dashboard')) notFound();
  const [p, settingsLinked, guides] = await Promise.all([callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }), hasClientSettings(clientId), helpGuides(ctx, 'client', clientId)]);
  const header = { description: <HelpText text={COPY.description} />, helpKey: HELP_KEY, guide: guides.has(HELP_KEY) };
  if (!agency) {
    const names = Object.fromEntries((await verticalOptions()).flatMap((v) => v.services.map((s) => [s.id, s.name] as const)));
    return (
      <>
        <PageHeader title="Business profile" breadcrumb={clientSettingsCrumbs({ id: clientId, name: p.name }, 'Business profile', settingsLinked)} {...header} />
        <TipRow items={[...TIPS]} />
        <div data-testid="profile-column" className="flex max-w-[640px] flex-col gap-6">
          <ServicesAreaSummary profile={p} serviceNames={names} />
          <p className="text-muted-ink"><HelpText text="To change these, contact {agency}." /></p>
        </div>
      </>
    );
  }
  // Phase 8b: `get_ask_starters` is hidden in a support session and the session is read-only, so the Ask-review toggle (an agency-admin write control) is omitted there rather than shown with a guessed value.
  const showReviewToggle = ctx.role === 'agency_admin' && !ctx.support;
  const reviewAllowed = showReviewToggle ? (await callTool<{ reviewAllowed: boolean }>(ctx, 'get_ask_starters', { clientId })).reviewAllowed : true;
  // Final fix I3: phone, address, owner contact and logo after setup (staff only; `update_client_details` refuses others).
  const details = await callTool<ClientDetailsInitial>(ctx, 'get_client_details', { clientId });
  const billing = p.status === 'active' ? (await callTool<{ clients: ClientBillingStatusRow[] }>(ctx, 'list_client_billing_status', {}))?.clients?.find((b) => b.clientId === clientId) : undefined;
  return (
    <>
      {p.status === 'prospect' && (
        <Link href={`/agency/prospects/${clientId}`} className="text-sm font-semibold text-primary-soft-text">
          ← Back to the prospect
        </Link>
      )}
      <PageHeader title="Business profile" breadcrumb={clientSettingsCrumbs({ id: clientId, name: p.name }, 'Business profile', settingsLinked)} {...header} />
      <TipRow items={[...TIPS]} />
      <div data-testid="profile-column" className="flex max-w-[640px] flex-col gap-6">
        {billing && (
          <section aria-label="Billing" className="flex items-center gap-3">
            <span className="font-semibold">Billing</span>
            <ClientBillingControls
              clientId={clientId} clientName={p.name} role={ctx.role === 'agency_admin' ? 'agency_admin' : 'account_manager'} pill={billing.pill}
              billing={{ state: billing.state, enabled: billing.enabled }} nextPriceCents={billing.nextPriceCents}
            />
          </section>
        )}
        <p className="text-muted-ink">
          Time zone and delivery live under <Link href={`/c/${clientId}/settings/delivery`} className="font-semibold text-primary-soft-text">Delivery</Link>.
        </p>
        <ClientDetailsForm clientId={clientId} action={updateDetailsAction} initial={{ phone: details.phone, address: details.address, logoUrl: details.logoUrl, contactName: details.contactName, contactEmail: details.contactEmail }} />
        <ClientProfileForm
          mode="edit" action={updateProfileAction} verticals={await verticalOptions()} clientId={clientId}
          initial={{ name: p.name, verticalId: p.verticalId, services: p.services, keywords: p.keywords, placeId: p.placeId, serviceArea: p.serviceArea }}
        />
        <ClientFeaturesForm clientId={clientId} features={p.features} action={saveFeaturesAction} role={showReviewToggle ? ctx.role : undefined} reviewAllowed={reviewAllowed} />
      </div>
    </>
  );
}
