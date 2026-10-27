import { isAgencyRole } from '@cs/core';
import { MAX_KEYWORDS, type ClientProfile } from '@cs/tools';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { OnboardingShell } from '@/components/onboarding/onboarding-shell';
import { kmToMiles } from '@/lib/format';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { themeForViewer } from '@/server/theme';
import { callTool, tryCallTool } from '@/server/tools';
import { SetupWizard } from './setup-wizard';
import type { BillingPrefill } from './steps/billing-step';
import type { DoneSummary } from './steps/done-step';
import type { ClientDetailsView, ClientSetupView } from './types';
import { resolveStep, wizardSteps } from './wizard-steps';

export const dynamic = 'force-dynamic';

type Ctx = Awaited<ReturnType<typeof requireContext>>['ctx'];
type BillingRow = { clientId: string; nextPriceCents?: number | null; setupFeeCents?: number | null };

/**
 * 11b spec §7: monthly price = this client's stored price ?? the agency default; setup fee = the client's stored fee ?? the
 * agency default (the "0 if paid before" rule stays in `enable_client_billing`). Existing reads only; a refusal just hides the form.
 */
async function billingPrefill(ctx: Ctx, clientId: string): Promise<{ prefill: BillingPrefill | null; row: BillingRow | undefined }> {
  const [connect, list] = await Promise.all([
    tryCallTool<{ status: string; chargesEnabled: boolean; defaultPriceCents: number | null; defaultSetupFeeCents: number | null }>(ctx, 'get_connect_status', {}),
    tryCallTool<{ clients: BillingRow[] }>(ctx, 'list_client_billing_status', {}),
  ]);
  const row = list?.clients.find((c) => c.clientId === clientId);
  if (!connect) return { prefill: null, row };
  return {
    prefill: { ready: connect.status === 'connected' && connect.chargesEnabled, priceCents: row?.nextPriceCents ?? connect.defaultPriceCents, setupFeeCents: row?.setupFeeCents ?? connect.defaultSetupFeeCents },
    row,
  };
}

/**
 * Spec 16 §6. `get_client_setup` refuses (-> 404) anyone but agency staff and, only while asked to pick, the owner (P8): an
 * owner never opens this page (they go to their Overview). Staff may still open a finished setup: it shows the "All set" screen.
 */
const loadSetup = cache(async (clientId: string) => {
  const { ctx, viewer } = await requireContext();
  if (!isAgencyRole(ctx.role)) redirect(`/c/${clientId}`);
  const [view, profile, details] = await Promise.all([
    callTool<ClientSetupView>(ctx, 'get_client_setup', { clientId }),
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    callTool<ClientDetailsView>(ctx, 'get_client_details', { clientId }),
  ]);
  return { ctx, viewer, view, profile, details };
});

const titleOf = (profile: ClientProfile) => `Set up ${profile.name}`;

/** The tab title matches the page's own heading; one read per request, shared with the page. */
export async function generateMetadata({ params }: { params: Promise<{ clientId: string }> }): Promise<Metadata> {
  return { title: titleOf((await loadSetup((await params).clientId)).profile) };
}

const firstNameOf = (full: string | null | undefined) => full?.trim().split(/\s+/)[0] || null;
const dollars = (cents: number) => `$${cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default async function SetupPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ step?: string }> }) {
  const { clientId } = await params;
  const { step: requested } = await searchParams;
  const { ctx, viewer, view, profile, details } = await loadSetup(clientId);
  const { state } = view;
  const admin = ctx.role === 'agency_admin';
  const prospect = state.totalSteps === 5;
  const steps = wizardSteps(admin, state.totalSteps);
  const { branding } = await themeForViewer(viewer);
  const guide = (await helpGuides(ctx, 'client', clientId)).has('page:client.setup');
  const brand = { kind: 'agency' as const, name: branding.displayName, logoUrl: branding.logoUrl, style: {} };
  const exitHref = prospect ? '/agency/prospects' : '/agency';

  if (state.dismissedAt) {
    return (
      <OnboardingShell brand={brand} exit={{ href: exitHref, label: 'Close' }} title="Setup dismissed" subtitle={`The setup for ${profile.name} was dismissed.`} helpKey="page:client.setup" guide={guide}>
        <p className="text-sm text-muted-ink">
          Everything can still be edited in{' '}
          <Link href={`/c/${clientId}/settings/profile`} className="font-semibold text-secondary">settings</Link>, and competitors on the{' '}
          <Link href={`/c/${clientId}/competitors`} className="font-semibold text-secondary">Competitors</Link> page.
        </p>
      </OnboardingShell>
    );
  }

  const current = resolveStep(requested, state, steps);
  const wantBilling = admin && state.steps.billing !== undefined && (current === 'billing' || current === 'done');
  const { prefill, row } = wantBilling ? await billingPrefill(ctx, clientId) : { prefill: null, row: undefined };

  const accepted = view.competitorSuggestions.filter((s) => s.status === 'accepted').length;
  const owner = firstNameOf(view.invite.name) ?? firstNameOf(details.contactName);
  const miles = profile.serviceArea ? Math.round(kmToMiles(profile.serviceArea.radiusKm)) : null;
  const place = details.address?.city ?? view.lookup?.city ?? null;
  const billingDone = state.steps.billing === 'done';
  const summary: DoneSummary = {
    business: details.name,
    contact: [details.contactName, details.phone].filter(Boolean).join(' · ') || 'No contact added',
    area: [plural(profile.keywords.length, 'keyword', 'keywords'), miles !== null ? `${miles} mi${place ? ` around ${place}` : ''}` : null].filter(Boolean).join(' · '),
    competitorsWaiting: state.competitors === 'waiting_owner',
    competitors: state.competitors === 'waiting_owner' ? `Waiting on ${owner ?? 'the owner'} to pick competitors` : state.competitors === 'skipped' ? 'Skipped' : accepted > 0 ? `${accepted} picked` : 'None picked',
    owner: view.invite.status === 'accepted' ? `${firstNameOf(view.invite.name) ?? 'The owner'} accepted` : view.invite.status === 'pending' ? `Invite sent to ${firstNameOf(view.invite.name) ?? 'the owner'}` : 'Not invited yet',
    billing: state.steps.billing === undefined || !admin ? null : billingDone ? `${row?.nextPriceCents != null ? `${dollars(row.nextPriceCents)}/month · ` : ''}payment link sent` : 'Not turned on',
  };

  return (
    <SetupWizard
      clientId={clientId} clientName={profile.name} agency={{ name: branding.displayName, logoUrl: branding.logoUrl }} prospect={prospect}
      steps={steps} current={current} view={view} maxKeywords={MAX_KEYWORDS} guide={guide} exitHref={exitHref}
      profile={{ services: profile.services, keywords: profile.keywords, placeId: profile.placeId, serviceArea: profile.serviceArea }}
      contact={details.contactName || details.contactEmail ? { name: details.contactName, email: details.contactEmail } : null}
      around={details.address ? `${details.address.line1}, ${details.address.city}` : (view.lookup?.address?.split(',').slice(0, 2).join(',').trim() ?? null)}
      billing={prefill} summary={summary}
    />
  );
}
