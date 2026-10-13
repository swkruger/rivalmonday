import { hasFeature, isAgencyRole } from '@cs/core';
import type { ClientProfile } from '@cs/tools';
import Link from 'next/link';
import { notFound } from 'next/navigation';
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
        <h1 className="text-[26px] font-extrabold tracking-tight">Services &amp; area — {p.name}</h1>
        <ServicesAreaSummary profile={p} serviceNames={names} />
        <p className="text-muted-foreground">To change these, contact your account manager.</p>
      </>
    );
  }
  // Phase 8b: `get_ask_starters` is hidden in a support session and the session is read-only, so the Ask-review toggle (an agency-admin write control) is omitted there rather than shown with a guessed value.
  const showReviewToggle = ctx.role === 'agency_admin' && !ctx.support;
  const reviewAllowed = showReviewToggle ? (await callTool<{ reviewAllowed: boolean }>(ctx, 'get_ask_starters', { clientId })).reviewAllowed : true;
  return (
    <>
      {p.status === 'prospect' && (
        <Link href={`/agency/prospects/${clientId}`} className="text-sm font-semibold text-primary-soft-text">
          ← Back to the prospect
        </Link>
      )}
      <h1 className="text-[26px] font-extrabold tracking-tight">Profile — {p.name}</h1>
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
