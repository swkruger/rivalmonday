import { isAgencyRole } from '@cs/core';
import type { ClientProfile } from '@cs/tools';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { kmToMiles } from '@/lib/format';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { themeForViewer } from '@/server/theme';
import { callTool } from '@/server/tools';
import type { ClientSetupView } from '../types';
import { OwnerCompetitors } from './owner-competitors';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Choose competitors' };

const HELP_KEY = 'page:client.setup.competitors';

/**
 * Spec 16 §7 / P8: the owner's competitor pick, only while the agency asked for it (`waiting_owner`). Staff go to their own
 * wizard; anyone else, and an owner outside that window, gets a 404 (P13: `get_client_setup` also refuses them itself).
 */
export default async function OwnerCompetitorsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { ctx, viewer } = await requireContext();
  if (isAgencyRole(ctx.role)) redirect(`/c/${clientId}/setup`);
  if (ctx.role !== 'client_owner') notFound();
  const [view, profile] = await Promise.all([
    callTool<ClientSetupView>(ctx, 'get_client_setup', { clientId }),
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
  ]);
  if (view.state.competitors !== 'waiting_owner') notFound();
  const { branding } = await themeForViewer(viewer);
  const guide = (await helpGuides(ctx, 'client', clientId)).has(HELP_KEY);
  return (
    <OwnerCompetitors
      clientId={clientId} clientName={profile.name} agency={{ name: branding.displayName, logoUrl: branding.logoUrl }}
      place={view.lookup?.city ?? null} keywordCount={profile.keywords.length} guide={guide} view={view}
      radiusMiles={profile.serviceArea ? Math.round(kmToMiles(profile.serviceArea.radiusKm)) : 10}
    />
  );
}
