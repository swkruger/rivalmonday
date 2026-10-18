import { notFound } from 'next/navigation';
import { IntakeLinkCard, type IntakeLinkState } from '@/components/agency/intake-link-card';
import { PageHeader } from '@/components/page-header';
import { requireContext } from '@/server/current-viewer';
import { themeForViewer } from '@/server/theme';
import { callTool } from '@/server/tools';
import { saveIntakeSlugAction, setIntakeEnabledAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Intake link' };

/** Phase 11c §5 (ruling G): agency admins only; any other role, and a support session, gets a 404. */
export default async function IntakeSettingsPage() {
  const { viewer, ctx } = await requireContext();
  if (viewer.kind !== 'user' || ctx.role !== 'agency_admin') notFound();
  const [link, theme] = await Promise.all([callTool<IntakeLinkState>(ctx, 'get_intake_link', {}), themeForViewer(viewer)]);
  return (
    <>
      <PageHeader
        title="Intake link"
        breadcrumb={[{ label: 'Agency settings', href: '/agency/settings' }, { label: 'Intake link' }]}
        description="A public page where businesses ask for a free competitor snapshot. New requests appear under Leads."
      />
      <IntakeLinkCard link={link} primary={theme.branding.primary} save={saveIntakeSlugAction} toggle={setIntakeEnabledAction} />
    </>
  );
}
