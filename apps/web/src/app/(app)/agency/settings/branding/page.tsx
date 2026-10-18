import { getAgencyBranding } from '@cs/tools';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { BrandingForm } from './branding-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Branding & voice' };

export default async function BrandingPage() {
  const { ctx } = await requireContext();
  if (ctx.role !== 'agency_admin') notFound();
  const { stored, resolved } = await getAgencyBranding(dbs().service, ctx);

  return (
    <>
      <PageHeader
        title="Branding & voice"
        breadcrumb={[{ label: 'Agency settings', href: '/agency/settings' }, { label: 'Branding & voice' }]}
        description="Make Rival Monday look like your agency. Your clients never see our name."
      />
      <BrandingForm initial={stored} agencyName={resolved.displayName} />
    </>
  );
}
