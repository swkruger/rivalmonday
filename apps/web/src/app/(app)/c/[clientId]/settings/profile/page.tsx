import { isAgencyRole } from '@cs/core';
import type { ClientProfile } from '@cs/tools';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClientProfileForm } from '@/components/client-profile-form';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { verticalOptions } from '@/server/verticals';
import { updateProfileAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function ClientProfilePage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const p = await callTool<ClientProfile>(ctx, 'get_client_profile', { clientId });
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Profile — {p.name}</h1>
      <p className="text-muted-foreground">
        Time zone and delivery live under <Link href={`/c/${clientId}/settings/delivery`} className="font-semibold text-primary-soft-text">Delivery</Link>.
      </p>
      <ClientProfileForm
        mode="edit" action={updateProfileAction} verticals={await verticalOptions()} clientId={clientId}
        initial={{ name: p.name, verticalId: p.verticalId, services: p.services, keywords: p.keywords, placeId: p.placeId, serviceArea: p.serviceArea }}
      />
    </>
  );
}
