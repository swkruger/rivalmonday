import { getAgencyBranding } from '@cs/tools';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { BrandingForm } from './branding-form';

export const dynamic = 'force-dynamic';

export default async function BrandingPage() {
  const { ctx } = await requireContext();
  if (ctx.role !== 'agency_admin') notFound();
  const { stored, resolved } = await getAgencyBranding(dbs().service, ctx);

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Branding</h1>
      <p className="text-muted-foreground">Make Rival Monday look like your agency. Your clients never see our name.</p>
      <BrandingForm initial={stored} agencyName={resolved.displayName} />
    </>
  );
}
