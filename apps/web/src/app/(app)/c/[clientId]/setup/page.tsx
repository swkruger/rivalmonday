import { isAgencyRole } from '@cs/core';
import type { ClientProfile } from '@cs/tools';
import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { clientCrumbs } from '@/components/client-crumbs';
import { PageHeader } from '@/components/page-header';
import { requireContext } from '@/server/current-viewer';
import { callTool, tryCallTool } from '@/server/tools';
import { SetupWizard } from './setup-wizard';
import type { BillingPrefill } from './steps/billing-step';
import type { ClientSetupView } from './types';
import { wizardStep } from './wizard-steps';

export const dynamic = 'force-dynamic';

const STEP_LABEL = { profile: 'Your business', search: 'Finding competitors', competitors: 'Pick competitors', invite: 'Invite the owner', billing: 'Billing' } as const;
const STATUS_LABEL = { todo: 'Not started', running: 'Running', done: 'Done', skipped: 'Skipped', blocked: 'Needs attention' } as const;

type Ctx = Awaited<ReturnType<typeof requireContext>>['ctx'];

/**
 * 11b spec §7: monthly price = this client's stored price ?? the agency default; setup fee = the client's stored fee ?? the
 * agency default (the "0 if paid before" rule stays in `enable_client_billing`). Existing reads only; a refusal just hides the form.
 */
async function billingPrefill(ctx: Ctx, clientId: string): Promise<BillingPrefill | null> {
  const [connect, list] = await Promise.all([
    tryCallTool<{ status: string; chargesEnabled: boolean; defaultPriceCents: number | null; defaultSetupFeeCents: number | null }>(ctx, 'get_connect_status', {}),
    tryCallTool<{ clients: { clientId: string; nextPriceCents?: number | null; setupFeeCents?: number | null }[] }>(ctx, 'list_client_billing_status', {}),
  ]);
  if (!connect) return null;
  const row = list?.clients.find((c) => c.clientId === clientId);
  return {
    ready: connect.status === 'connected' && connect.chargesEnabled,
    priceCents: row?.nextPriceCents ?? connect.defaultPriceCents,
    setupFeeCents: row?.setupFeeCents ?? connect.defaultSetupFeeCents,
  };
}

/**
 * Spec §7. `get_client_setup` refuses (-> 404) anyone but agency staff and the client's owner, and a client owner once
 * the setup is closed; staff may still open a finished or dismissed setup, read-only.
 */
const loadSetup = cache(async (clientId: string) => {
  const { ctx } = await requireContext();
  const [view, profile] = await Promise.all([
    callTool<ClientSetupView>(ctx, 'get_client_setup', { clientId }),
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
  ]);
  return { ctx, view, profile };
});

const titleOf = (profile: ClientProfile) => `Set up ${profile.name}`;

/** The tab title matches the h1; one read per request, shared with the page. */
export async function generateMetadata({ params }: { params: Promise<{ clientId: string }> }): Promise<Metadata> {
  return { title: titleOf((await loadSetup((await params).clientId)).profile) };
}

export default async function SetupPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { ctx, view, profile } = await loadSetup(clientId);
  const agency = isAgencyRole(ctx.role);
  const { state } = view;
  const title = titleOf(profile);
  const crumbs = clientCrumbs({ id: clientId, name: profile.name }, 'Setup');

  if (!state.open) {
    return (
      <>
        <PageHeader title={title} breadcrumb={crumbs} />
        <section className="flex max-w-2xl flex-col gap-4 rounded-[14px] bg-surface p-6 shadow-card">
          <h2 className="font-semibold">{state.dismissedAt ? 'Setup dismissed' : 'Setup finished'}</h2>
          <ul className="flex flex-col gap-1.5">
            {(Object.keys(STEP_LABEL) as (keyof typeof STEP_LABEL)[]).filter((k) => state.steps[k] !== undefined).map((k) => (
              <li key={k} className="flex items-center justify-between gap-3 rounded-lg bg-muted-surface px-3 py-2">
                <span>{STEP_LABEL[k]}</span>
                <span className="text-sm font-semibold">{STATUS_LABEL[state.steps[k]!]}</span>
              </li>
            ))}
          </ul>
          {agency && (
            <p className="text-muted-foreground">
              Everything can still be edited in{' '}
              <Link href={`/c/${clientId}/settings/profile`} className="font-semibold text-primary-soft-text">settings</Link>, and competitors on the{' '}
              <Link href={`/c/${clientId}/competitors`} className="font-semibold text-primary-soft-text">Competitors</Link> page.
            </p>
          )}
        </section>
      </>
    );
  }

  const isAdmin = ctx.role === 'agency_admin';
  const billing = isAdmin && state.steps.billing !== undefined ? await billingPrefill(ctx, clientId) : null;
  return (
    <>
      <PageHeader title={title} breadcrumb={crumbs} step={wizardStep(view, agency)} />
      <SetupWizard
        clientId={clientId} agency={agency} isAdmin={isAdmin} view={view} billing={billing}
        profile={{ services: profile.services, keywords: profile.keywords, placeId: profile.placeId, serviceArea: profile.serviceArea }}
      />
    </>
  );
}
