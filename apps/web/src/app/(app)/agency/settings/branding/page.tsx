import type { AgencyBranding } from '@cs/db';
import type { Branding } from '@cs/email';
import { notFound } from 'next/navigation';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { BrandingForm } from './branding-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Branding & voice' };

const HELP_KEY = 'page:agency.settings.branding';
const COPY = PAGE_COPY['agency.settings.branding'];

export default async function BrandingPage() {
  const { ctx } = await requireContext();
  if (ctx.role !== 'agency_admin') notFound();
  const [{ stored, resolved }, guides] = await Promise.all([
    callTool<{ stored: AgencyBranding; resolved: Branding }>(ctx, 'get_agency_branding', {}),
    helpGuides(ctx, 'agency'),
  ]);

  return (
    <>
      <PageHeader
        title="Branding & voice"
        breadcrumb={[{ label: 'Agency settings', href: '/agency/settings' }, { label: 'Branding & voice' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <TipRow
        items={[
          { label: 'Name', tip: 'agency.settings.branding.displayName' },
          { label: 'Logo', tip: 'agency.settings.branding.logo' },
          { label: 'Colours', tip: 'agency.settings.branding.colours' },
          { label: 'Sender', tip: 'agency.settings.branding.sender' },
          { label: 'Assistant', tip: 'agency.settings.branding.assistant' },
        ]}
      />
      <BrandingForm initial={stored} agencyName={resolved.displayName} />
    </>
  );
}
